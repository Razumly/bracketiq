import { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react';

import { buildTeam } from '../../../../../../test/factories';
import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { EventTeamRegistrationPanel } from '../EventTeamRegistrationPanel';

function renderPanel(
    overrides: Partial<React.ComponentProps<typeof EventTeamRegistrationPanel>> = {},
) {
    const actions = {
        onSelectedTeamChange: jest.fn(),
        onManageTeams: jest.fn(),
        onJoinTeamWaitlist: jest.fn(),
        onJoinAsTeam: jest.fn(),
        onWithdrawTeam: jest.fn(),
        onLeaveFreeAgents: jest.fn(),
        onJoinFreeAgents: jest.fn(),
        onViewBracket: jest.fn(),
    };
    function Harness() {
        const [selectedTeamId, setSelectedTeamId] = useState(overrides.selectedTeamId ?? 'team-one');
        return <EventTeamRegistrationPanel
            {...props}
            selectedTeamId={selectedTeamId}
            onSelectedTeamChange={(teamId) => { setSelectedTeamId(teamId); actions.onSelectedTeamChange(teamId); }}
        />;
    }
    const props: React.ComponentProps<typeof EventTeamRegistrationPanel> = {
        eventName: 'Summer Open',
        eventHasStarted: false, selectedWeeklySession: false, showTeamJoinOptions: true, isLoadingTeams: false,
        userTeams: [buildTeam({ $id: 'team-one', name: 'Cascade Crew' }), buildTeam({ $id: 'team-two', name: 'North Loop' })],
        selectedTeamId: 'team-one', showTeamWaitlistActions: false, joining: false, weeklySelectionRequired: false,
        selectedTeamIsWaitlisted: false, isDivisionSelectionMissing: false, selectedTeamIsRegistered: false,
        confirmingPurchase: false, isFreeForUser: false, priceCents: 2500, selectedTeamPaymentFailed: false,
        selfRegistrationBlockedReason: null, isMinor: false, isUserFreeAgent: false, freeAgentJoinBlockedReason: null,
        childRegistrationPanel: null, canShowScheduleButton: false, hostManageQrActions: null, renderInline: true,
        isTournament: false, sportName: 'Volleyball', totalParticipants: 4, participantCapacity: 8,
        ...actions, ...overrides,
    };
    renderWithMantine(<Harness />);
    return actions;
}

describe('EventTeamRegistrationPanel', () => {
    it('disables registration and explains closed weekly sessions', () => {
        renderPanel({
            eventHasStarted: true,
            selectedWeeklySession: true,
        });

        expect(screen.getByText(/weekly session has already started/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Add players' })).toBeDisabled();
    });

    it('changes the selected team without starting registration', () => {
        const actions = renderPanel();
        expect(screen.getByRole('radio', { name: 'Cascade Crew' })).toBeChecked();
        fireEvent.click(screen.getByRole('radio', { name: 'North Loop' }));
        expect(screen.getByRole('radio', { name: 'North Loop' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'Cascade Crew' })).not.toBeChecked();
        expect(actions.onSelectedTeamChange).toHaveBeenCalledWith('team-two');
        expect(actions.onJoinAsTeam).not.toHaveBeenCalled();
    });

    it('requires a team before review and keeps creation available', () => {
        const actions = renderPanel({ selectedTeamId: '' });
        expect(screen.getByRole('button', { name: 'Choose a team' })).toBeDisabled();
        fireEvent.click(screen.getByRole('radio', { name: 'Cascade Crew' }));
        expect(screen.getByRole('button', { name: 'Continue with this team' })).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
        expect(actions.onManageTeams).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('radio', { name: 'Cascade Crew' })).toBeChecked();
    });

    it('forwards team join, waitlist, and withdrawal actions', () => {
        const join = renderPanel({ showTeamJoinOptions: true });
        fireEvent.click(screen.getByRole('button', { name: 'Continue with this team' }));
        expect(join.onJoinAsTeam).toHaveBeenCalledTimes(1);

        const waitlist = renderPanel({
            showTeamJoinOptions: true,
            showTeamWaitlistActions: true,
        });
        fireEvent.click(screen.getByRole('button', { name: 'Join Waitlist' }));
        expect(waitlist.onJoinTeamWaitlist).toHaveBeenCalledTimes(1);

        const registered = renderPanel({
            showTeamJoinOptions: true,
            selectedTeamIsRegistered: true,
        });
        fireEvent.click(screen.getByRole('button', { name: 'Withdraw Team' }));
        expect(registered.onWithdrawTeam).toHaveBeenCalledTimes(1);
    });

    it('composes free-agent, child, host, and bracket actions', () => {
        const actions = renderPanel({
            isUserFreeAgent: true,
            childRegistrationPanel: <div>Register Avery</div>,
            canShowScheduleButton: true,
            hostManageQrActions: <button type="button">Manage schedule</button>,
            renderInline: false,
            isTournament: true,
        });

        fireEvent.click(screen.getByRole('button', { name: 'Leave Free Agent List' }));
        fireEvent.click(screen.getByRole('button', { name: 'View Tournament Bracket' }));
        expect(actions.onLeaveFreeAgents).toHaveBeenCalledTimes(1);
        expect(actions.onViewBracket).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Register Avery')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Manage schedule' })).toBeInTheDocument();
    });
});
