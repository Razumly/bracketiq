package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.data.repositories.SelfRegistrationResult
import com.razumly.mvp.core.network.userMessage

internal class EventJoinExecutionCoordinator(
    private val registrationFlowCoordinator: EventRegistrationFlowCoordinator,
) {
    suspend fun executeSelfJoin(
        event: Event,
        currentUserId: String,
        currentUserIsMinor: Boolean,
        selectedDivisionId: String?,
        isEventFull: Boolean,
        weeklyOccurrence: EventOccurrenceSelection?,
        submitMinorJoinRequest: suspend () -> Unit,
        addCurrentUserToEvent: suspend (
            event: Event,
            preferredDivisionId: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<SelfRegistrationResult>,
        createPaymentPlanBill: suspend (
            ownerType: String,
            ownerId: String,
            allowSplit: Boolean,
            preferredDivisionId: String?,
        ) -> Result<PaymentPlanBillStatus>,
        rollbackUserJoinAfterBillingFailure: suspend (Event) -> Unit,
        ensureBillingAddressOrPrompt: suspend (onReady: () -> Unit) -> Boolean,
        onBillingAddressReady: () -> Unit,
        createPurchaseIntent: suspend (
            event: Event,
            priceCents: Int,
            occurrence: EventOccurrenceSelection?,
            divisionId: String?,
        ) -> Result<PurchaseIntent>,
        processPurchaseIntent: (PurchaseIntent) -> Unit,
        refreshAfterParticipantMutation: suspend (eventId: String, warningMessage: String) -> Unit,
        clearRegistrationProgress: suspend () -> Unit,
        setPendingJoinConfirmationTarget: (JoinConfirmationTarget?) -> Unit,
        showLoading: (String) -> Unit,
        setError: (String) -> Unit,
    ) {
        val paymentPlan = resolveEffectivePaymentPlan(
            event = event,
            preferredDivisionId = selectedDivisionId,
        )
        when (
            registrationFlowCoordinator.determineJoinExecutionAction(
                paymentPlan = paymentPlan,
                currentUserIsMinor = currentUserIsMinor,
                isEventFull = isEventFull,
                isTeamSignup = event.teamSignup,
                forTeamJoin = false,
            )
        ) {
            JoinExecutionAction.REQUEST_PARENT_APPROVAL -> {
                submitMinorJoinRequest()
            }
            JoinExecutionAction.REQUIRE_PRICE -> {
                setError("Set a price for this division before joining.")
            }
            JoinExecutionAction.START_PAYMENT_PLAN -> {
                executeSelfPaymentPlanJoin(
                    event = event,
                    currentUserId = currentUserId,
                    selectedDivisionId = selectedDivisionId,
                    weeklyOccurrence = weeklyOccurrence,
                    addCurrentUserToEvent = addCurrentUserToEvent,
                    createPaymentPlanBill = createPaymentPlanBill,
                    rollbackUserJoinAfterBillingFailure = rollbackUserJoinAfterBillingFailure,
                    refreshAfterParticipantMutation = refreshAfterParticipantMutation,
                    clearRegistrationProgress = clearRegistrationProgress,
                    showLoading = showLoading,
                    setError = setError,
                )
            }
            JoinExecutionAction.JOIN_DIRECTLY -> {
                showLoading("Joining Event ...")
                addCurrentUserToEvent(event, selectedDivisionId, weeklyOccurrence)
                    .onSuccess { registration ->
                        showLoading("Reloading Event")
                        refreshAfterParticipantMutation(
                            event.id,
                            "Failed to refresh event after joining.",
                        )
                        clearRegistrationProgress()
                        registrationFlowCoordinator.selfRegistrationResultMessage(registration)?.let(setError)
                    }.onFailure { throwable ->
                        setError(throwable.userMessage())
                    }
            }
            JoinExecutionAction.CREATE_PURCHASE_INTENT -> {
                if (!ensureBillingAddressOrPrompt(onBillingAddressReady)) {
                    return
                }
                showLoading("Creating Purchase Request ...")
                createPurchaseIntent(
                    event,
                    paymentPlan.configuredPriceCents,
                    weeklyOccurrence,
                    selectedDivisionId,
                ).onSuccess { purchaseIntent ->
                    setPendingJoinConfirmationTarget(
                        buildJoinConfirmationTarget(
                            eventId = event.id,
                            registrantType = JoinConfirmationRegistrantType.SELF,
                            registrantId = currentUserId,
                            occurrence = weeklyOccurrence,
                        )
                    )
                    processPurchaseIntent(purchaseIntent)
                }.onFailure { throwable ->
                    setError(throwable.userMessage())
                }
            }
        }
    }

    suspend fun executeTeamJoin(
        event: Event,
        team: TeamWithPlayers,
        currentUserIsMinor: Boolean,
        selectedDivisionId: String?,
        isEventFull: Boolean,
        weeklyOccurrence: EventOccurrenceSelection?,
        submitMinorJoinRequest: suspend () -> Unit,
        addTeamToEvent: suspend (
            event: Event,
            team: Team,
            preferredDivisionId: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<Unit>,
        createPaymentPlanBill: suspend (
            ownerType: String,
            ownerId: String,
            allowSplit: Boolean,
            preferredDivisionId: String?,
        ) -> Result<PaymentPlanBillStatus>,
        rollbackTeamJoinAfterBillingFailure: suspend (Event, TeamWithPlayers) -> Unit,
        ensureBillingAddressOrPrompt: suspend (onReady: () -> Unit) -> Boolean,
        onBillingAddressReady: () -> Unit,
        createPurchaseIntent: suspend (
            event: Event,
            teamId: String?,
            priceCents: Int,
            occurrence: EventOccurrenceSelection?,
            divisionId: String?,
        ) -> Result<PurchaseIntent>,
        processPurchaseIntent: (PurchaseIntent) -> Unit,
        refreshAfterParticipantMutation: suspend (eventId: String, warningMessage: String) -> Unit,
        clearRegistrationProgress: suspend () -> Unit,
        setPendingJoinConfirmationTarget: (JoinConfirmationTarget?) -> Unit,
        showLoading: (String) -> Unit,
        setError: (String) -> Unit,
    ) {
        val paymentPlan = resolveEffectivePaymentPlan(
            event = event,
            preferredDivisionId = selectedDivisionId,
        )
        when (
            registrationFlowCoordinator.determineJoinExecutionAction(
                paymentPlan = paymentPlan,
                currentUserIsMinor = currentUserIsMinor,
                isEventFull = isEventFull,
                isTeamSignup = event.teamSignup,
                forTeamJoin = true,
            )
        ) {
            JoinExecutionAction.REQUEST_PARENT_APPROVAL -> {
                submitMinorJoinRequest()
            }
            JoinExecutionAction.REQUIRE_PRICE -> {
                setError("Set a price for this division before joining.")
            }
            JoinExecutionAction.START_PAYMENT_PLAN -> {
                executeTeamPaymentPlanJoin(
                    event = event,
                    team = team,
                    selectedDivisionId = selectedDivisionId,
                    weeklyOccurrence = weeklyOccurrence,
                    addTeamToEvent = addTeamToEvent,
                    createPaymentPlanBill = createPaymentPlanBill,
                    rollbackTeamJoinAfterBillingFailure = rollbackTeamJoinAfterBillingFailure,
                    refreshAfterParticipantMutation = refreshAfterParticipantMutation,
                    clearRegistrationProgress = clearRegistrationProgress,
                    showLoading = showLoading,
                    setError = setError,
                )
            }
            JoinExecutionAction.JOIN_DIRECTLY -> {
                showLoading("Joining Event ...")
                addTeamToEvent(event, team.team, selectedDivisionId, weeklyOccurrence)
                    .onSuccess {
                        showLoading("Reloading Event")
                        refreshAfterParticipantMutation(
                            event.id,
                            "Failed to refresh event after team join.",
                        )
                        clearRegistrationProgress()
                    }.onFailure { throwable ->
                        setError(throwable.userMessage())
                    }
            }
            JoinExecutionAction.CREATE_PURCHASE_INTENT -> {
                if (!ensureBillingAddressOrPrompt(onBillingAddressReady)) {
                    return
                }
                showLoading("Creating Purchase Request ...")
                createPurchaseIntent(
                    event,
                    team.team.id,
                    paymentPlan.configuredPriceCents,
                    weeklyOccurrence,
                    selectedDivisionId,
                ).onSuccess { purchaseIntent ->
                    setPendingJoinConfirmationTarget(
                        buildJoinConfirmationTarget(
                            eventId = event.id,
                            registrantType = JoinConfirmationRegistrantType.TEAM,
                            registrantId = team.team.id,
                            occurrence = weeklyOccurrence,
                        )
                    )
                    processPurchaseIntent(purchaseIntent)
                }.onFailure { throwable ->
                    setError(throwable.userMessage())
                }
            }
        }
    }

    private suspend fun executeSelfPaymentPlanJoin(
        event: Event,
        currentUserId: String,
        selectedDivisionId: String?,
        weeklyOccurrence: EventOccurrenceSelection?,
        addCurrentUserToEvent: suspend (
            event: Event,
            preferredDivisionId: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<SelfRegistrationResult>,
        createPaymentPlanBill: suspend (
            ownerType: String,
            ownerId: String,
            allowSplit: Boolean,
            preferredDivisionId: String?,
        ) -> Result<PaymentPlanBillStatus>,
        rollbackUserJoinAfterBillingFailure: suspend (Event) -> Unit,
        refreshAfterParticipantMutation: suspend (eventId: String, warningMessage: String) -> Unit,
        clearRegistrationProgress: suspend () -> Unit,
        showLoading: (String) -> Unit,
        setError: (String) -> Unit,
    ) {
        var joinedByThisFlow = false
        showLoading("Joining Event ...")
        val registrationResult = addCurrentUserToEvent(event, selectedDivisionId, weeklyOccurrence)
        val registrationDecision =
            registrationFlowCoordinator.selfJoinBeforePaymentPlanDecision(registrationResult)
        joinedByThisFlow = registrationDecision.joinedByThisFlow
        registrationDecision.message?.let(setError)
        registrationDecision.failure?.let { failure ->
            setError(failure.userMessage())
            return
        }
        if (registrationDecision.shouldReloadEvent) {
            showLoading("Reloading Event")
            refreshAfterParticipantMutation(
                event.id,
                "Failed to refresh event after joining waitlist.",
            )
            return
        }
        if (!registrationDecision.shouldContinueToPaymentPlan) {
            return
        }

        showLoading("Starting Payment Plan ...")
        createPaymentPlanBill("USER", currentUserId, false, selectedDivisionId)
            .onSuccess { status ->
                showLoading("Reloading Event")
                refreshAfterParticipantMutation(
                    event.id,
                    "Failed to refresh event after starting payment plan.",
                )
                clearRegistrationProgress()
                setError(
                    registrationFlowCoordinator.paymentPlanBillSuccessMessage(
                        status = status,
                        forTeamJoin = false,
                    )
                )
            }.onFailure { throwable ->
                if (joinedByThisFlow) {
                    rollbackUserJoinAfterBillingFailure(event)
                }
                setError(throwable.userMessage())
            }
    }

    private suspend fun executeTeamPaymentPlanJoin(
        event: Event,
        team: TeamWithPlayers,
        selectedDivisionId: String?,
        weeklyOccurrence: EventOccurrenceSelection?,
        addTeamToEvent: suspend (
            event: Event,
            team: Team,
            preferredDivisionId: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<Unit>,
        createPaymentPlanBill: suspend (
            ownerType: String,
            ownerId: String,
            allowSplit: Boolean,
            preferredDivisionId: String?,
        ) -> Result<PaymentPlanBillStatus>,
        rollbackTeamJoinAfterBillingFailure: suspend (Event, TeamWithPlayers) -> Unit,
        refreshAfterParticipantMutation: suspend (eventId: String, warningMessage: String) -> Unit,
        clearRegistrationProgress: suspend () -> Unit,
        showLoading: (String) -> Unit,
        setError: (String) -> Unit,
    ) {
        var joinedByThisFlow = false
        showLoading("Joining Event ...")
        val joinResult = addTeamToEvent(event, team.team, selectedDivisionId, weeklyOccurrence)
        val joinDecision = registrationFlowCoordinator.teamJoinBeforePaymentPlanDecision(joinResult)
        joinedByThisFlow = joinDecision.joinedByThisFlow
        joinDecision.failure?.let { failure ->
            setError(failure.userMessage())
            return
        }
        if (!joinDecision.shouldContinueToPaymentPlan) {
            return
        }

        showLoading("Starting Payment Plan ...")
        createPaymentPlanBill(
            "TEAM",
            team.team.id,
            event.allowTeamSplitDefault == true,
            selectedDivisionId,
        ).onSuccess { status ->
            showLoading("Reloading Event")
            refreshAfterParticipantMutation(
                event.id,
                "Failed to refresh event after starting team payment plan.",
            )
            clearRegistrationProgress()
            setError(
                registrationFlowCoordinator.paymentPlanBillSuccessMessage(
                    status = status,
                    forTeamJoin = true,
                )
            )
        }.onFailure { throwable ->
            if (joinedByThisFlow) {
                rollbackTeamJoinAfterBillingFailure(event, team)
            }
            setError(throwable.userMessage())
        }
    }
}
