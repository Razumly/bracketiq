import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import { buildTeam, buildUser } from '../../../../test/factories';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    const { src, alt, fill, unoptimized, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={typeof src === 'string' ? src : ''} alt={alt ?? ''} {...rest} />;
  },
}));

jest.mock('@/app/providers', () => ({
  useApp: jest.fn(),
}));

jest.mock('@/lib/userService', () => ({
  userService: {
    getUsersByIds: jest.fn(),
    listInvites: jest.fn(),
    searchUsers: jest.fn(),
    getUserById: jest.fn(),
    deleteInviteById: jest.fn(),
    remindTeamInvitation: jest.fn(),
  },
}));

jest.mock('@/lib/teamService', () => ({
  teamService: {
    getInviteFreeAgentContext: jest.fn(),
    inviteUserToTeamRole: jest.fn(),
    inviteEmailToTeamRole: jest.fn(),
    createTeamMemberInvite: jest.fn(),
    getTeamById: jest.fn(),
    updateTeamDetails: jest.fn(),
    getRegistrationQuestions: jest.fn(),
    getTeamJoinRequestContext: jest.fn(),
    listTeamJoinRequests: jest.fn(),
    requestToJoinTeam: jest.fn(),
    registerSelfForTeam: jest.fn(),
    registerChildForTeam: jest.fn(),
  },
}));
jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(async (path: string) => {
    if (path.includes('/templates')) {
      return { templates: [] };
    }
    if (path.includes('/compliance')) {
      return { team: null };
    }
    return {};
  }),
  isApiRequestError: jest.fn(() => false),
}));
jest.mock('@/lib/familyService', () => ({
  familyService: {
    listChildren: jest.fn(),
  },
}));
jest.mock('@/lib/paymentService', () => ({
  paymentService: {
    createTeamRegistrationPaymentIntent: jest.fn(),
  },
}));
jest.mock('@mantine/notifications', () => {
  const actual = jest.requireActual('@mantine/notifications');
  return {
    ...actual,
    notifications: {
      ...actual.notifications,
      show: jest.fn(),
    },
  };
});
jest.mock('@/lib/boldsignService', () => ({
  boldsignService: {
    createSignLinks: jest.fn(),
    getOperationStatus: jest.fn(),
  },
}));
jest.mock('@/lib/signedDocumentService', () => ({
  signedDocumentService: {
    isDocumentSigned: jest.fn(),
  },
}));
jest.mock('../TeamFinancePanel', () => ({
  __esModule: true,
  default: ({ teamId, organizationId, isActive, canManage }: any) => (
    <div data-testid="team-finance-panel">
      {`${teamId}:${organizationId}:${isActive}:${canManage}`}
    </div>
  ),
}));
jest.mock('@/components/schedule/ScheduleCalendarPanel', () => ({
  __esModule: true,
  default: ({ endpoint, title }: any) => (
    <div data-testid="team-schedule-panel">{`${title}:${endpoint}`}</div>
  ),
}));

import TeamDetailModal from '../TeamDetailModal';
import { useApp } from '@/app/providers';

const userServiceMock = jest.requireMock('@/lib/userService').userService as {
  getUsersByIds: jest.Mock;
  listInvites: jest.Mock;
  searchUsers: jest.Mock;
  getUserById: jest.Mock;
  deleteInviteById: jest.Mock;
  remindTeamInvitation: jest.Mock;
};
const apiRequestMock = jest.requireMock('@/lib/apiClient').apiRequest as jest.Mock;
const teamServiceMock = jest.requireMock('@/lib/teamService').teamService as {
  getInviteFreeAgentContext: jest.Mock;
  inviteUserToTeamRole: jest.Mock;
  inviteEmailToTeamRole: jest.Mock;
  createTeamMemberInvite: jest.Mock;
  getTeamById: jest.Mock;
  updateTeamDetails: jest.Mock;
  getRegistrationQuestions: jest.Mock;
  getTeamJoinRequestContext: jest.Mock;
  listTeamJoinRequests: jest.Mock;
  requestToJoinTeam: jest.Mock;
  registerSelfForTeam: jest.Mock;
  registerChildForTeam: jest.Mock;
};
const familyServiceMock = jest.requireMock('@/lib/familyService').familyService as {
  listChildren: jest.Mock;
};

describe('TeamDetailModal', () => {
  beforeEach(() => {
    (useApp as jest.Mock).mockReturnValue({
      user: null,
      authUser: null,
    });
    userServiceMock.deleteInviteById.mockReset();
    userServiceMock.deleteInviteById.mockResolvedValue(true);
    userServiceMock.remindTeamInvitation.mockReset();
    userServiceMock.remindTeamInvitation.mockResolvedValue({ delivery: { failed: false } });
    apiRequestMock.mockClear();
    userServiceMock.getUsersByIds.mockReset();
    userServiceMock.listInvites.mockReset();
    userServiceMock.searchUsers.mockReset();
    userServiceMock.getUserById.mockReset();
    teamServiceMock.getInviteFreeAgentContext.mockReset();
    teamServiceMock.inviteUserToTeamRole.mockReset();
    teamServiceMock.inviteEmailToTeamRole.mockReset();
    teamServiceMock.createTeamMemberInvite.mockReset();
    teamServiceMock.getTeamById.mockReset();
    teamServiceMock.updateTeamDetails.mockReset();
    teamServiceMock.getRegistrationQuestions.mockReset();
    teamServiceMock.getTeamJoinRequestContext.mockReset();
    teamServiceMock.listTeamJoinRequests.mockReset();
    teamServiceMock.requestToJoinTeam.mockReset();
    teamServiceMock.registerSelfForTeam.mockReset();
    teamServiceMock.registerChildForTeam.mockReset();
    familyServiceMock.listChildren.mockReset();
    userServiceMock.getUsersByIds.mockResolvedValue([]);
    userServiceMock.listInvites.mockResolvedValue([]);
    userServiceMock.searchUsers.mockResolvedValue([]);
    userServiceMock.getUserById.mockResolvedValue(undefined);
    teamServiceMock.getInviteFreeAgentContext.mockResolvedValue({
      users: [],
      eventIds: [],
      freeAgentIds: [],
      eventTeams: [],
      freeAgentEventsByUserId: {},
      freeAgentEventTeamIdsByUserId: {},
    });
    teamServiceMock.inviteUserToTeamRole.mockResolvedValue(true);
    teamServiceMock.inviteEmailToTeamRole.mockResolvedValue(true);
    teamServiceMock.createTeamMemberInvite.mockResolvedValue({ ok: true, shareUrl: null });
    teamServiceMock.getTeamById.mockResolvedValue(undefined);
    teamServiceMock.updateTeamDetails.mockResolvedValue(undefined);
    teamServiceMock.getRegistrationQuestions.mockResolvedValue([]);
    teamServiceMock.getTeamJoinRequestContext.mockResolvedValue({
      questions: [],
      currentRequest: null,
      joinPolicy: 'CLOSED',
      openRegistration: false,
      registrationPriceCents: 0,
    });
    teamServiceMock.listTeamJoinRequests.mockResolvedValue([]);
    teamServiceMock.requestToJoinTeam.mockResolvedValue({
      id: 'request_1',
      status: 'PENDING',
    });
    teamServiceMock.registerSelfForTeam.mockResolvedValue({});
    teamServiceMock.registerChildForTeam.mockResolvedValue({});
    familyServiceMock.listChildren.mockResolvedValue([]);
  });

  it('renders safely when eventFreeAgents prop is omitted', () => {
    const team = buildTeam({
      captainId: 'captain_1',
      playerIds: [],
      pending: [],
      teamSize: 6,
    });

    expect(() => {
      renderWithMantine(
        <TeamDetailModal
          currentTeam={team}
          isOpen={false}
          onClose={jest.fn()}
        />,
      );
    }).not.toThrow();
  });

  it('uses jersey numbers for registered team player avatars', async () => {
    const player = buildUser({
      $id: 'player_1',
      firstName: 'Alex',
      lastName: 'Stone',
      fullName: 'Alex Stone',
    });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'player_1',
      managerId: '',
      playerIds: ['player_1'],
      pending: [],
      playerRegistrations: [{
        id: 'registration_1',
        teamId: 'team_1',
        userId: 'player_1',
        status: 'ACTIVE',
        jerseyNumber: '12',
      }],
      teamSize: 6,
    });
    userServiceMock.getUsersByIds.mockResolvedValueOnce([player]);

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Alex Stone')).toBeInTheDocument();
      expect(screen.getByAltText('Alex Stone')).toHaveAttribute(
        'src',
        expect.stringContaining('name=12'),
      );
    });
  });

  it('opens team detail editing in a modal and keeps jersey inputs on player cards', async () => {
    const players = [
      buildUser({
        $id: 'player_1',
        firstName: 'Alex',
        lastName: 'Stone',
        fullName: 'Alex Stone',
      }),
      buildUser({
        $id: 'player_2',
        firstName: 'Casey',
        lastName: 'Lane',
        fullName: 'Casey Lane',
      }),
    ];
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'player_1',
      managerId: '',
      playerIds: ['player_1', 'player_2'],
      pending: [],
      playerRegistrations: [
        {
          id: 'registration_1',
          teamId: 'team_1',
          userId: 'player_1',
          status: 'ACTIVE',
          jerseyNumber: '12',
        },
        {
          id: 'registration_2',
          teamId: 'team_1',
          userId: 'player_2',
          status: 'ACTIVE',
          jerseyNumber: '23',
        },
      ],
      teamSize: 6,
    });
    userServiceMock.getUsersByIds.mockResolvedValueOnce(players);

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage
        variant="page"
        activeTab="roster"
      />,
    );

    const alexJerseyInput = await screen.findByLabelText('Jersey number for Alex Stone');
    expect(alexJerseyInput).toHaveValue('12');
    expect(screen.getByLabelText('Jersey number for Casey Lane')).toHaveValue('23');
    expect(
      Boolean(screen.getByText('Captain').compareDocumentPosition(alexJerseyInput) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(screen.queryByText('Player jersey numbers')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Team Details' }));

    const editDialog = await screen.findByRole('dialog', { name: 'Edit Team Details' });
    expect(within(editDialog).getByLabelText('Sport', { selector: 'input' })).toBeInTheDocument();
    expect(within(editDialog).getByLabelText('Team Size')).toBeInTheDocument();
    expect(within(editDialog).getByRole('button', { name: 'Save Team Details' })).toBeInTheDocument();
    expect(within(editDialog).queryByText('Player jersey numbers')).not.toBeInTheDocument();
  });

  it('saves jersey numbers from roster player cards', async () => {
    const player = buildUser({
      $id: 'player_1',
      firstName: 'Alex',
      lastName: 'Stone',
      fullName: 'Alex Stone',
    });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'player_1',
      managerId: '',
      playerIds: ['player_1'],
      pending: [],
      playerRegistrations: [{
        id: 'registration_1',
        teamId: 'team_1',
        userId: 'player_1',
        status: 'ACTIVE',
        jerseyNumber: '12',
      }],
      teamSize: 6,
    });
    const updatedTeam = buildTeam({
      ...team,
      playerRegistrations: [{
        id: 'registration_1',
        teamId: 'team_1',
        userId: 'player_1',
        status: 'ACTIVE',
        jerseyNumber: '18',
        isCaptain: true,
      }],
    });
    const onTeamUpdated = jest.fn();
    userServiceMock.getUsersByIds.mockResolvedValueOnce([player]);
    teamServiceMock.updateTeamDetails.mockResolvedValueOnce(updatedTeam);

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        onTeamUpdated={onTeamUpdated}
        canManage
      />,
    );

    const jerseyInput = await screen.findByLabelText('Jersey number for Alex Stone');
    expect(jerseyInput).toHaveValue('12');

    fireEvent.change(jerseyInput, { target: { value: '18A' } });
    expect(jerseyInput).toHaveValue('18');

    fireEvent.click(screen.getByRole('button', { name: 'Save jersey number for Alex Stone' }));

    await waitFor(() => {
      expect(teamServiceMock.updateTeamDetails).toHaveBeenCalledWith('team_1', {
        playerRegistrations: [
          expect.objectContaining({
            id: 'registration_1',
            teamId: 'team_1',
            userId: 'player_1',
            status: 'ACTIVE',
            jerseyNumber: '18',
            position: null,
            isCaptain: true,
          }),
        ],
      });
    });
    expect(onTeamUpdated).toHaveBeenCalledWith(updatedTeam);
  });

  it('renders roster player cards in the responsive grid', async () => {
    const players = [
      buildUser({
        $id: 'player_1',
        firstName: 'Alexandria',
        lastName: 'Stone',
        fullName: 'Alexandria Stone',
        userName: 'alexandria.stone',
      }),
      buildUser({
        $id: 'player_2',
        firstName: 'Benjamin',
        lastName: 'Rivers',
        fullName: 'Benjamin Rivers',
        userName: 'benjamin.rivers',
      }),
    ];
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'player_1',
      managerId: '',
      playerIds: ['player_1', 'player_2'],
      pending: [],
      teamSize: 6,
    });
    userServiceMock.getUsersByIds.mockResolvedValueOnce(players);

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Roster (2)' })).toBeInTheDocument();
      expect(screen.queryByText(/^Team Members/i)).not.toBeInTheDocument();
      expect(screen.getByText('Alexandria Stone')).toBeInTheDocument();
      expect(screen.getByText('Benjamin Rivers')).toBeInTheDocument();
    });

    const rosterGrid = document.querySelector('.responsive-card-grid.team-roster-player-grid');
    expect(rosterGrid).not.toBeNull();
    expect(rosterGrid?.querySelectorAll('.team-roster-player-card')).toHaveLength(2);
  });

  it('renders roster, schedule, and finance as page tabs for organization teams', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    (useApp as jest.Mock).mockReturnValue({
      user: manager,
      authUser: { email: 'morgan@example.com' },
    });
    const team = buildTeam({
      $id: 'team_1',
      organizationId: 'org_1',
      captainId: 'manager_1',
      managerId: 'manager_1',
      playerIds: [],
      pending: [],
      teamSize: 6,
    });
    const onActiveTabChange = jest.fn();
    const { unmount } = renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage={false}
        variant="page"
        activeTab="roster"
        onActiveTabChange={onActiveTabChange}
      />,
    );

    expect(screen.getByText('Roster')).toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByText('Player Slots')).toBeInTheDocument();
    expect(screen.queryByTestId('team-finance-panel')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(userServiceMock.listInvites).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText('Schedule'));
    expect(onActiveTabChange).toHaveBeenCalledWith('schedule');

    fireEvent.click(screen.getByText('Finance'));
    expect(onActiveTabChange).toHaveBeenCalledWith('finance');

    unmount();
    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage={false}
        variant="page"
        activeTab="finance"
        onActiveTabChange={onActiveTabChange}
      />,
    );

    expect(screen.getByText('Finance is available to team managers.')).toBeInTheDocument();
    expect(screen.queryByTestId('team-finance-panel')).not.toBeInTheDocument();
    expect(screen.queryByText('Player Slots')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(userServiceMock.listInvites).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'team_1', types: expect.any(Array) }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('places team staff directly after roster summary cards in page mode', async () => {
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'captain_1',
      managerId: '',
      playerIds: [],
      pending: [],
      teamSize: 6,
    });

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage={false}
        variant="page"
        activeTab="roster"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Team Staff' })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(userServiceMock.listInvites).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const playerSlots = screen.getByText('Player Slots');
    const pendingInvites = screen.getByText('Pending Invites');
    const teamStaff = screen.getByRole('heading', { name: 'Team Staff' });
    const roster = screen.getByRole('heading', { name: 'Roster (0)' });
    const isBefore = (before: Element, after: Element) => (
      Boolean(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING)
    );

    expect(isBefore(playerSlots, teamStaff)).toBe(true);
    expect(isBefore(pendingInvites, teamStaff)).toBe(true);
    expect(isBefore(teamStaff, roster)).toBe(true);
  });

  it('renders the schedule tab for non-organization team pages', async () => {
    const team = buildTeam({
      $id: 'team_1',
      organizationId: '',
      captainId: 'captain_1',
      managerId: '',
      playerIds: [],
      pending: [],
      teamSize: 6,
    });

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage={false}
        variant="page"
        activeTab="schedule"
      />,
    );

    expect(screen.getByText('Roster')).toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.queryByText('Finance')).not.toBeInTheDocument();
    expect(screen.getByTestId('team-schedule-panel')).toHaveTextContent(
      'Team Schedule:/api/teams/team_1/schedule?limit=300',
    );
    expect(screen.queryByText('Player Slots')).not.toBeInTheDocument();
  });

  it('allows a pending paid team registration to resume payment even when the team is full', async () => {
    const currentUser = buildUser({
      $id: 'player_1',
      firstName: 'Alex',
      lastName: 'Stone',
      fullName: 'Alex Stone',
    });
    (useApp as jest.Mock).mockReturnValue({
      user: currentUser,
      authUser: { email: 'alex@example.com' },
    });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'captain_1',
      managerId: '',
      playerIds: [],
      pending: [],
      openRegistration: true,
      registrationPriceCents: 2500,
      playerRegistrations: [{
        id: 'registration_1',
        teamId: 'team_1',
        userId: 'player_1',
        status: 'STARTED',
      }],
      teamSize: 1,
    });
    teamServiceMock.getTeamJoinRequestContext.mockResolvedValueOnce({
      questions: [],
      currentRequest: null,
      joinPolicy: 'OPEN_REGISTRATION',
      openRegistration: true,
      registrationPriceCents: 2500,
    });

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage={false}
      />,
    );

    expect(await screen.findByRole('button', { name: /resume payment/i })).toBeEnabled();
    expect(screen.getByText(/waiting for payment confirmation/i)).toBeInTheDocument();
    expect(screen.queryByText('This team is full.')).not.toBeInTheDocument();
  });

  it('registers an event team snapshot through its canonical parent team', async () => {
    const currentUser = buildUser({
      $id: 'player_1',
      firstName: 'Alex',
      lastName: 'Stone',
      fullName: 'Alex Stone',
    });
    (useApp as jest.Mock).mockReturnValue({
      user: currentUser,
      authUser: { email: 'alex@example.com' },
    });
    const eventTeam = buildTeam({
      $id: 'event_team_1',
      parentTeamId: 'team_1',
      name: 'Open Event Team',
      captainId: 'captain_1',
      managerId: 'manager_1',
      playerIds: [],
      pending: [],
      openRegistration: true,
      registrationPriceCents: 0,
      requiredTemplateIds: [],
      playerRegistrations: [],
      teamSize: 6,
    });
    const canonicalTeam = buildTeam({
      ...eventTeam,
      $id: 'team_1',
      parentTeamId: null,
      openRegistration: true,
    });
    teamServiceMock.getTeamById.mockResolvedValue(canonicalTeam);
    teamServiceMock.getTeamJoinRequestContext.mockResolvedValueOnce({
      questions: [],
      currentRequest: null,
      joinPolicy: 'OPEN_REGISTRATION',
      openRegistration: true,
      registrationPriceCents: 0,
    });
    teamServiceMock.registerSelfForTeam.mockResolvedValue({
      registrationId: 'team_1__player_1',
      status: 'ACTIVE',
      team: buildTeam({
        ...canonicalTeam,
        playerIds: ['player_1'],
        playerRegistrations: [{
          id: 'team_1__player_1',
          teamId: 'team_1',
          userId: 'player_1',
          status: 'ACTIVE',
        }],
      }),
    });

    renderWithMantine(
      <TeamDetailModal
        currentTeam={eventTeam}
        isOpen
        onClose={jest.fn()}
        canManage={false}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /join team/i }));

    await waitFor(() => {
      expect(teamServiceMock.registerSelfForTeam.mock.calls.some(([teamId]) => teamId === 'team_1')).toBe(true);
    });
    expect(teamServiceMock.registerSelfForTeam.mock.calls.some(([teamId]) => teamId === 'event_team_1')).toBe(false);
  });

  it('sends canonical team invites when inviting a free agent', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    const freeAgent = buildUser({
      $id: 'free_1',
      firstName: 'Free',
      lastName: 'Agent',
      fullName: 'Free Agent',
      userName: 'freeagent',
    });
    (useApp as jest.Mock).mockReturnValue({ user: manager });
    userServiceMock.getUserById.mockResolvedValue(freeAgent);
    teamServiceMock.getInviteFreeAgentContext.mockResolvedValue({
      users: [freeAgent],
      eventIds: ['event_1'],
      freeAgentIds: ['free_1'],
      eventTeams: [{
        eventId: 'event_1',
        eventTeamId: 'event_team_1',
        eventName: 'Future Event',
        eventStart: '2026-06-01T16:00:00.000Z',
        eventEnd: null,
        teamName: 'Test team',
      }],
      freeAgentEventsByUserId: {
        free_1: ['event_1'],
      },
      freeAgentEventTeamIdsByUserId: {
        free_1: ['event_team_1'],
      },
    });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'manager_1',
      managerId: 'manager_1',
      playerIds: [],
      pending: [],
      teamSize: 6,
      name: 'Test team',
    });

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /invite roster members/i }));
    expect(await screen.findByRole('tab', { name: /free agents/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /invite user/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /new person/i })).toBeInTheDocument();
    expect(await screen.findByText('Free Agent')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /select/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /^invite$/i })[0]);

    await waitFor(() => {
      expect(teamServiceMock.inviteUserToTeamRole).toHaveBeenCalledWith(
        team,
        freeAgent,
        'player',
      );
    });
    expect(screen.getByRole('dialog', { name: /invite to test team/i })).toBeInTheDocument();
  });

  it('saves an accountless coach with optional contact details and copies the registration link', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    (useApp as jest.Mock).mockReturnValue({ user: manager });
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    teamServiceMock.createTeamMemberInvite.mockResolvedValue({
      ok: true,
      invite: { $id: 'invite_coach_1' },
      shareUrl: 'http://localhost:3000/i/invite_coach_1?s=signed',
    });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'manager_1',
      managerId: 'manager_1',
      playerIds: ['manager_1'],
      pending: [],
      teamSize: 6,
      name: 'Test team',
    });

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /invite roster members/i }));
    fireEvent.click(await screen.findByRole('radio', { name: /assistant coach/i }));
    fireEvent.click(screen.getByRole('tab', { name: /new person/i }));
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Taylor' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Stone' } });
    fireEvent.change(screen.getByLabelText(/phone \(optional\)/i), { target: { value: '5035550142' } });
    fireEvent.click(screen.getByRole('button', { name: /save assistant coach invite/i }));

    await waitFor(() => {
      expect(teamServiceMock.createTeamMemberInvite).toHaveBeenCalledWith('team_1', {
        role: 'team_assistant_coach',
        firstName: 'Taylor',
        lastName: 'Stone',
        email: undefined,
        phone: '(503) 555-0142',
        shareOnly: true,
      });
    });
    fireEvent.click(await screen.findByRole('button', { name: /copy invite link/i }));
    expect(writeText).toHaveBeenCalledWith('http://localhost:3000/i/invite_coach_1?s=signed');
  });

  it('removes the replaced account manager immediately after a new-person invite refresh', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    (useApp as jest.Mock).mockReturnValue({ user: manager });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'manager_1',
      managerId: 'manager_1',
      playerIds: [],
      pending: [],
      teamSize: 6,
    });
    const refreshedTeam = {
      ...team,
      captainId: 'captain_1',
      managerId: '',
    };
    userServiceMock.getUsersByIds
      .mockResolvedValueOnce([manager])
      .mockResolvedValueOnce([]);
    teamServiceMock.getTeamById.mockResolvedValue(refreshedTeam);
    teamServiceMock.createTeamMemberInvite.mockResolvedValue({
      ok: true,
      invite: { $id: 'invite_manager_2' },
      shareUrl: null,
    });

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage
      />,
    );

    expect(await screen.findByText('Morgan Manager')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /invite roster members/i }));
    fireEvent.click(await screen.findByRole('radio', { name: /^manager$/i }));
    fireEvent.click(screen.getByRole('tab', { name: /new person/i }));
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Taylor' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Stone' } });
    fireEvent.click(screen.getByRole('button', { name: /save manager invite/i }));

    await waitFor(() => {
      expect(teamServiceMock.getTeamById).toHaveBeenCalledWith('team_1', true);
      expect(screen.queryByText('Morgan Manager')).not.toBeInTheDocument();
    });
  });

  it('shows an accountless player invite in the active roster with its entered name and role', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    (useApp as jest.Mock).mockReturnValue({ user: manager });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'manager_1',
      managerId: 'manager_1',
      playerIds: [],
      pending: [],
      teamSize: 6,
      name: 'Test team',
    });
    teamServiceMock.createTeamMemberInvite.mockResolvedValue({
      ok: true,
      invite: { $id: 'invite_player_1' },
      shareUrl: null,
    });
    teamServiceMock.getTeamById.mockResolvedValue(team);
    userServiceMock.listInvites
      .mockResolvedValueOnce([])
      .mockResolvedValue([{
        $id: 'invite_player_1',
        type: 'TEAM',
        teamId: 'team_1',
        status: 'PENDING',
        isAssigned: true,
        role: 'player',
        firstName: 'Alex',
        lastName: 'Player',
      }]);

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /invite roster members/i }));
    fireEvent.click(await screen.findByRole('tab', { name: /new person/i }));
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Player' } });
    expect(screen.getByLabelText('Email (optional)')).toHaveValue('');
    expect(screen.getByLabelText(/phone \(optional\)/i)).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: /save player invite/i }));

    await waitFor(() => {
      expect(teamServiceMock.createTeamMemberInvite).toHaveBeenCalledWith('team_1', {
        role: 'player',
        firstName: 'Alex',
        lastName: 'Player',
        email: undefined,
        phone: undefined,
        shareOnly: true,
      });
    });
    await waitFor(() => {
      expect(userServiceMock.listInvites).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'team_1', types: expect.any(Array) }));
    });
    expect(await within(document.querySelector<HTMLElement>('.responsive-card-grid.team-roster-player-grid')!).findByText('Alex Player')).toBeInTheDocument();
    expect(screen.getByText('Role: Player')).toBeInTheDocument();
    expect(screen.queryByText('Unknown user')).not.toBeInTheDocument();
    expect(await screen.findByText(/Roster \(1\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pending Invitations \(/i)).not.toBeInTheDocument();
    expect(within(document.querySelector<HTMLElement>('.responsive-card-grid.team-roster-player-grid')!).queryByText(/Invitation pending/i)).not.toBeInTheDocument();
  });
  it('keeps accountless players in the roster grid with copy, resend, edit, and remove actions', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    const regularPlayer = buildUser({
      $id: 'player_1',
      firstName: 'Regular',
      lastName: 'Player',
      fullName: 'Regular Player',
    });
    (useApp as jest.Mock).mockReturnValue({ user: manager });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'manager_1',
      managerId: 'manager_1',
      playerIds: ['player_1'],
      pending: [],
      teamSize: 6,
      name: 'Test team',
    });
    const invite = {
      $id: 'invite_player_1',
      type: 'TEAM' as const,
      teamId: 'team_1',
      status: 'PENDING' as const,
      isAssigned: true,
      role: 'player' as const,
      firstName: 'Alex',
      lastName: 'Player',
      email: 'alex@example.com',
      phone: '5035550142',
      shareUrl: 'https://example.com/invite/signed',
    };
    userServiceMock.getUsersByIds.mockResolvedValue([regularPlayer]);
    userServiceMock.listInvites.mockResolvedValue([invite]);
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    apiRequestMock.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (options?.method === 'PATCH' && path.includes('/member-invites/invite_player_1')) {
        return {
          invite: {
            ...invite,
            firstName: 'Updated',
            lastName: 'Player',
            email: 'updated@example.com',
            phone: '5035550199',
          },
          shareUrl: invite.shareUrl,
        };
      }
      return {};
    });

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage
      />,
    );

    expect(await screen.findByText('Regular Player')).toBeInTheDocument();
    expect(await within(document.querySelector<HTMLElement>('.responsive-card-grid.team-roster-player-grid')!).findByText('Alex Player')).toBeInTheDocument();
    const rosterGrid = document.querySelector('.responsive-card-grid.team-roster-player-grid');
    expect(rosterGrid).not.toBeNull();
    expect(rosterGrid?.querySelectorAll('.team-roster-player-card')).toHaveLength(2);
    expect(document.querySelectorAll('.responsive-card-grid.team-roster-player-grid')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Copy invite link for Alex Player' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(invite.shareUrl));
    expect(screen.getByRole('button', { name: 'Resend invite email for Alex Player' })).toBeInTheDocument();

    fireEvent.click(within(document.querySelector<HTMLElement>('.responsive-card-grid.team-roster-player-grid')!).getByText('Alex Player'));
    await screen.findByRole('dialog', { name: 'Edit player invite' });
    await screen.findByLabelText(/first name/i);
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Alex');
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Player');
    expect(screen.getByLabelText(/email \(optional\)/i)).toHaveValue('alex@example.com');
    expect(screen.getByLabelText(/phone \(optional\)/i)).toHaveValue('5035550142');
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Updated' } });
    fireEvent.change(screen.getByLabelText(/email \(optional\)/i), { target: { value: 'updated@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save player invite' }));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/teams/team_1/member-invites/invite_player_1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({
            firstName: 'Updated',
            lastName: 'Player',
            email: 'updated@example.com',
            phone: '5035550142',
          }),
        }),
      );
      expect(screen.queryByRole('dialog', { name: 'Edit player invite' })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Resend invite email for Updated Player' }));
    await waitFor(() => {
      expect(userServiceMock.remindTeamInvitation).toHaveBeenCalledWith(
        'invite_player_1',
        expect.any(String),
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove invite for Updated Player' }));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/teams/team_1/member-invites/invite_player_1',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(screen.queryByText('Updated Player')).not.toBeInTheDocument();
    });
  });


  it('counts an assigned player once after invite data refreshes', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    (useApp as jest.Mock).mockReturnValue({ user: manager });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'manager_1',
      managerId: 'manager_1',
      playerIds: [],
      pending: [],
      teamSize: 2,
      name: 'Test team',
    });
    const preexistingAssignedInvite = {
      $id: 'invite_existing_player',
      type: 'TEAM' as const,
      teamId: 'team_1',
      status: 'PENDING' as const,
      isAssigned: true,
      role: 'player' as const,
      firstName: 'Existing',
      lastName: 'Player',
    };
    const refreshedAssignedInvite = {
      ...preexistingAssignedInvite,
      $id: 'invite_player_1',
      firstName: 'Alex',
      lastName: 'Player',
    };
    teamServiceMock.createTeamMemberInvite.mockResolvedValue({
      ok: true,
      invite: { $id: 'invite_player_1' },
      shareUrl: null,
    });
    teamServiceMock.getTeamById.mockResolvedValue(team);
    userServiceMock.listInvites
      .mockResolvedValueOnce([preexistingAssignedInvite])
      .mockResolvedValueOnce([preexistingAssignedInvite])
      .mockResolvedValue([preexistingAssignedInvite, refreshedAssignedInvite]);

    const view = renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /invite roster members/i }));
    fireEvent.click(await screen.findByRole('tab', { name: /new person/i }));
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Player' } });
    fireEvent.click(screen.getByRole('button', { name: /save player invite/i }));

    await waitFor(() => {
      expect(screen.getByText(/already has 2 of 2 player slots filled/i)).toBeInTheDocument();
    });

    view.rerender(
      <MantineProvider>
        <TeamDetailModal
          currentTeam={{ ...team, captainId: 'captain_2' }}
          isOpen
          onClose={jest.fn()}
          canManage
        />
      </MantineProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('2/2')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Pending Invitations \(/i)).not.toBeInTheDocument();
    expect(within(document.querySelector<HTMLElement>('.responsive-card-grid.team-roster-player-grid')!).queryByText(/Invitation pending/i)).not.toBeInTheDocument();
  });

  it('shows only the replacement accountless manager', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    (useApp as jest.Mock).mockReturnValue({ user: manager });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'captain_1',
      managerId: '',
      playerIds: [],
      pending: [],
      teamSize: 6,
    });
    userServiceMock.getUsersByIds.mockResolvedValue([manager]);
    userServiceMock.listInvites.mockResolvedValue([{
      $id: 'invite_manager_1',
      type: 'TEAM',
      teamId: 'team_1',
      status: 'PENDING',
      isAssigned: true,
      role: 'team_manager',
      firstName: 'Taylor',
      lastName: 'Stone',
    }]);

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage={false}
      />,
    );

    expect(screen.queryByText('Morgan Manager')).not.toBeInTheDocument();
    expect(await screen.findByText('Taylor Stone')).toBeInTheDocument();
    expect(screen.queryByText(/Pending Staff Invitations \(/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Role: Manager')).not.toBeInTheDocument();
  });

  it('shows only the replacement accountless head coach', async () => {
    const headCoach = buildUser({
      $id: 'coach_1',
      firstName: 'Morgan',
      lastName: 'Coach',
      fullName: 'Morgan Coach',
    });
    (useApp as jest.Mock).mockReturnValue({ user: headCoach });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'captain_1',
      managerId: '',
      headCoachId: null,
      playerIds: [],
      pending: [],
      teamSize: 6,
    });
    userServiceMock.getUsersByIds.mockResolvedValue([headCoach]);
    userServiceMock.listInvites.mockResolvedValue([{
      $id: 'invite_head_coach_1',
      type: 'TEAM',
      teamId: 'team_1',
      status: 'PENDING',
      isAssigned: true,
      role: 'team_head_coach',
      firstName: 'Taylor',
      lastName: 'Coach',
    }]);

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage={false}
      />,
    );

    expect(screen.queryByText('Morgan Coach')).not.toBeInTheDocument();
    expect(await screen.findByText('Taylor Coach')).toBeInTheDocument();
    expect(screen.queryByText(/Pending Staff Invitations \(/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Role: Head Coach')).not.toBeInTheDocument();
  });

  it('keeps an accountless assistant slot from hiding another assistant candidate', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    const candidate = buildUser({
      $id: 'assistant_2',
      firstName: 'Jordan',
      lastName: 'Coach',
      fullName: 'Jordan Coach',
    });
    (useApp as jest.Mock).mockReturnValue({ user: manager });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'manager_1',
      managerId: 'manager_1',
      assistantCoachIds: [],
      playerIds: [],
      pending: [],
      teamSize: 6,
      name: 'Test team',
    });
    userServiceMock.getUsersByIds.mockResolvedValue([manager]);
    userServiceMock.listInvites.mockResolvedValue([{
      $id: 'invite_assistant_1',
      type: 'TEAM',
      teamId: 'team_1',
      status: 'PENDING',
      isAssigned: true,
      role: 'team_assistant_coach',
      firstName: 'Taylor',
      lastName: 'Stone',
    }]);
    userServiceMock.searchUsers.mockResolvedValue([candidate]);

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /invite roster members/i }));
    fireEvent.click(await screen.findByRole('radio', { name: /assistant coach/i }));
    fireEvent.click(screen.getByRole('tab', { name: /invite user/i }));
    fireEvent.change(
      screen.getByPlaceholderText(/search assistant coach/i),
      { target: { value: 'jo' } },
    );

    expect(await screen.findByText('Jordan Coach')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^invite$/i })).toBeEnabled();
  });

  it('does not count a reused accountless player invite twice', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    (useApp as jest.Mock).mockReturnValue({ user: manager });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'manager_1',
      managerId: 'manager_1',
      playerIds: [],
      pending: [],
      teamSize: 3,
      name: 'Test team',
    });
    const assignedInvite = {
      $id: 'invite_player_reused',
      type: 'TEAM' as const,
      teamId: 'team_1',
      status: 'PENDING' as const,
      isAssigned: true,
      role: 'player' as const,
      firstName: 'Alex',
      lastName: 'Player',
    };
    teamServiceMock.createTeamMemberInvite.mockResolvedValue({
      ok: true,
      invite: { $id: assignedInvite.$id },
      shareUrl: null,
    });
    teamServiceMock.getTeamById.mockResolvedValue(team);
    userServiceMock.listInvites
      .mockResolvedValueOnce([])
      .mockResolvedValue([assignedInvite]);

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /invite roster members/i }));
    fireEvent.click(await screen.findByRole('tab', { name: /new person/i }));
    const firstName = screen.getByLabelText(/first name/i);
    const lastName = screen.getByLabelText(/last name/i);
    fireEvent.change(firstName, { target: { value: 'Alex' } });
    fireEvent.change(lastName, { target: { value: 'Player' } });
    fireEvent.click(screen.getByRole('button', { name: /save player invite/i }));
    await waitFor(() => {
      expect(teamServiceMock.createTeamMemberInvite).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(firstName, { target: { value: 'Alex' } });
    fireEvent.change(lastName, { target: { value: 'Player' } });
    fireEvent.click(screen.getByRole('button', { name: /save player invite/i }));
    await waitFor(() => {
      expect(teamServiceMock.createTeamMemberInvite).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText(/Roster \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('counts distinct accountless player assignments once each', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    (useApp as jest.Mock).mockReturnValue({ user: manager });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'manager_1',
      managerId: 'manager_1',
      playerIds: [],
      pending: [],
      teamSize: 4,
      name: 'Test team',
    });
    const alexInvite = {
      $id: 'invite_player_alex',
      type: 'TEAM' as const,
      teamId: 'team_1',
      status: 'PENDING' as const,
      isAssigned: true,
      role: 'player' as const,
      firstName: 'Alex',
      lastName: 'Player',
    };
    const jordanInvite = {
      ...alexInvite,
      $id: 'invite_player_jordan',
      firstName: 'Jordan',
      lastName: 'Player',
    };
    teamServiceMock.createTeamMemberInvite
      .mockResolvedValueOnce({ ok: true, invite: { $id: alexInvite.$id }, shareUrl: null })
      .mockResolvedValueOnce({ ok: true, invite: { $id: jordanInvite.$id }, shareUrl: null });
    teamServiceMock.getTeamById.mockResolvedValue(team);
    userServiceMock.listInvites
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([alexInvite])
      .mockResolvedValue([alexInvite, jordanInvite]);

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /invite roster members/i }));
    fireEvent.click(await screen.findByRole('tab', { name: /new person/i }));
    const firstName = screen.getByLabelText(/first name/i);
    const lastName = screen.getByLabelText(/last name/i);
    fireEvent.change(firstName, { target: { value: 'Alex' } });
    fireEvent.change(lastName, { target: { value: 'Player' } });
    fireEvent.click(screen.getByRole('button', { name: /save player invite/i }));
    await waitFor(() => {
      expect(teamServiceMock.createTeamMemberInvite).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(firstName, { target: { value: 'Jordan' } });
    fireEvent.change(lastName, { target: { value: 'Player' } });
    fireEvent.click(screen.getByRole('button', { name: /save player invite/i }));
    await waitFor(() => {
      expect(teamServiceMock.createTeamMemberInvite).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText(/Roster \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('2/4')).toBeInTheDocument();
  });

  it('blocks player invites when team registration slots are full', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    (useApp as jest.Mock).mockReturnValue({ user: manager });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'manager_1',
      managerId: 'manager_1',
      playerIds: ['manager_1'],
      pending: ['pending_1'],
      playerRegistrations: [
        {
          id: 'team_1__manager_1',
          teamId: 'team_1',
          userId: 'manager_1',
          status: 'ACTIVE',
        },
        {
          id: 'team_1__pending_1',
          teamId: 'team_1',
          userId: 'pending_1',
          status: 'INVITED',
        },
      ],
      teamSize: 2,
      name: 'Test team',
    });

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /invite roster members/i }));

    expect(await screen.findByText(/already has 2 of 2 player slots filled/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /new person/i }));
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: 'New' },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: 'Player' },
    });
    fireEvent.change(screen.getByLabelText('Email (optional)'), {
      target: { value: 'new.player@example.com' },
    });

    expect(screen.getByRole('button', { name: /send player invite/i })).toBeDisabled();
  });
});
