import { useState } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';

import { buildTeam } from '../../../../../../test/factories';
import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { EventTeamRegistrationPanel } from '../EventTeamRegistrationPanel';
import { EventCheckoutContext, EventCheckoutPage } from '../EventCheckoutLayout';

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
        return <EventCheckoutContext.Provider value={{
            eventName: props.eventName, isTeamRegistration: true, priceCents: props.priceCents,
            registrantName: props.userTeams.find((team) => team.$id === selectedTeamId)?.name,
        }}>
            <EventTeamRegistrationPanel
                {...props}
                selectedTeamId={selectedTeamId}
                onSelectedTeamChange={(teamId) => { setSelectedTeamId(teamId); actions.onSelectedTeamChange(teamId); }}
                renderPage={(content, summaryAction) => (
                    <EventCheckoutPage onBack={jest.fn()} summaryAction={summaryAction}>{content}</EventCheckoutPage>
                )}
            />
        </EventCheckoutContext.Provider>;
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

    it.each(['modal', 'page'] as const)('requires a team before continuing in %s mode', (checkoutPresentation) => {
        const actions = renderPanel({ checkoutPresentation, selectedTeamId: '' });
        const actionScope = checkoutPresentation === 'page'
            ? within(screen.getByRole('complementary', { name: 'Registration summary' })) : screen;
        const disabledAction = actionScope.getByRole('button', { name: 'Choose a team' });
        expect(disabledAction).toBeDisabled();
        fireEvent.click(disabledAction);
        expect(actions.onJoinAsTeam).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('radio', { name: 'Cascade Crew' }));
        const continueAction = actionScope.getByRole('button', { name: 'Continue with this team' });
        expect(continueAction).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Continue with this team' })).toBe(continueAction);
        fireEvent.click(continueAction);
        expect(actions.onJoinAsTeam).toHaveBeenCalledTimes(1);
    });

    it('keeps the summary action disabled when team selection still needs a division', () => {
        const actions = renderPanel({ checkoutPresentation: 'page', selectedTeamId: '', isDivisionSelectionMissing: true });
        fireEvent.click(screen.getByRole('radio', { name: 'Cascade Crew' }));
        const summary = within(screen.getByRole('complementary', { name: 'Registration summary' }));
        const continueAction = summary.getByRole('button', { name: 'Continue with this team' });
        expect(continueAction).toBeDisabled();
        fireEvent.click(continueAction);
        expect(actions.onJoinAsTeam).not.toHaveBeenCalled();
    });

    it('lets a waitlisted team leave through the summary without requiring a division or starting checkout', () => {
        const actions = renderPanel({
            checkoutPresentation: 'page',
            showTeamWaitlistActions: true,
            selectedTeamIsWaitlisted: true,
            isDivisionSelectionMissing: true,
        });
        const summary = within(screen.getByRole('complementary', { name: 'Registration summary' }));
        fireEvent.click(summary.getByRole('button', { name: 'Leave Waitlist' }));
        expect(actions.onJoinTeamWaitlist).toHaveBeenCalledTimes(1);
        expect(actions.onJoinAsTeam).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: /Continue/ })).not.toBeInTheDocument();
    });

    it('blocks a registered team from continuing but keeps withdrawal available', () => {
        const actions = renderPanel({ checkoutPresentation: 'page', selectedTeamIsRegistered: true });
        const summary = within(screen.getByRole('complementary', { name: 'Registration summary' }));
        const registeredAction = summary.getByRole('button', { name: 'Already in Event' });
        expect(registeredAction).toBeDisabled();
        fireEvent.click(registeredAction);
        expect(actions.onJoinAsTeam).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Withdraw Team' }));
        expect(actions.onWithdrawTeam).toHaveBeenCalledTimes(1);
    });

    it('keeps team creation available without offering checkout for an empty team list', () => {
        const actions = renderPanel({ checkoutPresentation: 'page', userTeams: [] });
        fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
        expect(actions.onManageTeams).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: /Continue/ })).not.toBeInTheDocument();
        expect(actions.onJoinAsTeam).not.toHaveBeenCalled();
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
