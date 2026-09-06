import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import TeamBuilderModal from '@/components/ui/TeamBuilderModal';
import InvitePlayersModal from '@/app/teams/components/InvitePlayersModal';
import { teamService } from '@/lib/teamService';
import type { Event, Team, UserData } from '@/types';
import type { useEventRegistrationProgress } from './useEventRegistrationProgress';

type Progress = ReturnType<typeof useEventRegistrationProgress>;

export function useEventSignupJourney({ event, user, progress, selectedTeamId }: {
    event: Event; user: UserData | null | undefined; progress: Progress; selectedTeamId: string;
}) {
    const [teamResult, setTeamResult] = useState<{ key: string; teams: Team[]; error: string | null } | null>(null);
    const [teamReload, setTeamReload] = useState(0);
    const [mode, setMode] = useState<'idle' | 'team' | 'players'>('idle');
    const [inviting, setInviting] = useState(false);
    const [dialogScope, setDialogScope] = useState(progress.progressKey);
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
        if (saved) setMode('team');
    }, [progress]);

    const addPlayers = useCallback(async () => {
        if (!selectedTeamId) return;
        const saved = await progress.save({ selectedTeamId, step: 'players' });
        if (saved) setMode('players');
    }, [progress, selectedTeamId]);

    const continueToEvent = async () => {
        const saved = await progress.save({
            step: 'review', completedSteps: [...new Set([...(progress.state?.draft?.completedSteps ?? []), 'team' as const, 'players' as const])],
        });
        if (saved) setMode('idle');
    };

    const savedTeam = async (team: Team) => {
        setTeams((current) => [...current.filter((candidate) => candidate.$id !== team.$id), team]);
        await progress.reload();
        if (activeProgressKey.current === progress.progressKey) setMode('players');
    };

    const resumePreparation = async () => {
        const refreshed = await progress.reload();
        if (!refreshed?.available) return;
        if (refreshed.draft?.step === 'team' && !refreshed.draft.selectedTeamId) setMode('team');
        else if (refreshed.draft?.step === 'players') setMode('players');
    };

    const draft = progress.state?.draft;
    const preparationStep = draft?.step === 'team' || draft?.step === 'players';
    const dialogs = <>
        {user && draft?.teamCreationId ? <TeamBuilderModal
            isOpen={mode === 'team'} currentUser={user} eventId={event.$id}
            registrationDraft={{ eventId: event.$id, teamId: draft.teamCreationId, baseRevision: draft.revision,
                slotId: draft.slotId, occurrenceDate: draft.occurrenceDate }}
            onTeamCreated={savedTeam}
            onClose={() => setMode((current) => current === 'team' ? 'idle' : current)}
        /> : null}
        <Modal opened={mode === 'players' && !inviting} onClose={() => setMode('idle')}
            title="Add players (optional)" centered zIndex={1900}>
            <Stack>
                <Text>{selectedTeam?.name ?? 'Your Team'} is saved. You can add Players now or later.</Text>
                <Text size="sm" c="dimmed">Continue to review the Event requirements and confirm registration.</Text>
                {progress.error ? <Alert color="red">{progress.error}</Alert> : null}
                <Group>
                    <Button variant="default" disabled={!selectedTeam} onClick={() => setInviting(true)}>Add players</Button>
                    <Button loading={progress.saving} onClick={() => { void continueToEvent(); }}>Continue to event</Button>
                </Group>
            </Stack>
        </Modal>
        {selectedTeam && inviting ? <InvitePlayersModal isOpen={true} team={selectedTeam}
            eventRegistration={{ eventId: event.$id, slotId: draft?.slotId, occurrenceDate: draft?.occurrenceDate }}
            onClose={() => setInviting(false)}
            onPlayerInviteSent={async () => {
                const refreshed = await teamService.getTeamById(selectedTeam.$id);
                if (refreshed) setTeams((current) => current.map((team) => team.$id === refreshed.$id ? refreshed : team));
            }}
            onInvitesSent={async () => {
                const refreshed = await teamService.getTeamById(selectedTeam.$id);
                if (refreshed) setTeams((current) => current.map((team) => team.$id === refreshed.$id ? refreshed : team));
            }}
        /> : null}
    </>;
    return { teams, loadingTeams, error, reload, createTeam, addPlayers, resumePreparation, preparationStep, dialogs };
}
