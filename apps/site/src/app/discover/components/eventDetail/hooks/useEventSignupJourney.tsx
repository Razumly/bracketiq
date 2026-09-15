import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Group, Stack, Text } from '@/components/organization/organization-operation-ui';
import TeamBuilderModal from '@/components/ui/TeamBuilderModal';
import InvitePlayersModal from '@/app/teams/components/InvitePlayersModal';
import { teamService } from '@/lib/teamService';
import type { Event, Team, UserData } from '@/types';
import type { useEventRegistrationProgress } from './useEventRegistrationProgress';
import TeamDetailModal, { type TeamDetailPageTab } from '@/components/ui/TeamDetailModal';
import TeamInvitationManager from '@/components/ui/TeamInvitationManager';
import { EventCheckoutModal } from '../EventCheckoutLayout';

type Progress = ReturnType<typeof useEventRegistrationProgress>;

export function useEventSignupJourney({ event, user, progress, selectedTeamId, onTeamSelected, onContinueToReview }: {
    event: Event; user: UserData | null | undefined; progress: Progress; selectedTeamId: string;
    onTeamSelected: (teamId: string) => void;
    onContinueToReview: (team: Team) => void;
}) {
    const [teamResult, setTeamResult] = useState<{ key: string; teams: Team[]; error: string | null } | null>(null);
    const [teamReload, setTeamReload] = useState(0);
    const [mode, setMode] = useState<'idle' | 'team' | 'players' | 'edit'>('idle');
    const [inviting, setInviting] = useState(false);
    const [dialogScope, setDialogScope] = useState(progress.progressKey);
    const [managementTab, setManagementTab] = useState<TeamDetailPageTab>('roster');
    const onInvitesLoaded = useCallback(() => undefined, []);
    const eligibleIds = JSON.stringify(progress.state?.eligibleTeams.map((team) => team.id) ?? []);
    const teamKey = JSON.stringify([progress.progressKey, eligibleIds, teamReload]);
    const activeTeamKey = useRef(teamKey);
    const activeProgressKey = useRef(progress.progressKey);
    useLayoutEffect(() => {
        activeTeamKey.current = teamKey;
        activeProgressKey.current = progress.progressKey;
    }, [teamKey, progress.progressKey]);
    const teams = teamResult?.key === teamKey ? teamResult.teams : [];
    const error = teamResult?.key === teamKey ? teamResult.error : null;
    const loadingTeams = eligibleIds !== '[]' && teamResult?.key !== teamKey;
    const setTeams = (update: (current: Team[]) => Team[]) => setTeamResult((current) => activeTeamKey.current !== teamKey ? current : ({
        key: teamKey, teams: update(current?.key === teamKey ? current.teams : []), error: null,
    }));
    const selectedTeam = teams.find((team) => team.$id === selectedTeamId);
    if (dialogScope !== progress.progressKey) {
        setDialogScope(progress.progressKey);
        setMode('idle');
        setInviting(false);
    }
    useEffect(() => {
        let cancelled = false;
        const ids: string[] = JSON.parse(eligibleIds);
        if (!ids.length) return;
        void teamService.getTeamsByIds(ids).then((loaded) => {
            if (ids.some((id) => !loaded.some((team) => team.$id === id))) {
                throw new Error('Could not load your saved Teams. Reload saved progress to try again.');
            }
            if (!cancelled) setTeamResult({ key: teamKey, teams: loaded, error: null });
        }).catch((failure: unknown) => {
            if (!cancelled) setTeamResult({ key: teamKey, teams: [], error: failure instanceof Error ? failure.message : 'Could not load eligible Teams.' });
        });
        return () => { cancelled = true; };
    }, [eligibleIds, teamKey]);

    const reload = async () => {
        await progress.reload();
        setTeamReload((current) => current + 1);
    };

    const createTeam = useCallback(async () => {
        const saved = await progress.save({
            step: 'team', selectedTeamId: null,
            teamCreationId: progress.state?.draft?.step === 'team' ? progress.state.draft.teamCreationId ?? crypto.randomUUID() : crypto.randomUUID(),
        });
        if (saved && activeProgressKey.current === progress.progressKey) {
            onTeamSelected('');
            setMode('team');
        }
    }, [onTeamSelected, progress]);

    const addPlayers = useCallback(async () => {
        if (!selectedTeamId) return;
        const saved = await progress.save({ selectedTeamId, step: 'players' });
        if (saved && activeProgressKey.current === progress.progressKey) setMode('players');
    }, [progress, selectedTeamId]);

    const continueToEvent = async () => {
        if (!selectedTeam || loadingTeams) return;
        const saved = await progress.save({
            selectedTeamId: selectedTeam.$id,
            step: 'review', completedSteps: [...new Set([...(progress.state?.draft?.completedSteps ?? []), 'team' as const, 'players' as const])],
        });
        if (saved && activeProgressKey.current === progress.progressKey) {
            setMode('idle');
            onContinueToReview(selectedTeam);
        }
    };

    const savedTeam = async (team: Team) => {
        if (activeProgressKey.current !== progress.progressKey) return;
        setTeams((current) => [...current.filter((candidate) => candidate.$id !== team.$id), team]);
        onTeamSelected(team.$id);
        await progress.reload();
        if (activeProgressKey.current === progress.progressKey) setMode('players');
    };

    const resumePreparation = async () => {
        const refreshed = await progress.reload();
        if (!refreshed?.available) return;
        if (refreshed.draft?.step === 'team' && !refreshed.draft.selectedTeamId) setMode('team');
        else if (refreshed.draft?.step === 'players') setMode('players');
    };

    const updateTeam = (updated: Team) => {
        setTeams((current) => current.map((team) => team.$id === updated.$id ? updated : team));
    };
    const refreshTeam = async () => {
        if (!selectedTeam) return;
        const refreshed = await teamService.getTeamById(selectedTeam.$id);
        if (!refreshed) throw new Error('The invitation is saved, but the roster could not be loaded. Reload saved progress.');
        updateTeam(refreshed);
    };

    const draft = progress.state?.draft;
    const preparationStep = draft?.step === 'team' || draft?.step === 'players';
    const dialogs = <>
        {mode === 'edit' && selectedTeam ? <TeamDetailModal key={selectedTeam.$id} currentTeam={selectedTeam}
            isOpen activeTab={managementTab} onActiveTabChange={setManagementTab}
            eventRegistration={{ eventId: event.$id, slotId: progress.state?.draft?.slotId, occurrenceDate: progress.state?.draft?.occurrenceDate }}
            onClose={() => { setMode(progress.state?.draft?.step === 'players' ? 'players' : 'idle'); void reload(); }}
            onTeamUpdated={updateTeam}
            onTeamDeleted={() => { setMode('idle'); void reload(); }} /> : null}
        {user && draft?.teamCreationId ? <TeamBuilderModal
            isOpen={mode === 'team'} currentUser={user} eventId={event.$id}
            registrationDraft={{ eventId: event.$id, teamId: draft.teamCreationId, baseRevision: draft.revision,
                slotId: draft.slotId, occurrenceDate: draft.occurrenceDate }}
            onTeamCreated={savedTeam}
            onClose={() => setMode((current) => current === 'team' ? 'idle' : current)}
        /> : null}
        <EventCheckoutModal step="Players" opened={mode === 'players' && !inviting} onClose={() => setMode('idle')}
            title="Add players (optional)" centered zIndex={1900}>
            <Stack>
                {selectedTeam ? <>
                    <Text component="h2" fw={700}>{selectedTeam.name}</Text>
                    <Text size="sm" c="dimmed">{selectedTeam.playerIds.length} of {selectedTeam.teamSize} players · {selectedTeam.pending.length} pending</Text>
                    <Text>Your team is saved. Add players now or skip this step. Each invitation stays pending until the player accepts.</Text>
                </> : <Text role="status">Loading your saved team...</Text>}
                {progress.error || error ? <Alert color="red">
                    {progress.error || error}
                    <Button variant="subtle" onClick={() => { void reload(); }}>Reload saved progress</Button>
                </Alert> : null}
                <Group>
                    <Button variant="default" disabled={!selectedTeam || loadingTeams} onClick={() => setInviting(true)}>Add players</Button>
                    <Button variant="default" disabled={!selectedTeam || loadingTeams} onClick={() => setMode('edit')}>Manage team</Button>
                </Group>
                {selectedTeam ? <details>
                    <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Invitation history and recovery</summary>
                    <TeamInvitationManager teamId={selectedTeam.$id} onChanged={refreshTeam} onInvitesLoaded={onInvitesLoaded} />
                </details> : null}
                <Group justify="space-between">
                    <Button variant="default" disabled={progress.saving} onClick={() => setMode('idle')}>Back to teams</Button>
                    <Button loading={progress.saving}
                        disabled={!selectedTeam || loadingTeams || Boolean(progress.error) || progress.state?.available === false}
                        onClick={() => { void continueToEvent(); }}>Continue to review</Button>
                </Group>
            </Stack>
        </EventCheckoutModal>
        {selectedTeam && inviting ? <InvitePlayersModal key={selectedTeam.$id} isOpen={true} team={selectedTeam}
            eventRegistration={{ eventId: event.$id, slotId: draft?.slotId, occurrenceDate: draft?.occurrenceDate }}
            onClose={() => setInviting(false)}
            onTeamUpdated={updateTeam}
            onPlayerInviteSent={refreshTeam}
            onInvitesSent={refreshTeam}
        /> : null}
    </>;
    return { teams, loadingTeams, error, reload, createTeam, addPlayers, editTeam: () => setMode('edit'),
        dialogOpened: mode !== 'idle', resumePreparation, preparationStep, dialogs };
}
