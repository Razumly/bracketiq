import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { teamService } from '@/lib/teamService';
import type { EventRegistrationDraftState } from '@/lib/contracts/eventRegistrationDraft';
import { buildEvent, buildTeam } from '../../../../../../../test/factories';
import { useEventSignupJourney } from '../useEventSignupJourney';

jest.mock('@/components/ui/TeamBuilderModal', () => () => null);
jest.mock('@/app/teams/components/InvitePlayersModal', () => function InviteStub({ onPlayerInviteSent }: { onPlayerInviteSent: () => Promise<void> }) {
    return <button onClick={() => { void onPlayerInviteSent(); }}>Save invitation</button>;
});
jest.mock('@/lib/teamService', () => ({ teamService: { getTeamsByIds: jest.fn(), getTeamById: jest.fn() } }));

beforeEach(() => jest.resetAllMocks());

it('reports an incomplete Team batch and retries without losing the selected Team', async () => {
    const team = buildTeam({ $id: 'saved-team' });
    const state: EventRegistrationDraftState = {
        version: 1, draft: null, available: true, unavailableReason: null, invalidations: [],
        eligibleTeams: [{ id: team.$id, name: team.name, sport: null }],
        selectedTeamId: team.$id, selectionSource: 'remembered',
    };
    const progress = {
        progressKey: 'account:event', state, loading: false, saving: false, error: null,
        holdExpiresAt: null, setHoldExpiresAt: jest.fn(), save: jest.fn(), clear: jest.fn(),
        reload: jest.fn().mockResolvedValue(state),
    };
    jest.mocked(teamService.getTeamsByIds).mockResolvedValueOnce([]).mockResolvedValueOnce([team]);
    const { result } = renderHook(() => useEventSignupJourney({
        event: buildEvent(), user: null, progress, selectedTeamId: team.$id,
    }));
    await waitFor(() => expect(result.current.error).toBe('Could not load your saved Teams. Reload saved progress to try again.'));
    await act(async () => { await result.current.reload(); });
    await waitFor(() => expect(result.current.teams).toEqual([team]));
    expect(result.current.error).toBeNull();
    expect(progress.save).not.toHaveBeenCalled();
    expect(teamService.getTeamsByIds).toHaveBeenCalledTimes(2);
});

it('ignores an invitation refresh that finishes after a different Event has loaded', async () => {
    const first = buildTeam({ $id: 'first-team', name: 'First Team' });
    const second = buildTeam({ $id: 'second-team', name: 'Second Team' });
    let finishRefresh!: (team: typeof first) => void;
    jest.mocked(teamService.getTeamById).mockReturnValue(new Promise((resolve) => { finishRefresh = resolve; }));
    jest.mocked(teamService.getTeamsByIds).mockResolvedValueOnce([first]).mockResolvedValueOnce([second]);
    function Harness({ scope }: { scope: 'first' | 'second' }) {
        const team = scope === 'first' ? first : second;
        const state: EventRegistrationDraftState = {
            version: 1, draft: null, available: true, unavailableReason: null, invalidations: [],
            eligibleTeams: [{ id: team.$id, name: team.name, sport: null }],
            selectedTeamId: team.$id, selectionSource: 'remembered',
        };
        const journey = useEventSignupJourney({
            event: buildEvent({ $id: scope }), user: null, selectedTeamId: team.$id,
            progress: {
                progressKey: scope, state, loading: false, saving: false, error: null,
                holdExpiresAt: null, setHoldExpiresAt: jest.fn(), save: jest.fn().mockResolvedValue(state),
                clear: jest.fn(), reload: jest.fn().mockResolvedValue(state),
            },
        });
        return <>
            <div data-testid="loaded-teams">{journey.loadingTeams ? 'Loading' : journey.teams.map((entry) => entry.name).join(',')}</div>
            <button onClick={() => { void journey.addPlayers(); }}>Open Players</button>
            {journey.dialogs}
        </>;
    }
    const { rerender } = render(<Harness scope="first" />, {
        wrapper: ({ children }) => <MantineProvider env="test">{children}</MantineProvider>,
    });
    await waitFor(() => expect(screen.getByTestId('loaded-teams')).toHaveTextContent('First Team'));
    fireEvent.click(screen.getByRole('button', { name: 'Open Players' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add players', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save invitation' }));
    rerender(<Harness scope="second" />);
    await waitFor(() => expect(screen.getByTestId('loaded-teams')).toHaveTextContent('Second Team'));
    await act(async () => { finishRefresh(first); });
    expect(screen.getByTestId('loaded-teams')).toHaveTextContent('Second Team');
});
