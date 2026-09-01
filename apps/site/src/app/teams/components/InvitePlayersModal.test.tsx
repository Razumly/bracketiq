import React from 'react';
import type * as MantineCore from '@mantine/core';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { ApiRequestError } from '@/lib/apiClient';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import type { Team, UserData } from '@/types';
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
  beforeEach(() => {
    mockShowNotification.mockReset();
    teamServiceMock.inviteUserToTeamRole.mockReset();
    userServiceMock.getUserById.mockReset();
    userServiceMock.searchUsers.mockReset();
    teamServiceMock.inviteUserToTeamRole.mockResolvedValue(true);
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
