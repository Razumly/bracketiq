import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import ManagedPlayerClaimPage from '../[id]/page';

const requestMock = jest.fn();
const pushMock = jest.fn();
let authenticated = true;
jest.mock('@/lib/apiClient', () => ({ apiRequest: (...args: unknown[]) => requestMock(...args) }));
jest.mock('@/lib/userService', () => ({ userService: { getInviteById: jest.fn().mockResolvedValue(null) } }));
jest.mock('@/app/providers', () => ({ useApp: () => ({ isAuthenticated: authenticated, loading: false }) }));
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'invite' }),
  useSearchParams: () => new URLSearchParams('v=1&e=2000000000000&s=signed'),
  useRouter: () => ({ push: pushMock, replace: pushMock }),
}));

const preview = (needsSetup: boolean) => ({
  available: true,
  invite: { id: 'invite', profileId: 'child', isMinor: true, hasAttachedEmail: true,
    guardianSetupRequired: needsSetup, guardianDeclaration: 'I am this child’s parent or legal guardian.' },
  profile: { displayName: 'Casey River', isManaged: true, dateOfBirth: '2015-01-01' },
  team: { id: 'team', name: 'River Club' },
});

describe('guardian invitation screen', () => {
  beforeEach(() => { jest.clearAllMocks(); requestMock.mockReset(); authenticated = true; });

  it.each([true, false])('accepts the named child with setup required=%s', async (needsSetup) => {
    requestMock.mockResolvedValueOnce(preview(needsSetup)).mockResolvedValueOnce({ status: 'GUARDIAN_ACCEPTED' });
    render(<MantineProvider><ManagedPlayerClaimPage /></MantineProvider>);
    const button = await screen.findByRole('button', { name: 'Accept team invitation' });
    expect(button).toBeDisabled();
    if (needsSetup) fireEvent.click(screen.getByLabelText('I am this child’s parent or legal guardian.'));
    fireEvent.click(screen.getByLabelText('I accept this team invitation for Casey River.'));
    fireEvent.click(button);
    await screen.findByRole('heading', { name: 'Invitation accepted' });
    expect(requestMock).toHaveBeenLastCalledWith(expect.stringContaining('/api/user-profiles/child/claim'), expect.objectContaining({
      body: expect.objectContaining({ confirmation: true, guardianDeclaration: needsSetup, acceptTeamInvitation: true }),
    }));
  });

  it('keeps the signed invitation when the guardian starts authentication', async () => {
    authenticated = false;
    requestMock.mockResolvedValue(preview(true));
    render(<MantineProvider><ManagedPlayerClaimPage /></MantineProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in as guardian' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login?next=%2Fclaim%2Fplayer%2Finvite%3Fv%3D1%26e%3D2000000000000%26s%3Dsigned'));
  });

  it.each([false, true])('changes an unknown birthdate claim to guardian review with missing contact=%s', async (missingContact) => {
    const initial = preview(false);
    const guardian = preview(true);
    requestMock.mockReset();
    requestMock
      .mockResolvedValueOnce({ ...initial, invite: { ...initial.invite, isMinor: false, birthdateRequired: true }, profile: { ...initial.profile, dateOfBirth: null } })
      .mockResolvedValueOnce({ status: 'GUARDIAN_REQUIRED' })
      .mockResolvedValueOnce({ ...guardian, invite: { ...guardian.invite, guardianContactRequired: missingContact } })
      .mockResolvedValueOnce({ status: 'GUARDIAN_ACCEPTED' });
    render(<MantineProvider><ManagedPlayerClaimPage /></MantineProvider>);
    const button = await screen.findByRole('button', { name: 'Claim profile' });
    fireEvent.change(screen.getByLabelText('Date of birth', { exact: false }), { target: { value: '2015-01-01' } });
    fireEvent.click(screen.getByLabelText('I confirm that this profile belongs to me.'));
    fireEvent.click(button);
    await screen.findByRole('heading', { name: 'Accept for your child' });
    expect(screen.queryByText('I confirm that this profile belongs to me.')).not.toBeInTheDocument();
    if (missingContact) {
      expect(screen.getByText('Ask the team manager to add a guardian contact and issue a new invitation.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Accept team invitation' })).not.toBeInTheDocument();
    } else {
      expect(screen.getByRole('button', { name: 'Accept team invitation' })).toBeDisabled();
      fireEvent.click(screen.getByLabelText('I am this child’s parent or legal guardian.'));
      fireEvent.click(screen.getByLabelText('I accept this team invitation for Casey River.'));
      fireEvent.click(screen.getByRole('button', { name: 'Accept team invitation' }));
      await screen.findByRole('heading', { name: 'Invitation accepted' });
    }
  });
});
