import { useState, type ComponentProps } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { teamService } from '@/lib/teamService';
import type { EventRegistrationDraftState } from '@/lib/contracts/eventRegistrationDraft';
import { buildEvent, buildTeam, buildUser } from '../../../../../../../test/factories';
import { useEventSignupJourney } from '../useEventSignupJourney';
import type TeamBuilderModal from '@/components/ui/TeamBuilderModal';
import type TeamDetailModal from '@/components/ui/TeamDetailModal';
import type InvitePlayersModal from '@/app/teams/components/InvitePlayersModal';

const mockCreatedTeam = buildTeam({ $id: 'created-team', name: 'North Loop' });
jest.mock('@/components/ui/TeamBuilderModal', () => function BuilderStub({ isOpen, onTeamCreated }: ComponentProps<typeof TeamBuilderModal>) {
    return isOpen ? <button onClick={() => { void onTeamCreated?.(mockCreatedTeam); }}>Save team</button> : null;
});
jest.mock('@/components/ui/TeamDetailModal', () => function TeamManagerStub({ currentTeam, onTeamUpdated, onClose }: ComponentProps<typeof TeamDetailModal>) {
    return <><button onClick={() => onTeamUpdated?.({ ...currentTeam, name: 'Updated team' })}>Save team details</button>
        <button onClick={onClose}>Close team manager</button></>;
});
jest.mock('@/components/ui/TeamInvitationManager', () => () => null);
jest.mock('@/app/teams/components/InvitePlayersModal', () => function InviteStub({ onPlayerInviteSent, onClose }: ComponentProps<typeof InvitePlayersModal>) {
    return <><button onClick={() => { void onPlayerInviteSent?.(buildUser()); }}>Save invitation</button>
        <button onClick={onClose}>Skip invitations</button></>;
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
        event: buildEvent(), user: null, progress, selectedTeamId: team.$id, onTeamSelected: jest.fn(), onContinueToReview: jest.fn(),
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
            onTeamSelected: jest.fn(), onContinueToReview: jest.fn(),
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
    const { rerender } = render(<Harness scope="first" />);
    await waitFor(() => expect(screen.getByTestId('loaded-teams')).toHaveTextContent('First Team'));
    fireEvent.click(screen.getByRole('button', { name: 'Open Players' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add players', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save invitation' }));
    rerender(<Harness scope="second" />);
    await waitFor(() => expect(screen.getByTestId('loaded-teams')).toHaveTextContent('Second Team'));
    expect(screen.queryByRole('button', { name: 'Save invitation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Add players (optional)' })).not.toBeInTheDocument();
    await act(async () => { finishRefresh(first); });
    expect(screen.getByTestId('loaded-teams')).toHaveTextContent('Second Team');
});

function renderPreparation() {
    const saved: EventRegistrationDraftState = {
        version: 1, available: true, unavailableReason: null, invalidations: [],
        eligibleTeams: [{ id: mockCreatedTeam.$id, name: mockCreatedTeam.name, sport: mockCreatedTeam.sport }],
        selectedTeamId: mockCreatedTeam.$id, selectionSource: 'draft',
        draft: {
            id: 'draft', eventId: 'event', revision: 2, slotId: null, occurrenceDate: null,
            selectedTeamId: mockCreatedTeam.$id, selectedDivisionId: null, selectedDivisionTypeKey: null,
            answers: {}, step: 'players', completedSteps: ['team'], registrationId: null,
            holdExpiresAt: null, teamCreationId: mockCreatedTeam.$id, completedAt: null, updatedAt: '2026-09-14T00:00:00Z',
        },
    };
    const save = jest.fn(async (patch) => ({ ...saved, draft: { ...saved.draft!, ...patch } }));
    const onContinueToReview = jest.fn();
    jest.mocked(teamService.getTeamsByIds).mockResolvedValue([mockCreatedTeam]);
    function Harness() {
        const [selected, setSelected] = useState('');
        const [state, setState] = useState<EventRegistrationDraftState>({ ...saved, eligibleTeams: [], selectedTeamId: null, draft: null });
        const journey = useEventSignupJourney({
            event: buildEvent({ $id: 'event' }), user: buildUser(), selectedTeamId: selected, onTeamSelected: setSelected,
            onContinueToReview,
            progress: {
                progressKey: 'account:event', state, loading: false, saving: false, error: null,
                holdExpiresAt: null, setHoldExpiresAt: jest.fn(), clear: jest.fn(),
                save: async (patch) => {
                    const next = await save(patch);
                    setState(next);
                    return next;
                },
                reload: async () => { setState(saved); return saved; },
            },
        });
        return <>
            <output aria-label="Selected team">{selected}</output>
            <button onClick={() => { void journey.createTeam(); }}>Create team</button>
            {journey.dialogs}
        </>;
    }
    render(<Harness />);
    return { save, onContinueToReview };
}

it('keeps a newly created team selected when players are skipped and saves review before checkout', async () => {
    const { save, onContinueToReview } = renderPreparation();
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save team' }));
    const continueButton = await screen.findByRole('button', { name: 'Continue to review' });
    await waitFor(() => expect(continueButton).toBeEnabled());
    expect(screen.getByLabelText('Selected team')).toHaveTextContent('created-team');
    fireEvent.click(continueButton);
    await waitFor(() => expect(onContinueToReview).toHaveBeenCalledWith(mockCreatedTeam));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({
        selectedTeamId: 'created-team', step: 'review', completedSteps: ['team', 'players'],
    }));
    expect(teamService.getTeamById).not.toHaveBeenCalled();
});

it('uses shared team management and preserves that team when optional invitations are dismissed', async () => {
    const { onContinueToReview } = renderPreparation();
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save team' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Manage team' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Manage team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save team details' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Close team manager' })); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add players', exact: true })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Add players', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip invitations' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to review' }));
    await waitFor(() => expect(onContinueToReview).toHaveBeenCalledWith(expect.objectContaining({ $id: 'created-team' })));
    expect(screen.getByLabelText('Selected team')).toHaveTextContent('created-team');
});
