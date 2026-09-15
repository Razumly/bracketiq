import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import { buildTeam, buildUser } from '../../../../test/factories';
import type { Invite, Team, UserData } from '@/types';

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
    removePlayerFromTeam: jest.fn(),
    getRegistrationQuestions: jest.fn(),
    saveRegistrationQuestions: jest.fn(),
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

import TeamDetailModal, { type TeamDetailPageTab } from '../TeamDetailModal';
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
  removePlayerFromTeam: jest.Mock;
  getRegistrationQuestions: jest.Mock;
  saveRegistrationQuestions: jest.Mock;
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
    teamServiceMock.removePlayerFromTeam.mockReset();
    teamServiceMock.getRegistrationQuestions.mockReset();
    teamServiceMock.saveRegistrationQuestions.mockReset();
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
    teamServiceMock.saveRegistrationQuestions.mockResolvedValue(undefined);
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

  it('keeps team edits after a failed save and retries the same team', async () => {
    const team = buildTeam({ $id: 'team_1', name: 'Original team', playerIds: [], captainId: '', pending: [], sport: 'Volleyball', joinPolicy: 'CLOSED' });
    const updated = { ...team, name: 'North Loop' };
    const onTeamUpdated = jest.fn();
    const onClose = jest.fn();
    teamServiceMock.updateTeamDetails.mockRejectedValueOnce(new Error('Team save unavailable.')).mockResolvedValueOnce(updated);
    renderWithMantine(<TeamDetailModal currentTeam={team} isOpen onClose={onClose} canManage variant="edit" onTeamUpdated={onTeamUpdated} />);
    const name = screen.getByLabelText(/Team Name/);
    fireEvent.change(name, { target: { value: 'North Loop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Team Details' }));
    expect(await screen.findByText('Team save unavailable.')).toBeVisible();
    expect(name).toHaveValue('North Loop');
    expect(onClose).not.toHaveBeenCalled();
    expect(onTeamUpdated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Team Details' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onTeamUpdated).toHaveBeenCalledWith(updated);
    expect(teamServiceMock.updateTeamDetails.mock.calls[1]).toEqual(teamServiceMock.updateTeamDetails.mock.calls[0]);
  });

  it('opens the full editor with roster invites and closes through the parent after cancel, dismissal, or save', async () => {
    const captain = buildUser({
      $id: 'captain_1',
      firstName: 'Alex',
      lastName: 'Stone',
      fullName: 'Alex Stone',
    });
    const team = buildTeam({
      $id: 'team_1',
      name: 'Original Team',
      captainId: captain.$id,
      playerIds: [captain.$id],
      pending: [],
      sport: 'Volleyball',
      teamSize: 6,
      joinPolicy: 'CLOSED',
    });
    const updatedTeam = buildTeam({ ...team, name: 'Updated Team', teamSize: 8 });
    const onClose = jest.fn();
    const onTeamUpdated = jest.fn();
    (useApp as jest.Mock).mockReturnValue({ user: captain, authUser: null });
    userServiceMock.getUsersByIds.mockResolvedValue([captain]);
    teamServiceMock.updateTeamDetails.mockResolvedValueOnce(updatedTeam);

    function DirectEditor() {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <>
          <button onClick={() => setIsOpen(true)}>Open team editor</button>
          <TeamDetailModal
            currentTeam={team}
            isOpen={isOpen}
            onClose={() => {
              onClose();
              setIsOpen(false);
            }}
            onTeamUpdated={onTeamUpdated}
            variant="edit"
          />
        </>
      );
    }

    renderWithMantine(<DirectEditor />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open team editor' }));
    const editor = await screen.findByRole('dialog', { name: 'Edit Team Details' });
    expect(within(editor).getByLabelText('Team Name', { exact: false })).toHaveValue('Original Team');
    expect(within(editor).getByLabelText('Team Size')).toHaveValue('6');
    expect(within(editor).getByLabelText('Sport', { selector: 'input' })).toHaveValue('Volleyball');
    expect(within(editor).getByText('Join mode')).toBeInTheDocument();
    await waitFor(() => {
      expect(within(editor).getByLabelText('Team Captain', { selector: 'input' })).toHaveValue('Alex Stone');
      expect(within(editor).getByRole('heading', { name: 'Roster (1)' })).toBeVisible();
      expect(within(editor).getByText('Alex Stone', { selector: '.team-roster-player-card *' })).toBeVisible();
    });
    const inviteButton = within(editor).getByRole('button', { name: 'Invite Roster Members' });
    expect(screen.queryByRole('button', { name: /add players/i, hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument();

    fireEvent.click(inviteButton);
    const inviteDialog = await screen.findByRole('dialog', { name: 'Invite to Original Team' });
    expect(inviteDialog).toBeVisible();
    fireEvent.click(within(inviteDialog).getByRole('button', { name: 'Close', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Invite to Original Team' })).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(onTeamUpdated).not.toHaveBeenCalled();

    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Edit Team Details' })).getByRole('button', { name: 'Cancel', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onTeamUpdated).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open team editor' }));
    const dismissibleEditor = await screen.findByRole('dialog', { name: 'Edit Team Details' });
    fireEvent.click(within(dismissibleEditor).getByRole('button', { name: 'Close', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onTeamUpdated).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open team editor' }));
    const reopenedEditor = await screen.findByRole('dialog', { name: 'Edit Team Details' });
    fireEvent.change(within(reopenedEditor).getByLabelText('Team Name', { exact: false }), { target: { value: 'Updated Team' } });
    fireEvent.change(within(reopenedEditor).getByLabelText('Team Size'), { target: { value: '8' } });
    fireEvent.click(within(reopenedEditor).getByRole('button', { name: 'Save Team Details' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onTeamUpdated).toHaveBeenCalledWith(updatedTeam);
    expect(teamServiceMock.updateTeamDetails).toHaveBeenCalledWith(
      team.$id,
      expect.objectContaining({ name: 'Updated Team', teamSize: 8, captainId: captain.$id }),
    );
  });

  it('keeps a successfully invited player in the editor roster when the initial roster load finishes late', async () => {
    const captain = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    const invitedPlayer = buildUser({
      $id: 'player_2',
      firstName: 'Jordan',
      lastName: 'Player',
      fullName: 'Jordan Player',
    });
    const team = buildTeam({
      $id: 'team_1',
      name: 'Test team',
      captainId: captain.$id,
      managerId: captain.$id,
      playerIds: [captain.$id],
      pending: [],
      teamSize: 6,
    });
    let resolveInitialRoster!: (users: Array<typeof captain>) => void;
    const initialRoster = new Promise<Array<typeof captain>>((resolve) => {
      resolveInitialRoster = resolve;
    });
    (useApp as jest.Mock).mockReturnValue({ user: captain, authUser: null });
    userServiceMock.getUsersByIds
      .mockImplementation(async (ids: string[]) => [captain, invitedPlayer].filter((player) => ids.includes(player.$id)))
      .mockReturnValueOnce(initialRoster);
    userServiceMock.searchUsers.mockResolvedValue([invitedPlayer]);
    userServiceMock.getUserById.mockResolvedValue(invitedPlayer);
    teamServiceMock.getTeamById.mockResolvedValue(buildTeam({
      ...team,
      playerIds: [captain.$id, invitedPlayer.$id],
      pending: [invitedPlayer.$id],
    }));

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        variant="edit"
      />,
    );

    const editor = await screen.findByRole('dialog', { name: 'Edit Team Details' });
    fireEvent.click(within(editor).getByRole('button', { name: 'Invite Roster Members' }));
    const inviteDialog = await screen.findByRole('dialog', { name: 'Invite to Test team' });
    fireEvent.click(within(inviteDialog).getByRole('tab', { name: 'Invite User' }));
    fireEvent.change(
      within(inviteDialog).getByPlaceholderText(/search player/i),
      { target: { value: 'Jordan' } },
    );
    await within(inviteDialog).findByText('Jordan Player');
    fireEvent.click(within(inviteDialog).getByRole('button', { name: /^invite$/i }));

    await waitFor(() => expect(teamServiceMock.inviteUserToTeamRole).toHaveBeenCalled());
    fireEvent.click(within(inviteDialog).getByRole('button', { name: 'Close', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Invite to Test team' })).not.toBeInTheDocument());
    const restoredEditor = await screen.findByRole('dialog', { name: 'Edit Team Details' });
    expect(within(restoredEditor).getByText('Jordan Player', { selector: '.team-roster-player-card *' })).toBeVisible();

    await act(async () => {
      resolveInitialRoster([captain]);
      await initialRoster;
    });

    await waitFor(() => {
      expect(within(restoredEditor).getByText('Morgan Manager', { selector: '.team-roster-player-card *' })).toBeVisible();
      expect(within(restoredEditor).getByText('Jordan Player', { selector: '.team-roster-player-card *' })).toBeVisible();
      expect(within(restoredEditor).getByRole('heading', { name: 'Roster (2)' })).toBeVisible();
    });
  });

  it('cancels the SENT invitation for a pending roster player without removing an active player', async () => {
    const manager = buildUser({ $id: 'manager_1', firstName: 'Morgan', lastName: 'Manager' });
    const captain = buildUser({ $id: 'captain_1', firstName: 'Alex', lastName: 'Captain' });
    const pendingPlayer = buildUser({ $id: 'player_2', firstName: 'Jordan', lastName: 'Player' });
    const team = buildTeam({
      $id: 'team_1',
      managerId: manager.$id,
      captainId: captain.$id,
      playerIds: [captain.$id],
      pending: [pendingPlayer.$id],
      pendingPlayers: [pendingPlayer],
      playerRegistrations: [{
        id: 'registration_2',
        userId: pendingPlayer.$id,
        status: 'INVITED',
        invitationId: 'invite_player_2',
      }],
    });
    const onTeamUpdated = jest.fn();
    let resolveCancellation!: (success: boolean) => void;
    const cancellation = new Promise<boolean>((resolve) => { resolveCancellation = resolve; });
    (useApp as jest.Mock).mockReturnValue({ user: manager, authUser: null });
    userServiceMock.getUsersByIds.mockImplementation(async (ids: string[]) => (
      [manager, captain, pendingPlayer].filter((player) => ids.includes(player.$id))
    ));
    userServiceMock.listInvites.mockResolvedValue([{
      $id: 'invite_player_2',
      type: 'TEAM',
      teamId: team.$id,
      userId: pendingPlayer.$id,
      role: 'player',
      status: 'SENT',
    }]);
    userServiceMock.deleteInviteById.mockReturnValue(cancellation);
    teamServiceMock.removePlayerFromTeam.mockResolvedValue(buildTeam({ ...team, pending: [] }));

    function TeamEditor() {
      const [currentTeam, setCurrentTeam] = React.useState(team);
      return (
        <TeamDetailModal
          currentTeam={currentTeam}
          isOpen
          onClose={jest.fn()}
          onTeamUpdated={(updatedTeam) => {
            onTeamUpdated(updatedTeam);
            setCurrentTeam(updatedTeam);
          }}
          variant="edit"
        />
      );
    }

    renderWithMantine(<TeamEditor />);
    const editor = await screen.findByRole('dialog', { name: 'Edit Team Details' });
    const playerName = await within(editor).findByText('Jordan Player', { selector: '.team-roster-player-card *' });
    const playerCard = playerName.closest<HTMLElement>('.team-roster-player-card')!;
    const cancelButton = within(playerCard).getByRole('button', { name: 'Cancel', exact: true });
    fireEvent.click(cancelButton);

    expect(teamServiceMock.removePlayerFromTeam).not.toHaveBeenCalled();
    await waitFor(() => expect(userServiceMock.deleteInviteById).toHaveBeenCalledWith('invite_player_2'));
    expect(cancelButton).toBeDisabled();
    expect(playerCard).toBeVisible();
    expect(onTeamUpdated).not.toHaveBeenCalled();

    await act(async () => {
      resolveCancellation(true);
      await cancellation;
    });

    await waitFor(() => {
      expect(within(editor).queryByText('Jordan Player', { selector: '.team-roster-player-card *' })).not.toBeInTheDocument();
      expect(within(editor).getByRole('heading', { name: 'Roster (1)' })).toBeVisible();
    });
    expect(onTeamUpdated).toHaveBeenLastCalledWith(expect.objectContaining({ pending: [] }));
    expect(userServiceMock.deleteInviteById).toHaveBeenCalledTimes(1);
    expect(teamServiceMock.removePlayerFromTeam).not.toHaveBeenCalled();
  });

  it('resolves a FAILED managed player invitation in one list call after roster Cancel', async () => {
    const manager = buildUser({ $id: 'manager_1', firstName: 'Morgan', lastName: 'Manager' });
    const captain = buildUser({ $id: 'captain_1', firstName: 'Alex', lastName: 'Captain' });
    const player = buildUser({ $id: 'player_2', firstName: 'Jordan', lastName: 'Player', isManagedPlayer: true });
    const team = buildTeam({
      $id: 'team_1',
      managerId: manager.$id,
      captainId: captain.$id,
      playerIds: [captain.$id, player.$id],
      pending: [player.$id],
      pendingPlayers: [player],
      playerRegistrations: [{ id: 'registration_2', userId: player.$id, status: 'INVITED' }],
    });
    const invite: Invite = {
      $id: 'invite_player_2',
      type: 'TEAM',
      teamId: team.$id,
      userId: player.$id,
      role: 'player',
      status: 'FAILED',
      isAssigned: true,
    };
    let resolveInvites!: (invites: Invite[]) => void;
    const invites = new Promise<Invite[]>((resolve) => { resolveInvites = resolve; });
    const onTeamUpdated = jest.fn();
    (useApp as jest.Mock).mockReturnValue({ user: manager, authUser: null });
    userServiceMock.getUsersByIds.mockImplementation(async (ids: string[]) => (
      [manager, captain, player].filter((entry) => ids.includes(entry.$id))
    ));
    userServiceMock.listInvites.mockImplementation((filters: { type?: string }) => (
      filters.type === 'TEAM' ? invites : Promise.resolve([])
    ));

    renderWithMantine(
      <TeamDetailModal currentTeam={team} isOpen onClose={jest.fn()} onTeamUpdated={onTeamUpdated} variant="edit" />,
    );
    const editor = await screen.findByRole('dialog', { name: 'Edit Team Details' });
    const playerName = await within(editor).findByText('Jordan Player', { selector: '.team-roster-player-card *' });
    const playerCard = playerName.closest<HTMLElement>('.team-roster-player-card')!;
    fireEvent.click(within(playerCard).getByRole('button', { name: 'Cancel', exact: true }));

    expect(userServiceMock.listInvites.mock.calls.filter(([filters]) => filters.type === 'TEAM')).toEqual([
      [{ teamId: 'team_1', type: 'TEAM' }],
    ]);
    expect(within(playerCard).getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    expect(userServiceMock.deleteInviteById).not.toHaveBeenCalled();
    expect(onTeamUpdated).not.toHaveBeenCalled();

    await act(async () => {
      resolveInvites([invite]);
      await invites;
    });

    await waitFor(() => expect(playerCard).not.toBeInTheDocument());
    expect(userServiceMock.deleteInviteById).toHaveBeenCalledWith('invite_player_2');
    expect(teamServiceMock.removePlayerFromTeam).not.toHaveBeenCalled();
    expect(onTeamUpdated).toHaveBeenLastCalledWith(expect.objectContaining({
      pending: [],
      pendingPlayers: [],
      playerIds: [captain.$id],
      playerRegistrations: [expect.objectContaining({ userId: player.$id, status: 'REMOVED' })],
    }));
  });

  it('uses the loaded current SENT attempt for roster Cancel without another invite lookup', async () => {
    const manager = buildUser({ $id: 'manager_1', firstName: 'Morgan', lastName: 'Manager' });
    const captain = buildUser({ $id: 'captain_1', firstName: 'Alex', lastName: 'Captain' });
    const player = buildUser({ $id: 'player_2', firstName: 'Jordan', lastName: 'Player' });
    const team = buildTeam({
      $id: 'team_1',
      managerId: manager.$id,
      captainId: captain.$id,
      playerIds: [captain.$id],
      pending: [player.$id],
    });
    const invite: Invite = {
      $id: 'invite_player_2',
      type: 'TEAM',
      teamId: team.$id,
      userId: player.$id,
      status: 'SENT',
      invitationLabel: 'Pending acceptance',
    };
    let resolveInvites!: (invites: Invite[]) => void;
    const loadedInvites = new Promise<Invite[]>((resolve) => { resolveInvites = resolve; });
    (useApp as jest.Mock).mockReturnValue({ user: manager, authUser: null });
    userServiceMock.getUsersByIds.mockImplementation(async (ids: string[]) => (
      [manager, captain, player].filter((entry) => ids.includes(entry.$id))
    ));
    userServiceMock.listInvites.mockImplementation((filters: { types?: readonly string[] }) => (
      filters.types?.includes('TEAM') ? loadedInvites : Promise.resolve([])
    ));

    renderWithMantine(
      <TeamDetailModal currentTeam={team} isOpen onClose={jest.fn()} variant="page" />,
    );
    const invitationLabel = await screen.findByText('Pending acceptance', { selector: '.team-roster-player-card *' });
    const playerCard = invitationLabel.closest<HTMLElement>('.team-roster-player-card')!;
    await act(async () => {
      resolveInvites([
        { ...invite, $id: 'old_invite', status: 'PENDING', isCurrentAttempt: false },
        invite,
      ]);
      await loadedInvites;
    });
    userServiceMock.listInvites.mockClear();
    fireEvent.click(within(playerCard).getByRole('button', { name: 'Cancel', exact: true }));

    await waitFor(() => expect(playerCard).not.toBeInTheDocument());
    expect(userServiceMock.deleteInviteById).toHaveBeenCalledWith('invite_player_2');
    expect(userServiceMock.listInvites).not.toHaveBeenCalled();
    expect(teamServiceMock.removePlayerFromTeam).not.toHaveBeenCalled();
  });

  it('keeps concurrent roster cancellations removed when an older roster load finishes late', async () => {
    const manager = buildUser({ $id: 'manager_1', firstName: 'Morgan', lastName: 'Manager' });
    const captain = buildUser({ $id: 'captain_1', firstName: 'Alex', lastName: 'Captain' });
    const firstPlayer = buildUser({ $id: 'player_2', firstName: 'Jordan', lastName: 'Player' });
    const secondPlayer = buildUser({ $id: 'player_3', firstName: 'Taylor', lastName: 'Player' });
    const team = buildTeam({
      $id: 'team_1',
      managerId: manager.$id,
      captainId: captain.$id,
      playerIds: [captain.$id],
      pending: [firstPlayer.$id, secondPlayer.$id],
      playerRegistrations: [
        { id: 'registration_2', userId: firstPlayer.$id, status: 'INVITED', invitationId: 'invite_player_2' },
        { id: 'registration_3', userId: secondPlayer.$id, status: 'INVITED', invitationId: 'invite_player_3' },
      ],
    });
    let resolveFirst!: (success: boolean) => void;
    let resolveSecond!: (success: boolean) => void;
    let resolveRoster!: (players: UserData[]) => void;
    const firstCancellation = new Promise<boolean>((resolve) => { resolveFirst = resolve; });
    const secondCancellation = new Promise<boolean>((resolve) => { resolveSecond = resolve; });
    const staleRoster = new Promise<UserData[]>((resolve) => { resolveRoster = resolve; });
    const onTeamUpdated = jest.fn();
    const refreshTeam = jest.fn();
    (useApp as jest.Mock).mockReturnValue({ user: manager, authUser: null });
    userServiceMock.getUsersByIds.mockImplementation(async (ids: string[]) => (
      [manager, captain, firstPlayer, secondPlayer].filter((player) => ids.includes(player.$id))
    ));
    userServiceMock.deleteInviteById.mockImplementation((inviteId: string) => (
      inviteId === 'invite_player_2' ? firstCancellation : secondCancellation
    ));

    function TeamEditor() {
      const [currentTeam, setCurrentTeam] = React.useState(team);
      refreshTeam.mockImplementation(() => setCurrentTeam({ ...team }));
      return (
        <TeamDetailModal
          currentTeam={currentTeam}
          isOpen
          onClose={jest.fn()}
          onTeamUpdated={(updatedTeam) => {
            onTeamUpdated(updatedTeam);
            setCurrentTeam(updatedTeam);
          }}
          variant="edit"
        />
      );
    }

    renderWithMantine(<TeamEditor />);
    const editor = await screen.findByRole('dialog', { name: 'Edit Team Details' });
    const firstName = await within(editor).findByText('Jordan Player', { selector: '.team-roster-player-card *' });
    const secondName = await within(editor).findByText('Taylor Player', { selector: '.team-roster-player-card *' });
    await waitFor(() => expect(userServiceMock.listInvites).toHaveBeenCalled());
    const firstCancel = within(firstName.closest<HTMLElement>('.team-roster-player-card')!).getByRole('button', { name: 'Cancel', exact: true });
    const secondCancel = within(secondName.closest<HTMLElement>('.team-roster-player-card')!).getByRole('button', { name: 'Cancel', exact: true });
    act(() => {
      fireEvent.click(firstCancel);
      fireEvent.click(firstCancel);
      fireEvent.click(secondCancel);
    });
    expect(userServiceMock.deleteInviteById).toHaveBeenCalledTimes(2);

    userServiceMock.getUsersByIds.mockReturnValueOnce(staleRoster);
    act(() => refreshTeam());
    await act(async () => {
      resolveSecond(true);
      await secondCancellation;
    });
    expect(onTeamUpdated).toHaveBeenLastCalledWith(expect.objectContaining({ pending: [firstPlayer.$id] }));
    await act(async () => {
      resolveFirst(true);
      await firstCancellation;
    });
    expect(onTeamUpdated).toHaveBeenLastCalledWith(expect.objectContaining({ pending: [] }));

    await act(async () => {
      resolveRoster([captain, firstPlayer, secondPlayer]);
      await staleRoster;
    });
    await waitFor(() => {
      expect(within(editor).getByRole('heading', { name: 'Roster (1)' })).toBeVisible();
      expect(within(editor).queryByText('Jordan Player', { selector: '.team-roster-player-card *' })).not.toBeInTheDocument();
      expect(within(editor).queryByText('Taylor Player', { selector: '.team-roster-player-card *' })).not.toBeInTheDocument();
    });
    expect(teamServiceMock.removePlayerFromTeam).not.toHaveBeenCalled();
  });

  it('keeps the pending card until invitation cancellation can be confirmed and allows retry', async () => {
    const manager = buildUser({ $id: 'manager_1', firstName: 'Morgan', lastName: 'Manager' });
    const captain = buildUser({ $id: 'captain_1', firstName: 'Alex', lastName: 'Captain' });
    const player = buildUser({ $id: 'player_2', firstName: 'Jordan', lastName: 'Player' });
    const team = buildTeam({
      $id: 'team_1',
      managerId: manager.$id,
      captainId: captain.$id,
      playerIds: [captain.$id],
      pending: [player.$id],
    });
    const invite: Invite = {
      $id: 'invite_player_2',
      type: 'TEAM',
      teamId: team.$id,
      userId: player.$id,
      status: 'PENDING',
    };
    const onTeamUpdated = jest.fn<void, [Team]>();
    (useApp as jest.Mock).mockReturnValue({ user: manager, authUser: null });
    userServiceMock.getUsersByIds.mockImplementation(async (ids: string[]) => (
      [manager, captain, player].filter((entry) => ids.includes(entry.$id))
    ));
    userServiceMock.listInvites.mockResolvedValue([
      { ...invite, $id: 'final_invite', status: 'CANCELLED' },
      { ...invite, $id: 'superseded_invite', isCurrentAttempt: false },
      { ...invite, $id: 'other_team_invite', teamId: 'team_2' },
    ]);

    renderWithMantine(
      <TeamDetailModal currentTeam={team} isOpen onClose={jest.fn()} onTeamUpdated={onTeamUpdated} variant="edit" />,
    );
    const editor = await screen.findByRole('dialog', { name: 'Edit Team Details' });
    const playerName = await within(editor).findByText('Jordan Player', { selector: '.team-roster-player-card *' });
    await waitFor(() => expect(userServiceMock.listInvites).toHaveBeenCalled());
    const playerCard = playerName.closest<HTMLElement>('.team-roster-player-card')!;
    const cancelButton = within(playerCard).getByRole('button', { name: 'Cancel', exact: true });
    fireEvent.click(cancelButton);
    expect(await within(editor).findByRole('alert')).toHaveTextContent(/invitation could not be found/i);
    expect(cancelButton).toBeEnabled();
    expect(playerCard).toBeVisible();
    expect(userServiceMock.deleteInviteById).not.toHaveBeenCalled();
    expect(onTeamUpdated).not.toHaveBeenCalled();

    userServiceMock.listInvites.mockResolvedValue([invite]);
    userServiceMock.deleteInviteById.mockRejectedValueOnce(new Error('Team access was denied.'));
    fireEvent.click(cancelButton);
    await waitFor(() => expect(within(editor).getByRole('alert')).toHaveTextContent('Team access was denied.'));
    expect(cancelButton).toBeEnabled();
    expect(playerCard).toBeVisible();
    expect(onTeamUpdated).not.toHaveBeenCalled();

    userServiceMock.deleteInviteById.mockResolvedValueOnce(false);
    fireEvent.click(cancelButton);
    await waitFor(() => expect(within(editor).getByRole('alert')).toHaveTextContent(/cancellation could not be confirmed/i));
    expect(cancelButton).toBeEnabled();
    expect(playerCard).toBeVisible();
    expect(onTeamUpdated).not.toHaveBeenCalled();

    fireEvent.click(cancelButton);
    await waitFor(() => expect(playerCard).not.toBeInTheDocument());
    expect(within(editor).queryByRole('alert')).not.toBeInTheDocument();
    expect(onTeamUpdated).toHaveBeenLastCalledWith(expect.objectContaining({ pending: [] }));
    expect(teamServiceMock.removePlayerFromTeam).not.toHaveBeenCalled();
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

  it('saves a pending player jersey as INVITED metadata without changing the active roster', async () => {
    const captain = buildUser({ $id: 'captain_1', firstName: 'Alex', lastName: 'Captain' });
    const player = buildUser({ $id: 'player_2', firstName: 'Jordan', lastName: 'Player' });
    const team = buildTeam({
      $id: 'team_1',
      captainId: captain.$id,
      playerIds: [captain.$id, player.$id],
      pending: [player.$id],
      playerRegistrations: [
        { id: 'registration_1', userId: captain.$id, status: 'ACTIVE', jerseyNumber: '12', isCaptain: true },
        {
          id: 'registration_2',
          userId: player.$id,
          status: 'INVITED',
          jerseyNumber: '7',
          position: 'Setter',
          invitationId: 'invite_player_2',
          invitationLabel: 'Awaiting guardian',
        },
      ],
    });
    const updatedTeam = buildTeam({
      ...team,
      playerRegistrations: team.playerRegistrations?.map((registration) => (
        registration.userId === player.$id ? { ...registration, jerseyNumber: '18' } : registration
      )),
    });
    userServiceMock.getUsersByIds.mockImplementation(async (ids: string[]) => (
      [captain, player].filter((entry) => ids.includes(entry.$id))
    ));
    userServiceMock.listInvites.mockResolvedValue([{
      $id: 'invite_player_2',
      type: 'TEAM',
      teamId: team.$id,
      userId: player.$id,
      status: 'PENDING',
      invitationLabel: 'Pending acceptance',
    }]);
    teamServiceMock.updateTeamDetails.mockResolvedValueOnce(updatedTeam);

    function TeamRoster() {
      const [currentTeam, setCurrentTeam] = React.useState(team);
      return (
        <TeamDetailModal
          currentTeam={currentTeam}
          isOpen
          onClose={jest.fn()}
          onTeamUpdated={setCurrentTeam}
          canManage
          variant="page"
        />
      );
    }

    renderWithMantine(<TeamRoster />);
    const jerseyInput = await screen.findByLabelText('Jersey number for Jordan Player');
    const playerCard = jerseyInput.closest<HTMLElement>('.team-roster-player-card')!;
    expect(jerseyInput).toHaveValue('7');
    expect(within(playerCard).getByText('Awaiting guardian')).toBeVisible();
    expect(within(playerCard).queryByText('Pending acceptance')).not.toBeInTheDocument();
    expect(within(playerCard).getByRole('button', { name: 'Save jersey number for Jordan Player' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Jersey number for Alex Captain'), { target: { value: '99' } });
    fireEvent.change(jerseyInput, { target: { value: '18A' } });
    expect(jerseyInput).toHaveValue('18');
    fireEvent.click(within(playerCard).getByRole('button', { name: 'Save jersey number for Jordan Player' }));

    await waitFor(() => {
      expect(teamServiceMock.updateTeamDetails).toHaveBeenCalledWith('team_1', {
        playerRegistrations: [{
          id: 'registration_2',
          teamId: 'team_1',
          userId: player.$id,
          status: 'INVITED',
          jerseyNumber: '18',
        }],
      });
      expect(screen.getByLabelText('Jersey number for Jordan Player')).toHaveValue('18');
      expect(screen.getByLabelText('Jersey number for Alex Captain')).toHaveValue('12');
      expect(screen.getByRole('button', { name: 'Save jersey number for Jordan Player' })).toBeDisabled();
    });
    const savedCard = screen.getByLabelText('Jersey number for Jordan Player').closest<HTMLElement>('.team-roster-player-card')!;
    expect(within(savedCard).getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
    expect(within(savedCard).getByText('Awaiting guardian')).toBeVisible();
    expect(within(savedCard).queryByRole('button', { name: 'Remove', exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Roster (2)' })).toBeVisible();
    expect(teamServiceMock.removePlayerFromTeam).not.toHaveBeenCalled();
  });

  it('keeps invitation history in its manager page tab and roster controls in the roster tab', async () => {
    const player = buildUser({ $id: 'player_1', firstName: 'Jordan', lastName: 'Player' });
    const team = buildTeam({
      $id: 'team_1',
      playerIds: [player.$id],
      pending: [player.$id],
      playerRegistrations: [{ id: 'registration_1', userId: player.$id, status: 'INVITED' }],
    });
    const invite: Invite = {
      $id: 'invite_player_1',
      type: 'TEAM',
      teamId: team.$id,
      userId: player.$id,
      firstName: 'Jordan',
      lastName: 'Player',
      status: 'PENDING',
    };
    userServiceMock.getUsersByIds.mockImplementation(async (ids: string[]) => (
      ids.includes(player.$id) ? [player] : []
    ));
    userServiceMock.listInvites.mockImplementation(async (filters: { history?: boolean }) => (
      filters.history ? [] : [invite]
    ));
    const onActiveTabChange = jest.fn();
    function TeamPage() {
      const [tab, setTab] = React.useState<TeamDetailPageTab>('roster');
      return (
        <TeamDetailModal
          currentTeam={team}
          isOpen
          onClose={jest.fn()}
          canManage
          variant="page"
          activeTab={tab}
          onActiveTabChange={(nextTab) => {
            onActiveTabChange(nextTab);
            setTab(nextTab);
          }}
        />
      );
    }

    renderWithMantine(<TeamPage />);
    await screen.findByLabelText('Jersey number for Jordan Player');
    expect(screen.getByText('Pending acceptance', { selector: '.team-roster-player-card *' })).toBeVisible();
    expect(screen.queryByText('Invitation history', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel invitation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite Roster Members' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Invitation History' }));
    expect(onActiveTabChange).toHaveBeenLastCalledWith('invitations');
    expect(await screen.findByRole('button', { name: 'Cancel invitation' })).toBeVisible();
    expect(screen.getByText('Invitation history', { exact: true })).toBeVisible();
    expect(screen.queryByLabelText('Jersey number for Jordan Player')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite Roster Members' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Roster' }));
    expect(onActiveTabChange).toHaveBeenLastCalledWith('roster');
    expect(screen.getByLabelText('Jersey number for Jordan Player')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Invite Roster Members' })).toBeVisible();
    expect(screen.queryByText('Invitation history', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel invitation' })).not.toBeInTheDocument();
  });

  it('removes invitation controls when manager access is removed and restores them in registration management', async () => {
    const team = buildTeam({ $id: 'team_1', playerIds: [], pending: [] });
    const view = renderWithMantine(
      <TeamDetailModal currentTeam={team} isOpen onClose={jest.fn()} canManage variant="page" activeTab="invitations" />,
    );
    expect(await screen.findByText('No invitation attempts.')).toBeVisible();
    expect(screen.queryByText('Player Slots')).not.toBeInTheDocument();

    view.rerender(
      <MantineProvider>
        <TeamDetailModal currentTeam={team} isOpen onClose={jest.fn()} canManage={false} variant="page" activeTab="invitations" />
      </MantineProvider>,
    );
    expect(screen.getByText('Player Slots')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Roster' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Invitation History' })).not.toBeInTheDocument();
    expect(screen.queryByText('Invitation history', { exact: true })).not.toBeInTheDocument();

    view.rerender(
      <MantineProvider>
        <TeamDetailModal currentTeam={team} isOpen onClose={jest.fn()} canManage variant="modal" activeTab="invitations" />
      </MantineProvider>,
    );
    expect(await screen.findByText('No invitation attempts.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Invitation History' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Player Slots')).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: /assistant coach/i }));
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
    fireEvent.click(await screen.findByRole('button', { name: /^manager$/i }));
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Done', exact: true })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Done', exact: true }));
    await screen.findByRole('heading', { name: 'Roster (1)' });
    expect(await within(document.querySelector<HTMLElement>('.responsive-card-grid.team-roster-player-grid')!).findByText('Alex Player')).toBeInTheDocument();
    expect(screen.getByText('Role: Player')).toBeInTheDocument();
    expect(screen.queryByText('Unknown user')).not.toBeInTheDocument();
    expect(await screen.findByText(/Roster \(1\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pending Invitations \(/i)).not.toBeInTheDocument();
    expect(within(document.querySelector<HTMLElement>('.responsive-card-grid.team-roster-player-grid')!).queryByText(/Pending acceptance/i)).not.toBeInTheDocument();
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
    expect(within(document.querySelector<HTMLElement>('.responsive-card-grid.team-roster-player-grid')!).queryByText(/Pending acceptance/i)).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: /assistant coach/i }));
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

    await waitFor(() => expect(screen.getByRole('button', { name: 'Done', exact: true })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Done', exact: true }));
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

    await waitFor(() => expect(screen.getByRole('button', { name: 'Done', exact: true })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Done', exact: true }));
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
