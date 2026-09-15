import { useId, type ReactNode } from 'react';
import { Alert, Avatar, Badge, Button, Paper, Radio, Text } from '@/components/organization/organization-operation-ui';

import type { Team } from '@/types';
import { getTeamAvatarUrl } from '@/types';
import { cn } from '@/lib/utils';

type EventTeamRegistrationPanelProps = {
    eventHasStarted: boolean;
    eventName: string;
    selectedWeeklySession: boolean;
    showTeamJoinOptions: boolean;
    isLoadingTeams: boolean;
    userTeams: Team[];
    selectedTeamId: string;
    showTeamWaitlistActions: boolean;
    joining: boolean;
    weeklySelectionRequired: boolean;
    selectedTeamIsWaitlisted: boolean;
    isDivisionSelectionMissing: boolean;
    selectedTeamIsRegistered: boolean;
    confirmingPurchase: boolean;
    isFreeForUser: boolean;
    priceCents: number;
    selectedTeamPaymentFailed: boolean;
    selfRegistrationBlockedReason: string | null;
    isMinor: boolean;
    isUserFreeAgent: boolean;
    freeAgentJoinBlockedReason: string | null;
    childRegistrationPanel: ReactNode;
    canShowScheduleButton: boolean;
    hostManageQrActions: ReactNode;
    renderInline: boolean;
    isTournament: boolean;
    sportName?: string;
    totalParticipants: number;
    participantCapacity: number;
    onSelectedTeamChange: (teamId: string) => void;
    onManageTeams: () => void;
    onAddPlayers?: () => void;
    onEditTeam?: () => void;
    hasDraft?: boolean;
    onJoinTeamWaitlist: () => void;
    onJoinAsTeam: () => void;
    onWithdrawTeam: () => void;
    onLeaveFreeAgents: () => void;
    onJoinFreeAgents: () => void;
    onViewBracket: () => void;
};

export function EventTeamRegistrationPanel({
    eventHasStarted,
    eventName,
    selectedWeeklySession,
    showTeamJoinOptions,
    isLoadingTeams,
    userTeams,
    selectedTeamId,
    showTeamWaitlistActions,
    joining,
    weeklySelectionRequired,
    selectedTeamIsWaitlisted,
    isDivisionSelectionMissing,
    selectedTeamIsRegistered,
    confirmingPurchase,
    isFreeForUser,
    priceCents,
    selectedTeamPaymentFailed,
    selfRegistrationBlockedReason,
    isMinor,
    isUserFreeAgent,
    freeAgentJoinBlockedReason,
    childRegistrationPanel,
    canShowScheduleButton,
    hostManageQrActions,
    renderInline,
    isTournament,
    sportName,
    totalParticipants,
    participantCapacity,
    onSelectedTeamChange,
    onManageTeams,
    onAddPlayers,
    onEditTeam,
    hasDraft,
    onJoinTeamWaitlist,
    onJoinAsTeam,
    onWithdrawTeam,
    onLeaveFreeAgents,
    onJoinFreeAgents,
    onViewBracket,
}: EventTeamRegistrationPanelProps) {
    const selectionId = useId();
    const selectedTeam = userTeams.find((team) => team.$id === selectedTeamId);
    const selectionDisabled = joining || confirmingPurchase || eventHasStarted || weeklySelectionRequired;
    const selectionReason = weeklySelectionRequired
        ? 'Select a weekly session before choosing a team.'
        : !selectedTeam ? 'Choose a team or create one to continue.'
            : isDivisionSelectionMissing ? 'Select a division before continuing registration.' : null;
    return (
        <div className="space-y-6">
            {eventHasStarted ? (
                <Alert color="yellow" variant="light">
                    {selectedWeeklySession
                        ? 'This weekly session has already started. Joining and leaving are no longer available.'
                        : 'This event has already started. Joining and leaving are no longer available.'}
                </Alert>
            ) : null}


            {showTeamJoinOptions ? (
                <Paper withBorder p="md" radius="md" className="space-y-4">
                    <div>
                        <Text component="h2" size="xl" fw={700}>Choose a team</Text>
                        <Text c="dimmed" size="sm">Register for {eventName}. Choose a team you manage or create a new team{sportName ? ` for ${sportName}` : ''}.</Text>
                    </div>
                    {isLoadingTeams ? (
                        <Text role="status" size="sm" c="dimmed">Loading eligible teams...</Text>
                    ) : userTeams.length > 0 ? (
                        <div className="space-y-4">
                            <Radio.Group label="Eligible teams" value={selectedTeamId} onChange={onSelectedTeamChange}>
                                <div className="mt-3 space-y-3">
                                    {userTeams.map((team) => (
                                        <label key={team.$id} className={cn(
                                            'flex min-h-20 items-center gap-3 rounded-xl border p-4 focus-within:ring-2 focus-within:ring-ring',
                                            team.$id === selectedTeamId ? 'border-primary bg-primary/5' : 'border-border bg-background',
                                            selectionDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-primary',
                                        )}>
                                            <Radio value={team.$id} aria-label={team.name} aria-describedby={`${selectionId}-help`} disabled={selectionDisabled} />
                                            <Avatar src={getTeamAvatarUrl(team, 48)} name={team.name} alt="" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block font-semibold text-foreground">{team.name}</span>
                                                <span className="block text-sm text-muted-foreground">
                                                    {team.sport}{team.sport ? ' · ' : ''}{team.playerIds.length} of {team.teamSize} players
                                                    {team.pending.length > 0 ? ` · ${team.pending.length} pending` : ''}
                                                </span>
                                            </span>
                                            {team.$id === selectedTeamId ? <Badge className="shrink-0">Selected</Badge> : null}
                                        </label>
                                    ))}
                                </div>
                            </Radio.Group>

                            <div className="flex flex-wrap gap-2">
                                {onEditTeam ? <Button variant="default" onClick={onEditTeam} disabled={!selectedTeam || selectionDisabled}>Manage team</Button> : null}
                                <Button variant="default" onClick={onAddPlayers} disabled={!selectedTeamId || joining || eventHasStarted || weeklySelectionRequired}>Add players</Button>
                                <Button variant="subtle" onClick={onManageTeams} disabled={joining || eventHasStarted || weeklySelectionRequired}>Create team</Button>
                            </div>

                            <Text id={`${selectionId}-help`} size="sm" c="dimmed">
                                {selectionReason ?? 'Players are optional. Invitations remain pending until each person accepts.'}
                            </Text>
                            <div className="flex flex-col items-stretch gap-2 pt-2 sm:items-end">
                                {showTeamWaitlistActions ? (
                                    <Button
                                        onClick={onJoinTeamWaitlist}
                                        disabled={
                                            joining
                                            || eventHasStarted
                                            || weeklySelectionRequired
                                            || !selectedTeamId
                                            || (!selectedTeamIsWaitlisted && isDivisionSelectionMissing)
                                        }
                                        color="orange"
                                    >
                                        {eventHasStarted
                                            ? 'Unavailable'
                                            : joining
                                                ? 'Updating...'
                                                : (selectedTeamIsWaitlisted
                                                    ? 'Leave Waitlist'
                                                    : 'Join Waitlist')}
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={onJoinAsTeam}
                                        disabled={
                                            joining
                                            || eventHasStarted
                                            || weeklySelectionRequired
                                            || !selectedTeamId
                                            || confirmingPurchase
                                            || isDivisionSelectionMissing
                                            || selectedTeamIsRegistered
                                        }
                                        color={selectedTeamIsRegistered ? 'gray' : 'green'}
                                    >
                                        {eventHasStarted
                                            ? 'Unavailable'
                                            : selectedTeamIsRegistered
                                                ? 'Already in Event'
                                                : confirmingPurchase
                                                    ? 'Confirming purchase...'
                                                    : joining
                                                        ? 'Joining...'
                                                        : !selectedTeamId
                                                            ? 'Choose a team'
                                                            : selectedTeamPaymentFailed
                                                                ? 'Complete payment'
                                                                : hasDraft ? 'Continue registration' : 'Continue with this team'}
                                    </Button>
                                )}
                                {selectedTeamIsRegistered ? (
                                    <Button
                                        onClick={onWithdrawTeam}
                                        disabled={
                                            joining
                                            || eventHasStarted
                                            || weeklySelectionRequired
                                            || !selectedTeamId
                                        }
                                        color={!isFreeForUser && priceCents > 0 ? 'orange' : 'red'}
                                        variant="light"
                                    >
                                        {joining ? 'Withdrawing...' : 'Withdraw Team'}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3 text-center">
                            <p className="text-sm text-gray-600">
                                You have no managed teams{sportName ? ` for ${sportName}` : ''}.
                            </p>
                            <Button variant="default" onClick={onManageTeams} disabled={joining || eventHasStarted || weeklySelectionRequired}>
                                Create team
                            </Button>
                            <div className="text-center">
                                <Text size="sm" c="dimmed">
                                    {totalParticipants} / {participantCapacity} total participants
                                    {selectionReason ? <span className="block">{selectionReason}</span> : null}
                                </Text>
                            </div>
                        </div>
                    )}
                </Paper>
            ) : null}

            {!selfRegistrationBlockedReason && isMinor ? (
                <Alert color="blue" variant="light">
                    Tap Send to request parent/guardian approval before joining as a free agent.
                </Alert>
            ) : null}
            {isUserFreeAgent ? (
                <div className="space-y-2">
                    <div className="w-full rounded-lg bg-purple-50 px-4 py-2 text-center font-medium text-purple-700">
                        You are listed as a free agent
                    </div>
                    <button
                        type="button"
                        onClick={onLeaveFreeAgents}
                        disabled={joining || eventHasStarted}
                        className={`min-h-11 w-full rounded-lg px-4 py-2 font-medium text-white transition-colors ${
                            joining || eventHasStarted
                                ? 'cursor-not-allowed bg-gray-400'
                                : 'bg-red-600 hover:bg-red-700'
                        }`}
                    >
                        {eventHasStarted
                            ? 'Unavailable'
                            : (joining ? 'Updating…' : 'Leave Free Agent List')}
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={onJoinFreeAgents}
                    disabled={joining || Boolean(freeAgentJoinBlockedReason)}
                    className={`min-h-11 w-full rounded-lg px-4 py-2 font-medium text-white transition-colors ${
                        joining || freeAgentJoinBlockedReason
                            ? 'cursor-not-allowed bg-gray-400'
                            : 'bg-purple-600 hover:bg-purple-700'
                    }`}
                >
                    {joining
                        ? (isMinor ? 'Sending…' : 'Adding…')
                        : freeAgentJoinBlockedReason
                            ? 'Unavailable'
                            : isMinor
                                ? 'Send'
                                : 'Join as Free Agent (Free)'}
                </button>
            )}
            {freeAgentJoinBlockedReason ? <Text size="sm" c="dimmed">{freeAgentJoinBlockedReason}</Text> : null}

            {childRegistrationPanel}

            {canShowScheduleButton ? (
                <div className="mt-2">{hostManageQrActions}</div>
            ) : null}

            {!renderInline && isTournament ? (
                <button
                    type="button"
                    onClick={onViewBracket}
                    className="mt-2 min-h-11 w-full rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                >
                    View Tournament Bracket
                </button>
            ) : null}
        </div>
    );
}
