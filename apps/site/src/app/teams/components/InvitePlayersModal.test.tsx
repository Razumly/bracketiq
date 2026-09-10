import React from 'react';
import type * as MantineCore from '@mantine/core';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { ApiRequestError } from '@/lib/apiClient';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import type { Invite, Team, UserData } from '@/types';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import InvitePlayersModal from './InvitePlayersModal';

const mockShowNotification = jest.fn();
jest.mock('@mantine/core', () => {
  const actual = jest.requireActual<typeof MantineCore>('@mantine/core');
  const ScrollAreaMock = Object.assign(
    ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    {
      Autosize: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    },
  );
  return {
    ...actual,
    ScrollArea: ScrollAreaMock,
    SegmentedControl: ({
      data,
      value,
      onChange,
    }: {
      data: Array<{ label: string; value: string }>;
      value: string;
      onChange: (value: string) => void;
    }) => React.createElement(
      'div',
      { role: 'radiogroup' },
      data.map((item) => React.createElement(
        'button',
        {
          key: item.value,
          type: 'button',
          'aria-pressed': item.value === value,
          onClick: () => onChange(item.value),
        },
        item.label,
      )),
    ),
  };
});

jest.mock('@mantine/notifications', () => ({
  Notifications: () => null,
  notifications: {
    show: (...args: unknown[]) => mockShowNotification(...args),
  },
}));

jest.mock('@/lib/teamService', () => ({
  teamService: {
    inviteUserToTeamRole: jest.fn(),
    createTeamMemberInvite: jest.fn(),
    getTeamById: jest.fn(),
  },
}));

jest.mock('@/lib/userService', () => ({
  userService: {
    getUserById: jest.fn(),
    searchUsers: jest.fn(),
  },
}));

const teamServiceMock = teamService as unknown as {
  inviteUserToTeamRole: jest.Mock;
  createTeamMemberInvite: jest.Mock;
  getTeamById: jest.Mock;
};
const userServiceMock = userService as unknown as {
  getUserById: jest.Mock;
  searchUsers: jest.Mock;
};

const buildTeam = (overrides: Partial<Team> = {}): Team => ({
  $id: 'team_1',
  name: 'Falcons',
  division: 'division_1',
  sport: 'Indoor Volleyball',
  playerIds: [],
  captainId: 'captain_1',
  managerId: 'manager_1',
  headCoachId: null,
  assistantCoachIds: [],
  coachIds: [],
  pending: [],
  teamSize: 6,
  currentSize: 0,
  isFull: false,
  avatarUrl: '',
  ...overrides,
});

const buildUser = (): UserData => ({
  $id: 'user_2',
  firstName: 'Jane',
  lastName: 'Doe',
  teamIds: [],
  friendIds: [],
  friendRequestIds: [],
  friendRequestSentIds: [],
  followingIds: [],
  blockedUserIds: [],
  hiddenEventIds: [],
  userName: 'jane_doe',
  uploadedImages: [],
  fullName: 'Jane Doe',
  avatarUrl: '',
});
const EMPTY_PENDING_ROLE_INVITES: never[] = [];

const openUserSearch = async (
  onPlayerInviteSent?: (user: UserData) => void | Promise<void>,
) => {
  const user = buildUser();
  const team = buildTeam();
  userServiceMock.searchUsers.mockResolvedValue([user]);
  userServiceMock.getUserById.mockResolvedValue(user);
  renderWithMantine(
    <InvitePlayersModal
      isOpen
      onClose={jest.fn()}
      team={team}
      pendingRoleInvites={EMPTY_PENDING_ROLE_INVITES}
      onPlayerInviteSent={onPlayerInviteSent}
    />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Invite User' }));
  fireEvent.change(screen.getByPlaceholderText('Search player (min 2 characters)'), {
    target: { value: 'Jane' },
  });
  await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
};

describe('InvitePlayersModal player invite failures', () => {
  it('keeps minor and guardian values when React repeats a state update', () => {
    renderWithMantine(<React.StrictMode><InvitePlayersModal
      isOpen onClose={jest.fn()} team={buildTeam()} eventRegistration={{ eventId: 'event_1' }}
    /></React.StrictMode>);
    fireEvent.click(screen.getByRole('tab', { name: 'New Person' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Is a minor' }));
    fireEvent.change(screen.getByLabelText(/Date of birth/), { target: { value: '2015-01-01' } });
    fireEvent.change(screen.getByLabelText(/Guardian email/), { target: { value: 'guardian@example.com' } });
    expect(screen.getByRole('checkbox', { name: 'Is a minor' })).toBeChecked();
    expect(screen.getByLabelText(/Date of birth/)).toHaveValue('2015-01-01');
    expect(screen.getByLabelText(/Guardian email/)).toHaveValue('guardian@example.com');
  });

  beforeEach(() => {
    mockShowNotification.mockReset();
    teamServiceMock.inviteUserToTeamRole.mockReset();
    teamServiceMock.createTeamMemberInvite.mockReset();
    teamServiceMock.getTeamById.mockReset();
    userServiceMock.getUserById.mockReset();
    userServiceMock.searchUsers.mockReset();
    teamServiceMock.inviteUserToTeamRole.mockResolvedValue(true);
  });

  it('searches once in Event signup when no pending-invitation list is supplied', async () => {
    userServiceMock.searchUsers.mockResolvedValue([buildUser()]);
    renderWithMantine(<InvitePlayersModal isOpen onClose={jest.fn()} team={buildTeam()}
      eventRegistration={{ eventId: 'event_1' }} />);
    expect(screen.queryByRole('tab', { name: 'Free Agents' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search player (min 2 characters)'), { target: { value: 'Jane' } });
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(userServiceMock.searchUsers).toHaveBeenCalledTimes(1);
  });

  it('counts pending roster profiles and their assigned player invites only once', () => {
    const pendingPlayerIds = ['pending_1', 'pending_2', 'pending_3', 'pending_4'];
    const team = buildTeam({
      teamSize: 8,
      playerIds: ['active_1'],
      pending: pendingPlayerIds,
      playerRegistrations: pendingPlayerIds.map((userId) => ({
        id: `registration_${userId}`,
        userId,
        status: 'INVITED',
      })),
    });
    const pendingRoleInvites: Array<{ invite: Invite }> = pendingPlayerIds.map((userId) => ({
      invite: {
        $id: `invite_${userId}`,
        type: 'TEAM',
        role: 'player',
        status: 'PENDING',
        isAssigned: true,
        userId,
        teamId: team.$id,
      },
    }));
    const onClose = jest.fn();
    const { container } = renderWithMantine(
      <InvitePlayersModal isOpen onClose={onClose} team={team} pendingRoleInvites={pendingRoleInvites} />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'New Person' }));
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: 'Doe' } });

    expect(screen.getByRole('button', { name: 'Save Player Invite' })).toBeEnabled();
    expect(screen.queryByText(/This team already has \d+ of 8 player slots filled/)).not.toBeInTheDocument();

    renderWithMantine(
      <InvitePlayersModal
        isOpen
        onClose={onClose}
        team={{ ...team, teamSize: 5 }}
        pendingRoleInvites={pendingRoleInvites}
      />,
      { container },
    );

    expect(screen.getByText(/This team already has 5 of 5 player slots filled/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Player Invite' })).toBeDisabled();
  });

  it('keeps an accountless player invite in capacity before and after the invite list refreshes', async () => {
    const team = buildTeam({ teamSize: 2, playerIds: ['active_1'] });
    const invite: Invite = {
      $id: 'accountless_invite',
      type: 'TEAM',
      role: 'player',
      status: 'PENDING',
      isAssigned: true,
      userId: null,
      firstName: 'Jane',
      lastName: 'Doe',
      teamId: team.$id,
    };
    teamServiceMock.createTeamMemberInvite.mockResolvedValue({ invite });
    teamServiceMock.getTeamById.mockResolvedValue(team);
    const onClose = jest.fn();
    const { container } = renderWithMantine(
      <InvitePlayersModal isOpen onClose={onClose} team={team} pendingRoleInvites={EMPTY_PENDING_ROLE_INVITES} />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'New Person' }));
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: 'Doe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Player Invite' }));
    await waitFor(() => expect(screen.getByLabelText(/First name/)).toHaveValue(''));

    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: 'Smith' } });
    expect(screen.getByText(/This team already has 2 of 2 player slots filled/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Player Invite' })).toBeDisabled();

    renderWithMantine(
      <InvitePlayersModal isOpen onClose={onClose} team={team} pendingRoleInvites={[{ invite }]} />,
      { container },
    );

    expect(screen.getByText(/This team already has 2 of 2 player slots filled/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Player Invite' })).toBeDisabled();
  });

  it('surfaces the exact capacity conflict and does not report success', async () => {
    const capacityError = new ApiRequestError(
      'Team is full. Player invite was not sent.',
      409,
      {},
    );
    teamServiceMock.inviteUserToTeamRole.mockRejectedValue(capacityError);
    const onPlayerInviteSent = jest.fn();

    await openUserSearch(onPlayerInviteSent);
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(mockShowNotification).toHaveBeenCalledWith({
      color: 'red',
      message: 'Team is full. Player invite was not sent.',
    }));
    expect(onPlayerInviteSent).not.toHaveBeenCalled();
    expect(mockShowNotification).not.toHaveBeenCalledWith(expect.objectContaining({ color: 'green' }));
  });

  it('keeps the generic notification for a false result', async () => {
    teamServiceMock.inviteUserToTeamRole.mockResolvedValue(false);

    await openUserSearch();
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(mockShowNotification).toHaveBeenCalledWith({
      color: 'red',
      message: 'Failed to send invite.',
    }));
  });

  it('runs the success callback and notification for a successful invite', async () => {
    const onPlayerInviteSent = jest.fn();
    const user = buildUser();
    const team = buildTeam();
    userServiceMock.searchUsers.mockResolvedValue([user]);
    userServiceMock.getUserById.mockResolvedValue(user);
    renderWithMantine(
      <InvitePlayersModal
        isOpen
        onClose={jest.fn()}
        team={team}
        pendingRoleInvites={EMPTY_PENDING_ROLE_INVITES}
        onPlayerInviteSent={onPlayerInviteSent}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Invite User' }));
    fireEvent.change(screen.getByPlaceholderText('Search player (min 2 characters)'), {
      target: { value: 'Jane' },
    });
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(onPlayerInviteSent).toHaveBeenCalledWith(buildUser()));
    expect(mockShowNotification).toHaveBeenCalledWith({
      color: 'green',
      message: 'Player invite sent to Jane Doe.',
    });
  });
});
