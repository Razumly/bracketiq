import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import type { Invite } from '@/types';
import DeclineTeamInvitationButton from '../DeclineTeamInvitationButton';
import TeamInvitationManager from '../TeamInvitationManager';
import TeamInvitationRecipientActions from '../TeamInvitationRecipientActions';

const refreshUser = jest.fn(async () => undefined);
jest.mock('@/app/providers', () => ({ useApp: () => ({ refreshUser }) }));
jest.mock('@/lib/userService', () => ({ userService: {
  declineInvite: jest.fn(), listInvites: jest.fn(), remindTeamInvitation: jest.fn(), reinviteTeamInvitation: jest.fn(), getInviteById: jest.fn(), deleteInviteById: jest.fn(),
} }));

import { userService } from '@/lib/userService';
const service = jest.mocked(userService);
const invite: Invite = { $id: 'attempt-1', type: 'TEAM', teamId: 'team', userId: 'child', status: 'PENDING', canBlockSender: true, childFullName: 'First Child', invitationLabel: 'Invitation pending', isCurrentAttempt: true };

beforeEach(() => {
  jest.clearAllMocks();
  service.declineInvite.mockResolvedValue(true);
  service.getInviteById.mockResolvedValue(invite);
  service.listInvites.mockImplementation(async (query) => query.history ? [] : [invite]);
});

it.each([false, true])('sends an explicit sender chat-leave choice (%s)', async (leaveChats) => {
  const onSaved = jest.fn(async () => undefined);
  renderWithMantine(<DeclineTeamInvitationButton invite={invite} onSaved={onSaved} />);
  fireEvent.click(screen.getByRole('button', { name: 'Decline and block' }));
  fireEvent.click(await screen.findByRole('radio', { name: 'This sender, on every Team' }));
  const checkbox = screen.getByRole('checkbox', { name: 'Also leave chats shared with this sender' });
  expect(checkbox).not.toBeChecked();
  if (leaveChats) fireEvent.click(checkbox);
  fireEvent.click(await screen.findByRole('button', { name: 'Save decline and block' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(service.declineInvite).toHaveBeenCalledWith('attempt-1', { blockScope: 'sender', leaveSharedChats: leaveChats });
  expect(refreshUser).toHaveBeenCalledTimes(1);
});

it('keeps Team scope on the named child and disables an unclaimed sender', async () => {
  renderWithMantine(<DeclineTeamInvitationButton invite={{ ...invite, canBlockSender: false }} onSaved={async () => undefined} />);
  fireEvent.click(screen.getByRole('button', { name: 'Decline and block' }));
  expect(await screen.findByRole('radio', { name: 'This sender, on every Team' })).toBeDisabled();
  expect(screen.getByText(/cannot add or invite First Child/)).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Save decline and block' }));
  await waitFor(() => expect(service.declineInvite).toHaveBeenCalledWith('attempt-1', { blockScope: 'team', leaveSharedChats: false }));
});

it('keeps the dialog open and reports a failed coherent save', async () => {
  service.declineInvite.mockRejectedValue(new Error('The invitation and block were not saved.'));
  const onSaved = jest.fn(async () => undefined);
  renderWithMantine(<DeclineTeamInvitationButton invite={invite} onSaved={onSaved} />);
  fireEvent.click(screen.getByRole('button', { name: 'Decline and block' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save decline and block' }));
  expect(await screen.findByText('The invitation and block were not saved.')).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(onSaved).not.toHaveBeenCalled();
});

it('keeps plain Decline available on an authorized share link', async () => {
  const onSaved = jest.fn();
  renderWithMantine(<TeamInvitationRecipientActions inviteId="attempt-1" onSaved={onSaved} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Decline', exact: true }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(service.declineInvite).toHaveBeenCalledWith('attempt-1');
});

it('retries the same reminder request and reports delivery failure after the save', async () => {
  service.remindTeamInvitation.mockRejectedValueOnce(new Error('Connection lost.'))
    .mockResolvedValueOnce({ delivery: { failed: true, status: 'FAILED' } });
  renderWithMantine(<TeamInvitationManager teamId="team" onChanged={async () => undefined} onInvitesLoaded={() => undefined} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Remind' }));
  expect(await screen.findByText('Connection lost.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remind' }));
  expect(await screen.findByText(/The invitation is saved. Delivery failed./)).toBeInTheDocument();
  expect(service.remindTeamInvitation.mock.calls[1]).toEqual(service.remindTeamInvitation.mock.calls[0]);
});

it('shows expiry and offers a new attempt without offering a reminder', async () => {
  service.listInvites.mockImplementation(async (query) => query.history ? [{ ...invite, status: 'EXPIRED', invitationLabel: 'Invitation expired' }] : []);
  renderWithMantine(<TeamInvitationManager teamId="team" onChanged={async () => undefined} onInvitesLoaded={() => undefined} />);
  expect(await screen.findByRole('button', { name: 'Reinvite' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Remind' })).not.toBeInTheDocument();
  expect(screen.getAllByText(/Invitation expired/).length).toBeGreaterThan(0);
});

it('shows a retry when recipient actions fail to load', async () => {
  service.getInviteById.mockRejectedValueOnce(new Error('Connection lost.'));
  renderWithMantine(<TeamInvitationRecipientActions inviteId="attempt-1" onSaved={() => undefined} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: 'Decline', exact: true })).toBeInTheDocument();
  expect(service.getInviteById).toHaveBeenCalledTimes(2);
});
