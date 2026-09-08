import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateTeamModal from '../CreateTeamModal';
import { buildTeam, buildUser } from '../../../../test/factories';
import { teamService } from '@/lib/teamService';
import { useApp } from '@/app/providers';

jest.mock('@/app/providers', () => ({ useApp: jest.fn() }));
jest.mock('@/lib/teamService', () => ({ teamService: { createTeam: jest.fn() } }));
jest.mock('@/lib/userService', () => ({ userService: { updateUser: jest.fn() } }));

describe('Create Team logo flow', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns from the image picker to the intact team form and submits the selected logo', async () => {
    const user = userEvent.setup();
    const currentUser = buildUser({ uploadedImages: ['club-logo'] });
    jest.mocked(useApp).mockReturnValue({ user: currentUser, refreshUser: jest.fn() } as ReturnType<typeof useApp>);
    jest.mocked(teamService.createTeam).mockResolvedValue(buildTeam());
    const onClose = jest.fn();
    render(<CreateTeamModal isOpen currentUser={currentUser} onClose={onClose} />);
    await user.type(screen.getByLabelText(/Team Name/i), 'Summit United');
    await user.click(screen.getByRole('combobox', { name: 'Sport' }));
    await user.click(screen.getByRole('option', { name: 'Indoor Volleyball' }));
    await user.click(screen.getByRole('button', { name: 'Select image' }));
    expect(teamService.createTeam).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Select uploaded image 1' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Select image' })).not.toBeInTheDocument());
    expect(screen.getByLabelText(/Team Name/i)).toHaveValue('Summit United');
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Create Team' }));
    expect(teamService.createTeam).toHaveBeenCalledWith(
      'Summit United', currentUser.$id, '', 'Indoor Volleyball', 6, 'club-logo', expect.any(Object),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
