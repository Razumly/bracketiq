import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Team } from '@/types';
import OrganizationTeamsTabContent from '../OrganizationTeamsTabContent';

jest.mock('@/components/ui/TeamCard', () => ({
  __esModule: true,
  default: ({ team, onClick }: { team: Team; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{team.name}</button>
  ),
}));

const createTeam = (id: string, name: string): Team => ({
  $id: id,
  name,
  division: 'division_1',
  sport: 'Indoor Volleyball',
  playerIds: [],
  captainId: 'captain_1',
  pending: [],
  teamSize: 6,
  currentSize: 0,
  isFull: false,
  avatarUrl: '',
});

describe('OrganizationTeamsTabContent', () => {
  it('routes a selected team through the team click callback', async () => {
    const user = userEvent.setup();
    const onTeamClick = jest.fn();
    const team = createTeam('team_1', 'Falcons');

    render(
      <OrganizationTeamsTabContent
        teams={[team]}
        onCreateTeam={jest.fn()}
        onTeamClick={onTeamClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Falcons' }));

    expect(onTeamClick).toHaveBeenCalledWith(team);
  });

  it('allows team creation only when the viewer can manage teams', async () => {
    const user = userEvent.setup();
    const onCreateTeam = jest.fn();

    const { rerender } = render(
      <OrganizationTeamsTabContent
        teams={[]}
        canManageTeams
        onCreateTeam={onCreateTeam}
        onTeamClick={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create Team' }));
    expect(onCreateTeam).toHaveBeenCalledTimes(1);

    rerender(
      <OrganizationTeamsTabContent
        teams={[]}
        onCreateTeam={onCreateTeam}
        onTeamClick={jest.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Create Team' })).not.toBeInTheDocument();
  });

  it('shows the empty state when the organization has no teams', () => {
    render(
      <OrganizationTeamsTabContent
        teams={null}
        onCreateTeam={jest.fn()}
        onTeamClick={jest.fn()}
      />,
    );

    expect(screen.getByText('No teams yet.')).toBeInTheDocument();
  });
});
