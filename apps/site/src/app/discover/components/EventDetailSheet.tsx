import React, { useState, useCallback, useRef } from 'react';
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import type { JoinIntent } from './eventDetail/eventRegistrationCommands';
import { useEventSignupJourney } from './eventDetail/hooks/useEventSignupJourney';
import { EventCheckoutContext, EventCheckoutModal } from './eventDetail/EventCheckoutLayout';
import TeamCard from '@/components/ui/TeamCard';
import { useRouter } from 'next/navigation';
import {
    Event,
    Team,
    getEventImageFallbackUrl,
    getEventImageUrl,
} from '@/types';
import type { WeeklyOccurrenceSelection } from '@/lib/eventService';
import { useEventDetailDataController } from './eventDetail/hooks/useEventDetailDataController';
import { useEventSigningController } from './eventDetail/hooks/useEventSigningController';
import { useRegistrationQuestionsController } from './eventDetail/hooks/useRegistrationQuestionsController';
import { useEventCheckoutController } from './eventDetail/hooks/useEventCheckoutController';
import { useEventJoinFinalizationController } from './eventDetail/hooks/useEventJoinFinalizationController';
import { useRegistrationConfirmationController } from './eventDetail/hooks/useRegistrationConfirmationController';
import { useJoinCardDocking } from './eventDetail/hooks/useJoinCardDocking';
import { useDivisionSelectionSynchronization } from './eventDetail/hooks/useDivisionSelectionSynchronization';
import { useEventDetailInactiveReset } from './eventDetail/hooks/useEventDetailInactiveReset';
import { useEventDivisionRegistrationModel } from './eventDetail/hooks/useEventDivisionRegistrationModel';
import { useEventParticipantModel } from './eventDetail/hooks/useEventParticipantModel';
import { useRegistrationWorkflowController } from './eventDetail/hooks/useRegistrationWorkflowController';
import { useWeeklyEventSelectionModel } from './eventDetail/hooks/useWeeklyEventSelectionModel';
import { useEventDetailNavigationController } from './eventDetail/hooks/useEventDetailNavigationController';
import { useEventDetailPresentationController } from './eventDetail/hooks/useEventDetailPresentationController';
import { createEventJoinActions } from './eventDetail/eventJoinActions';
import { createEventParticipantActions } from './eventDetail/eventParticipantActions';
import { buildEventDetailPublicModel } from './eventDetail/eventDetailPublicModel';
import { EventDetailMainContent } from './eventDetail/EventDetailMainContent';
import { EventDetailOverlays } from './eventDetail/EventDetailOverlays';
import { EventDetailRegistrationPanels } from './eventDetail/EventDetailRegistrationPanels';
import { useApp } from '@/app/providers';
import {
    trackEventOutboundClicked,
    trackEventRegistrationStarted,
} from '@/lib/analytics/eventAnalytics';
// Replaced shadcn Select with Mantine Select

interface EventDetailSheetProps {
    event: Event;
    isOpen: boolean;
    onClose: () => void;
    renderInline?: boolean;
    selectedOccurrence?: WeeklyOccurrenceSelection | null;
    onWeeklyOccurrenceChange?: (occurrence: { slotId: string; occurrenceDate: string } | null) => void;
    publicCompletion?: {
        slug: string;
        redirectUrl?: string | null;
    };
}

const SHEET_POPOVER_Z_INDEX = 1800;
const SIGN_MODAL_Z_INDEX = SHEET_POPOVER_Z_INDEX + 200;
const JOIN_API_TIMEOUT_MS = 5_000;

export default function EventDetailSheet({
    event,
    isOpen,
    onClose,
    renderInline = false,
    selectedOccurrence = null,
    onWeeklyOccurrenceChange,
    publicCompletion,
}: EventDetailSheetProps) {
    const todayForDob = new Date();
    const [checkoutOpened, setCheckoutOpened] = useState(false);
    const [checkoutIntent, setCheckoutIntent] = useState<JoinIntent | null>(null);
    const reviewSubmitting = useRef(false);
    const presentationController = useEventDetailPresentationController();
    const {
        user,
        authUser,
        refreshSession,
        userTeams: cachedUserTeams,
        userTeamsLoading,
    } = useApp();
    const router = useRouter();
    const isActive = renderInline ? Boolean(isOpen) : isOpen;
    const {
        currentEvent,
        players,
        teams,
        freeAgents,
        currentUserPaymentFailed,
        paymentFailedTeamIds,
        isLoadingEvent,
        hostUser,
        children,
        childrenLoading,
        childrenError,
        userTeams: locallyManagedTeams,
        isLoadingTeams: localTeamsLoading,
        registrationQuestions,
        registrationQuestionAnswers,
        setRegistrationQuestionAnswers,
        reload: loadEventDetails,
    } = useEventDetailDataController({
        event,
        isActive,
        renderInline,
        selectedOccurrence,
        user,
        cachedUserTeams,
        userTeamsLoading: Boolean(userTeamsLoading),
    });
    const {
        selectedFreeAgentActionUser,
        setCapacityBreakdownOpened: setShowCapacityBreakdown,
        closeFreeAgentsDropdown,
        closeFreeAgentActions,
    } = presentationController;
    const [joining, setJoining] = useState(false);
    const [finalReview, setFinalReview] = useState<JoinIntent | null>(null);
    React.useEffect(() => { setFinalReview(null); setCheckoutOpened(false); setCheckoutIntent(null); }, [isActive, currentEvent.$id, selectedOccurrence?.slotId, selectedOccurrence?.occurrenceDate]);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [joinNotice, setJoinNotice] = useState<string | null>(null);
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [selectedDivisionId, setSelectedDivisionId] = useState('');
    const [selectedDivisionTypeKey, setSelectedDivisionTypeKey] = useState('');
    const [selectedChildId, setSelectedChildId] = useState('');
    const [joiningChildFreeAgent, setJoiningChildFreeAgent] = useState(false);
    const registrationWorkflowController = useRegistrationWorkflowController();
    const {
        setPhase: setRegistrationWorkflowPhase,
        setManualPaymentOpened: setShowManualPaymentModal,
        setConfirmingPurchase,
        setPaymentPlanPreview,
        reset: resetRegistrationWorkflow,
        showSignModal,
        paymentPlanPreview,
    } = registrationWorkflowController;
    const joinCardDocking = useJoinCardDocking({ active: isActive, inline: renderInline });

    const weeklyModel = useWeeklyEventSelectionModel({
        event: currentEvent,
        selectedOccurrence,
    });
    const {
        eventPublicUrl: currentEventPublicUrl,
        organizationLogoId: currentOrganizationLogoId,
        isWeeklyParentEvent,
        selectedWeeklyOccurrenceOption,
        selectedWeeklyOccurrence,
        weeklySelectionRequired,
    } = weeklyModel;
    const checkoutController = useEventCheckoutController({
        user,
        eventId: currentEvent?.$id,
        occurrence: selectedWeeklyOccurrence,
        registrationQuestionAnswers,
        selectedTeamId,
        selectedDivisionId,
        selectedDivisionTypeKey,
        setRegistrationQuestionAnswers,
        setSelectedTeamId,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
        setJoining,
        setJoinError,
        setWorkflowPhase: setRegistrationWorkflowPhase,
    });
    const {
        saveProgress: saveEventRegistrationProgress,
        clearProgress: clearEventRegistrationProgress,
        prepareCheckout: prepareEventCheckout,
    } = checkoutController;
    const signupJourney = useEventSignupJourney({ event: currentEvent, user, progress: checkoutController.progress, selectedTeamId });
    const userTeams = currentEvent.teamSignup ? signupJourney.teams : locallyManagedTeams;
    const isLoadingTeams = currentEvent.teamSignup
        ? checkoutController.progress.loading || signupJourney.loadingTeams : localTeamsLoading;
    const divisionRegistrationModel = useEventDivisionRegistrationModel({
        event: currentEvent,
        user,
        children,
        teams,
        selectedChildId,
        selectedDivisionId,
        selectedDivisionTypeKey,
        selectedWeeklyOccurrence,
        selectedWeeklyOccurrenceOption,
        isWeeklyParentEvent,
        saveRegistrationProgress: saveEventRegistrationProgress,
        onSelectedDivisionIdChange: setSelectedDivisionId,
        onSelectedDivisionTypeKeyChange: setSelectedDivisionTypeKey,
    });
    const eventImageFallbackUrl = React.useMemo(
        () => getEventImageFallbackUrl({ event: currentEvent, width: 1200, height: 675, fit: 'inside' }),
        [currentEvent],
    );
    const eventImageUrl = React.useMemo(
        () => getEventImageUrl({
            imageId: currentEvent.imageId,
            width: 1200,
            height: 675,
            placeholderUrl: eventImageFallbackUrl,
            fit: 'inside',
        }),
        [currentEvent.imageId, eventImageFallbackUrl],
    );
    const navigationController = useEventDetailNavigationController({
        event: currentEvent,
        user,
        refreshSession,
        onClose,
        onWeeklyOccurrenceChange,
        publicCompletion,
        clearRegistrationProgress: clearEventRegistrationProgress,
        setJoinError,
        setJoinNotice,
    });
    const {
        eventStartDate,
        eventMinAge,
        eventMaxAge,
        hasAgeLimits,
        eventHasStarted,
        joinClosedMessage,
        registrationByDivisionType,
        divisionOptions,
        divisionDisplayNameIndex,
        selectedDivisionOption,
        resolvedDivisionSelectionPayload,
        isDivisionSelectionMissing,
        selectedDivisionAtCapacity,
        selectedDivisionBilling,
        checkoutEvent,
        paymentPlanPreviewRows,
        isMinor,
        selfRegistrationBlockedReason,
        canRegisterChild,
        isEventHost,
        isFreeForUser,
    } = divisionRegistrationModel;

    const {
        maxAuthDob,
        navigateToCompletion: navigateToPublicEventCompletion,
    } = navigationController;
    useDivisionSelectionSynchronization({
        options: divisionOptions,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
    });

    const joinFinalizationController = useEventJoinFinalizationController({
        event: currentEvent,
        checkoutEvent,
        user,
        billing: selectedDivisionBilling,
        occurrence: selectedWeeklyOccurrence,
        selection: resolvedDivisionSelectionPayload,
        weeklySelectionRequired,
        isDivisionSelectionMissing,
        registrationByDivisionType,
        selectedDivisionAtCapacity,
        isFreeForUser,
        selectedTeamId,
        userTeams,
        playerCount: players.length,
        teamCount: teams.length,
        timeoutMs: JOIN_API_TIMEOUT_MS,
        prepareCheckout: prepareEventCheckout,
        reload: loadEventDetails,
        navigateToCompletion: navigateToPublicEventCompletion,
        clearProgress: clearEventRegistrationProgress,
        setJoinError,
        setJoinNotice,
        setManualPaymentOpened: setShowManualPaymentModal,
    });
    const {
        registeringChild,
        setRegisteringChild,
        childRegistrationChildId,
        ensureWeeklyOccurrenceSelected,
        finalizeJoin: commitJoin,
        resetChildRegistrationState,
    } = joinFinalizationController;
    const finalizeJoin = useCallback(async (intent: JoinIntent) => {
        setFinalReview(intent);
        setJoining(false);
        setRegisteringChild(false);
    }, [setRegisteringChild]);
    const registrationConfirmationController = useRegistrationConfirmationController({
        event: currentEvent,
        user,
        selectedTeamId,
        occurrence: selectedWeeklyOccurrence,
        reload: loadEventDetails,
        navigateToCompletion: navigateToPublicEventCompletion,
        setConfirming: setConfirmingPurchase,
        setJoinError,
        setJoinNotice,
    });

    const signingController = useEventSigningController({
        event: currentEvent,
        user,
        userEmail: authUser?.email,
        signingOpened: showSignModal,
        timeoutMs: JOIN_API_TIMEOUT_MS,
        onFinalize: finalizeJoin,
        setWorkflowPhase: setRegistrationWorkflowPhase,
        setJoining,
        setJoiningChildFreeAgent,
        setJoinError,
        setJoinNotice,
    });
    const {
        beginSigningFlow: startSigning,
        resetSigningState,
    } = signingController;
    const beginSigningFlow = useCallback((intent: JoinIntent) => {
        setCheckoutIntent(intent);
        return startSigning(intent);
    }, [startSigning]);

    const registrationQuestionsController = useRegistrationQuestionsController({
        questions: registrationQuestions,
        answers: registrationQuestionAnswers,
        setAnswers: setRegistrationQuestionAnswers,
        event: currentEvent,
        user,
        isMinor,
        selection: resolvedDivisionSelectionPayload,
        occurrence: selectedWeeklyOccurrence,
        saveProgress: saveEventRegistrationProgress,
        beginSigning: beginSigningFlow,
        finalizeJoin,
        reload: loadEventDetails,
        setWorkflowPhase: setRegistrationWorkflowPhase,
        setJoining,
        setJoinError,
        setJoinNotice,
    });
    const {
        shouldAsk: shouldAskRegistrationQuestions,
        open: openRegistrationQuestionsStep,
        reset: resetRegistrationQuestions,
    } = registrationQuestionsController;

    useEventDetailInactiveReset({
        active: isActive,
        setJoinError,
        setJoinNotice,
        resetRegistrationWorkflow,
        resetSigningState,
        setShowCapacityBreakdown,
        setSelectedChildId,
        resetChildRegistrationState,
        setJoiningChildFreeAgent,
        resetRegistrationQuestions,
        setPaymentPlanPreviewState: setPaymentPlanPreview,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
    });

    const handleInviteFreeAgentToTeam = useCallback(() => {
        if (!selectedFreeAgentActionUser || !currentEvent.$id) {
            return;
        }
        const params = new URLSearchParams({
            event: currentEvent.$id,
            freeAgent: selectedFreeAgentActionUser.$id,
        });
        closeFreeAgentsDropdown();
        closeFreeAgentActions();
        router.push(`/teams?${params.toString()}`);
    }, [
        closeFreeAgentActions,
        closeFreeAgentsDropdown,
        currentEvent.$id,
        router,
        selectedFreeAgentActionUser,
    ]);

    const isTeamSignup = Boolean(currentEvent.teamSignup);
    const participantModel = useEventParticipantModel({
        event: currentEvent,
        user,
        players,
        teams,
        freeAgents,
        children,
        childrenLoading,
        childrenError,
        selectedChildId,
        childRegistrationChildId,
        eventStartDate,
        eventMinAge,
        eventMaxAge,
        hasAgeLimits,
        isTeamSignup,
        selectedDivisionOption,
        canRegisterChild,
    });
    const {
        normalizedWaitlistIdSet,
        selectedChild,
        selectedChildEligible,
        selectedChildIsFreeAgent,
        selectedChildIsWaitlisted,
        selectedChildIsRegistered,
    } = participantModel;

    // Update the join event handlers
    if (!currentEvent) return null;
    if (!isActive) return null;

    const publicModel = buildEventDetailPublicModel({
        event: currentEvent,
        user,
        hostUser,
        teams,
        participantCapacity: participantModel.participantCapacity,
        spotsLeft: participantModel.spotsLeft,
        selectedDivisionBillingPriceCents: selectedDivisionBilling.priceCents,
        selectedDivisionOption,
        divisionDisplayNameIndex,
        isEventHost,
        renderInline,
        isWeeklyParentEvent,
        now: todayForDob,
    });
    const selectedTeamIsWaitlisted = Boolean(selectedTeamId && normalizedWaitlistIdSet.has(selectedTeamId));
    const joinActions = createEventJoinActions({
        event: currentEvent,
        user,
        eventHasStarted,
        joinClosedMessage,
        isDivisionSelectionMissing,
        registrationByDivisionType,
        selfRegistrationBlockedReason,
        isMinor,
        billing: selectedDivisionBilling,
        selection: resolvedDivisionSelectionPayload,
        occurrence: selectedWeeklyOccurrence,
        selectedChildId,
        selectedChildEligible,
        selectedChildIsFreeAgent,
        selectedChildIsWaitlisted,
        selectedChildIsRegistered,
        selectedChildEmail: selectedChild?.email ?? null,
        playerCount: players.length,
        selectedTeamId,
        selectedTeamIsWaitlisted,
        userTeams,
        paymentPlanPreview,
        timeoutMs: JOIN_API_TIMEOUT_MS,
        resumedTeamAnswers: checkoutController.progress.state?.draft?.completedSteps.includes('questions')
            && registrationQuestions.every((question) => !question.required || registrationQuestionAnswers[question.id]?.trim())
            ? registrationQuestions.map((question) => ({ questionId: question.id, answer: registrationQuestionAnswers[question.id] ?? '' }))
            : undefined,
        ensureWeeklyOccurrenceSelected,
        shouldAskRegistrationQuestions,
        openRegistrationQuestionsStep,
        beginSigningFlow,
        finalizeJoin,
        reload: loadEventDetails,
        setJoining,
        setJoiningChildFreeAgent,
        setRegisteringChild,
        setJoinError,
        setJoinNotice,
        setPaymentPlanPreview,
    });
    const { continuePaymentPlanPreview } = joinActions;
    const freeAgentJoinBlockedReason = weeklySelectionRequired
        ? 'Select a weekly session before joining as a free agent.'
        : selfRegistrationBlockedReason;
    const participantActions = createEventParticipantActions({
        event: currentEvent,
        user,
        occurrence: selectedWeeklyOccurrence,
        selection: resolvedDivisionSelectionPayload,
        isMinor,
        freeAgentJoinBlockedReason,
        shouldAskRegistrationQuestions,
        openRegistrationQuestionsStep,
        reload: loadEventDetails,
        setJoining,
        setJoinError,
        setJoinNotice,
    });
    const registrationSteps = (
        <Stack gap="sm">
        {!currentEvent.teamSignup && childrenLoading ? <Text size="sm" c="dimmed">Checking linked children...</Text> : null}
        {!currentEvent.teamSignup && childrenError ? <Alert color="red">{childrenError}</Alert> : null}
        {checkoutController.progress.error || signupJourney.error ? <Alert color="red">
            {checkoutController.progress.error || signupJourney.error}
            <Button variant="subtle" onClick={() => { void signupJourney.reload(); }}>Reload saved progress</Button>
        </Alert> : null}
        {checkoutController.progress.state?.unavailableReason ? <Alert color="yellow">{checkoutController.progress.state.unavailableReason}</Alert> : null}
        {checkoutController.progress.state?.invalidations.map((message) => <Alert key={message} color="yellow">{message}</Alert>)}
        <EventDetailRegistrationPanels
            childrenError={childrenError}
            childrenLoading={childrenLoading}
            currentEvent={currentEvent}
            currentUserPaymentFailed={currentUserPaymentFailed}
            divisionModel={divisionRegistrationModel}
            eventTeams={teams}
            isLoadingTeams={isLoadingTeams}
            joinActions={joinActions}
            joining={joining || checkoutController.progress.saving || checkoutController.progress.loading
                || checkoutController.progress.state?.available === false || Boolean(checkoutController.progress.error)}
            joiningChildFreeAgent={joiningChildFreeAgent}
            joinFinalizationController={joinFinalizationController}
            onManageTeams={() => { void signupJourney.createTeam(); }}
            onAddPlayers={() => { void signupJourney.addPlayers(); }}
            onEditTeam={signupJourney.editTeam}
            hasDraft={Boolean(checkoutController.progress.state?.draft && !checkoutController.progress.state.draft.completedAt)}
            onResumePreparation={signupJourney.preparationStep ? () => { void signupJourney.resumePreparation(); } : undefined}
            onSelectedChildChange={(childId) => { setSelectedChildId(childId); setCheckoutIntent(null); }}
            onSelectedTeamChange={(teamId) => {
                setCheckoutIntent(null);
                setSelectedTeamId(teamId);
                saveEventRegistrationProgress({ selectedTeamId: teamId || null });
            }}
            onViewBracket={navigationController.viewBracket}
            onViewSchedule={navigationController.viewSchedule}
            participantActions={{ ...participantActions, handleJoinFreeAgents: async () => {
                if (isMinor) { await participantActions.handleJoinFreeAgents(); return; }
                const intent: JoinIntent = { mode: 'user_free_agent' };
                setCheckoutIntent(intent);
                if (shouldAskRegistrationQuestions(intent)) { openRegistrationQuestionsStep(intent); return; }
                try { if (!await beginSigningFlow(intent)) await finalizeJoin(intent); }
                catch (failure) { setJoinError(failure instanceof Error ? failure.message : 'Could not start registration.'); }
            } }}
            participantModel={participantModel}
            paymentFailedTeamIds={paymentFailedTeamIds}
            presentationController={presentationController}
            publicModel={publicModel}
            registrationWorkflowController={registrationWorkflowController}
            renderInline={renderInline}
            selectedChildId={selectedChildId}
            selectedTeamId={selectedTeamId}
            selectedTeamIsWaitlisted={selectedTeamIsWaitlisted}
            userTeams={userTeams}
            weeklyModel={weeklyModel}
        />
        </Stack>
    );
    const registrationDialogs = <>
        {signupJourney.dialogs}
        <EventCheckoutModal opened={Boolean(finalReview)} onClose={() => setFinalReview(null)} title="Review Event registration" step="Review and pay" centered zIndex={2000}>
            <Stack>
                <Text fw={600}>{currentEvent.name}</Text>
                {finalReview?.team ? <TeamCard team={finalReview.team} showTeamMetadata={false} /> : null}
                {finalReview?.childId ? <Text fw={600}>{participantModel.childOptions.find((child) => child.value === finalReview.childId)?.label}</Text> : null}
                {selectedDivisionOption?.name ? <Text>{selectedDivisionOption.name}</Text> : null}
                <Text size="sm">Confirm to continue with the Event registration and payment requirements.</Text>
                <Group>
                    <Button variant="default" onClick={() => setFinalReview(null)}>Back</Button>
                    <Button loading={joining} onClick={async () => {
                        if (!finalReview || reviewSubmitting.current) return;
                        reviewSubmitting.current = true;
                        const intent = finalReview;
                        setFinalReview(null);
                        setJoining(true);
                        try { await commitJoin(intent); }
                        catch (failure) { setJoinError(failure instanceof Error ? failure.message : 'Registration could not be completed.'); }
                        finally { setJoining(false); reviewSubmitting.current = false; }
                    }}>Confirm registration</Button>
                </Group>
            </Stack>
        </EventCheckoutModal>
    </>;
    const workflowStepOpened = registrationWorkflowController.showRegistrationQuestionsModal
        || registrationWorkflowController.showPasswordModal || registrationWorkflowController.showSignModal
        || registrationWorkflowController.showCheckoutPreviewModal || registrationWorkflowController.showBillingAddressModal
        || registrationWorkflowController.showPaymentModal || registrationWorkflowController.showManualPaymentModal
        || Boolean(registrationWorkflowController.paymentPlanPreview);
    const registrationPanel = <Button fullWidth size="md" onClick={() => { setCheckoutIntent(null); setCheckoutOpened(true); }}>
        {checkoutController.progress.state?.draft ? 'Continue registration' : 'Register'}
    </Button>;
    const content = (
        <EventDetailMainContent
            currentEvent={currentEvent}
            divisionModel={divisionRegistrationModel}
            eventImageFallbackUrl={eventImageFallbackUrl}
            eventImageUrl={eventImageUrl}
            freeAgents={freeAgents}
            hasUser={Boolean(user)}
            hostUser={hostUser}
            isLoadingEvent={isLoadingEvent}
            joinCardDocking={joinCardDocking}
            joinError={checkoutOpened ? null : joinError}
            joinNotice={checkoutOpened ? null : joinNotice}
            navigationController={navigationController}
            onAffiliateClick={() => {
                if (!publicModel.affiliateActionUrl) {
                    return;
                }
                trackEventOutboundClicked(currentEvent, publicModel.affiliateActionUrl, 'event_detail');
                trackEventRegistrationStarted(currentEvent, 'affiliate', {
                    destination_selected: true,
                });
            }}
            onClearWeeklyOccurrence={onWeeklyOccurrenceChange
                ? () => onWeeklyOccurrenceChange(null)
                : undefined}
            onClose={onClose}
            onRefundSuccess={loadEventDetails}
            participantModel={participantModel}
            players={players}
            presentationController={presentationController}
            publicModel={publicModel}
            registrationPanel={registrationPanel}
            renderInline={renderInline}
            sheetPopoverZIndex={SHEET_POPOVER_Z_INDEX}
            teams={teams}
            weeklyModel={weeklyModel}
        />
    );

    return (
        <EventCheckoutContext.Provider value={{
            eventName: currentEvent.name,
            imageUrl: eventImageUrl,
            divisionName: selectedDivisionOption?.name,
            registrantName: checkoutIntent?.mode === 'user_free_agent' ? 'You · Free agent' : isTeamSignup
                ? userTeams.find((team) => team.$id === selectedTeamId)?.name
                : selectedChildId
                    ? participantModel.childOptions.find((child) => child.value === selectedChildId)?.label
                    : [user?.firstName, user?.lastName].filter(Boolean).join(' '),
            priceCents: checkoutIntent?.mode === 'user_free_agent' ? 0 : selectedDivisionBilling.priceCents,
        }}>
            {content}
            {checkoutOpened ? <EventCheckoutModal keepMounted opened={!workflowStepOpened && !finalReview && !signupJourney.dialogOpened}
                onClose={() => setCheckoutOpened(false)} title="Event checkout" step="Entry" centered zIndex={1700}>
                {joinError ? <Alert color="red">{joinError}</Alert> : null}
                {joinNotice ? <Alert color="blue">{joinNotice}</Alert> : null}
                {registrationSteps}
            </EventCheckoutModal> : null}
            {registrationDialogs}
            <EventDetailOverlays
                checkoutController={checkoutController}
                checkoutEvent={checkoutEvent}
                currentEvent={currentEvent}
                currentEventPublicUrl={currentEventPublicUrl}
                currentOrganizationLogoId={currentOrganizationLogoId}
                divisionDisplayNameIndex={divisionDisplayNameIndex}
                freeAgents={freeAgents}
                isLoadingEvent={isLoadingEvent}
                isTeamSignup={isTeamSignup}
                joinError={joinError}
                joining={joining}
                joinFinalizationController={joinFinalizationController}
                maxAuthDob={maxAuthDob}
                navigationController={navigationController}
                onContinuePaymentPlanPreview={continuePaymentPlanPreview}
                onInviteFreeAgentToTeam={handleInviteFreeAgentToTeam}
                onParticipantReload={() => loadEventDetails(currentEvent.$id, { automatic: false })}
                onSetJoinNotice={setJoinNotice}
                participantsVisible={publicModel.showParticipantsSection}
                paymentPlanPreviewRows={paymentPlanPreviewRows}
                players={players}
                presentationController={presentationController}
                registeringChild={registeringChild}
                registrationConfirmationController={registrationConfirmationController}
                registrationQuestionAnswers={registrationQuestionAnswers}
                registrationQuestions={registrationQuestions}
                registrationQuestionsController={registrationQuestionsController}
                registrationWorkflowController={registrationWorkflowController}
                selectedDivisionName={selectedDivisionOption?.name}
                selectedDivisionPriceCents={selectedDivisionBilling.priceCents}
                signingController={signingController}
                signingModalZIndex={SIGN_MODAL_Z_INDEX}
                teams={teams}
                user={user}
            />
        </EventCheckoutContext.Provider>
    );
}
