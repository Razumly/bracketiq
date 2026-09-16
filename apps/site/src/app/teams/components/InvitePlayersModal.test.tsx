import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { ApiRequestError } from '@/lib/apiClient';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import type { Invite, Team, UserData } from '@/types';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import InvitePlayersModal from './InvitePlayersModal';


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

  it('keeps a failed account invitation available for retry without claiming success', async () => {
    const capacityError = new ApiRequestError('Team is full. Player invite was not sent.', 409, {});
    teamServiceMock.inviteUserToTeamRole.mockRejectedValueOnce(capacityError).mockResolvedValueOnce(true);
    const onPlayerInviteSent = jest.fn();
    await openUserSearch(onPlayerInviteSent);
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    expect(await screen.findByText(capacityError.message)).toBeInTheDocument();
    expect(onPlayerInviteSent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    await waitFor(() => expect(onPlayerInviteSent).toHaveBeenCalledWith(buildUser()));
    expect(screen.queryByRole('button', { name: 'Invite', exact: true })).not.toBeInTheDocument();
  });

  it('removes a successfully invited account from candidates', async () => {
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
    expect(screen.queryByRole('button', { name: 'Invite', exact: true })).not.toBeInTheDocument();
    expect(screen.getByText(/Jane Doe's invitation is saved and pending acceptance/)).toBeInTheDocument();
  });

  it('retains a saved invite and private link through delivery and roster-refresh failures', async () => {
    const onClose = jest.fn();
    teamServiceMock.createTeamMemberInvite.mockResolvedValue({
      ok: true, invite: { $id: 'saved-invite' }, shareUrl: 'https://bracket-iq.com/i/saved-invite',
      delivery: { attempted: true, failed: true, inviteIds: ['saved-invite'] },
    });
    teamServiceMock.getTeamById.mockRejectedValueOnce(new Error('Roster unavailable')).mockResolvedValue(buildTeam());
    const clipboard = jest.fn().mockRejectedValue(new Error('Clipboard unavailable'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: clipboard }, configurable: true });
    renderWithMantine(<InvitePlayersModal isOpen onClose={onClose} team={buildTeam()}
      eventRegistration={{ eventId: 'event_1' }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'New Person' }));
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: 'jane@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Player Invite' }));
    expect(await screen.findByLabelText('Private invite link')).toHaveValue('https://bracket-iq.com/i/saved-invite');
    expect(await screen.findByRole('button', { name: 'Reload roster' })).toBeEnabled();
    expect(screen.getByLabelText(/First name/)).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Copy Invite Link' }));
    expect(await screen.findByText(/Select and copy the link below/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload roster' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reload roster' })).not.toBeInTheDocument());
    expect(teamServiceMock.createTeamMemberInvite).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Private invite link')).toHaveValue('https://bracket-iq.com/i/saved-invite');
    fireEvent.click(screen.getByRole('button', { name: 'Back to registration' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not lose an account invitation when its saved roster callback fails', async () => {
    const onPlayerInviteSent = jest.fn().mockRejectedValueOnce(new Error('Roster unavailable')).mockResolvedValueOnce(undefined);
    userServiceMock.searchUsers.mockResolvedValue([buildUser()]);
    userServiceMock.getUserById.mockResolvedValue(buildUser());
    teamServiceMock.createTeamMemberInvite.mockResolvedValue({
      ok: true, invite: { $id: 'saved-account-invite' }, delivery: { attempted: true, failed: true, inviteIds: ['saved-account-invite'] },
    });
    renderWithMantine(<InvitePlayersModal isOpen onClose={jest.fn()} team={buildTeam()}
      eventRegistration={{ eventId: 'event_1' }} onPlayerInviteSent={onPlayerInviteSent} />);
    fireEvent.change(screen.getByLabelText('Search player'), { target: { value: 'Jane' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Invite', exact: true }));
    expect(await screen.findByRole('button', { name: 'Reload roster' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Invite', exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload roster' }));
    await waitFor(() => expect(onPlayerInviteSent).toHaveBeenCalledTimes(2));
    expect(teamServiceMock.createTeamMemberInvite).toHaveBeenCalledTimes(1);
    expect(teamServiceMock.inviteUserToTeamRole).not.toHaveBeenCalled();
  });

  it('counts a new event player once when the roster refresh includes the saved profile', async () => {
    const team = buildTeam({ playerIds: ['captain'], teamSize: 3 });
    teamServiceMock.createTeamMemberInvite.mockResolvedValue({
      ok: true, invite: { $id: 'saved-invite', userId: 'new-player', firstName: 'Jane', lastName: 'Doe' },
    });
    teamServiceMock.getTeamById.mockResolvedValue({ ...team, pending: ['new-player'] });
    function RegistrationInvites() {
      const [current, setCurrent] = React.useState(team);
      return <InvitePlayersModal isOpen onClose={jest.fn()} team={current} onTeamUpdated={setCurrent}
        eventRegistration={{ eventId: 'event_1' }} />;
    }
    renderWithMantine(<RegistrationInvites />);
    fireEvent.click(screen.getByRole('tab', { name: 'New Person' }));
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: 'Doe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Player Invite' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to registration' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: 'Smith' } });
    expect(screen.getByRole('button', { name: 'Save Player Invite' })).toBeEnabled();
    expect(screen.queryByText(/3 of 3 player slots filled/)).not.toBeInTheDocument();
  });
});
