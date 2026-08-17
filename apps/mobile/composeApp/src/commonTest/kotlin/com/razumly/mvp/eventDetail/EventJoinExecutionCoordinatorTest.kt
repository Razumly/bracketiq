package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.repositories.ChildRegistrationResult
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.data.repositories.SelfRegistrationResult
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

class EventJoinExecutionCoordinatorTest {
    @Test
    fun execute_self_join_starts_payment_plan_and_refreshes_after_success() = runTest {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventJoinExecutionCoordinator(registrationFlow)
        val events = mutableListOf<String>()

        coordinator.executeSelfJoinForTest(
            event = paidPaymentPlanEvent(teamSignup = false),
            registrationFlow = registrationFlow,
            events = events,
        )

        assertEquals(
            listOf(
                "show:Joining Event ...",
                "add-self:event-1:open:null",
                "show:Starting Payment Plan ...",
                "bill:USER:user-1:false:open",
                "show:Reloading Event",
                "refresh:event-1:Failed to refresh event after starting payment plan.",
                "clear-progress",
                "error:Joined. Payment plan started. A bill was created for you. Pay installments from your Profile.",
            ),
            events,
        )
    }

    @Test
    fun execute_self_join_rolls_back_when_payment_plan_bill_fails_after_join() = runTest {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventJoinExecutionCoordinator(registrationFlow)
        val events = mutableListOf<String>()

        coordinator.executeSelfJoinForTest(
            event = paidPaymentPlanEvent(teamSignup = false),
            registrationFlow = registrationFlow,
            billResult = Result.failure(IllegalStateException("billing failed")),
            events = events,
        )

        assertEquals(
            listOf(
                "show:Joining Event ...",
                "add-self:event-1:open:null",
                "show:Starting Payment Plan ...",
                "bill:USER:user-1:false:open",
                "rollback-user:event-1",
                "error:billing failed",
            ),
            events,
        )
    }

    @Test
    fun execute_team_join_creates_purchase_intent_and_sets_join_confirmation_target() = runTest {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventJoinExecutionCoordinator(registrationFlow)
        val events = mutableListOf<String>()
        val targetEvents = mutableListOf<JoinConfirmationTarget>()

        coordinator.executeTeamJoinForTest(
            event = paidPurchaseIntentEvent(),
            team = team(),
            registrationFlow = registrationFlow,
            targetEvents = targetEvents,
            events = events,
        )

        assertEquals(
            listOf(
                "billing-address-ready",
                "show:Creating Purchase Request ...",
                "purchase:team-1:4500:open",
                "process:registration-1",
            ),
            events,
        )
        assertEquals(
            buildJoinConfirmationTarget(
                eventId = "event-1",
                registrantType = JoinConfirmationRegistrantType.TEAM,
                registrantId = "team-1",
                occurrence = null,
            ),
            targetEvents.single(),
        )
    }

    @Test
    fun execute_team_join_for_event_manager_joins_directly_without_billing_address() = runTest {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventJoinExecutionCoordinator(registrationFlow)
        val events = mutableListOf<String>()
        val targetEvents = mutableListOf<JoinConfirmationTarget>()

        coordinator.executeTeamJoinForTest(
            event = paidPurchaseIntentEvent(),
            team = team(),
            registrationFlow = registrationFlow,
            currentUserCanManageEvent = true,
            targetEvents = targetEvents,
            events = events,
        )

        assertEquals(
            listOf(
                "show:Joining Event ...",
                "add-team:event-1:team-1:open:null",
                "show:Reloading Event",
                "refresh:event-1:Failed to refresh event after team join.",
                "clear-progress",
            ),
            events,
        )
        assertEquals(emptyList(), targetEvents)
    }

    @Test
    fun execute_self_join_reports_missing_division_price_without_repository_calls() = runTest {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventJoinExecutionCoordinator(registrationFlow)
        val events = mutableListOf<String>()

        coordinator.executeSelfJoinForTest(
            event = paidPaymentPlanEvent(teamSignup = false).copy(
                divisionDetails = listOf(
                    DivisionDetail(
                        id = "open",
                        price = null,
                        allowPaymentPlans = true,
                    ),
                ),
            ),
            registrationFlow = registrationFlow,
            events = events,
        )

        assertEquals(
            listOf("error:Set a price for this division before joining."),
            events,
        )
    }

    @Test
    fun execute_child_registration_registers_waitlist_child_and_refreshes_event() = runTest {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventJoinExecutionCoordinator(registrationFlow)
        val events = mutableListOf<String>()
        val occurrence = EventOccurrenceSelection(slotId = "slot-1", occurrenceDate = "2026-07-01")

        coordinator.executeChildRegistration(
            event = Event(id = "event-1", teamSignup = false),
            child = child(),
            isEventFull = true,
            weeklyOccurrence = occurrence,
            registerChildForEvent = { eventId, childUserId, joinWaitlist, targetOccurrence ->
                events += "register-child:$eventId:$childUserId:$joinWaitlist:${targetOccurrence?.slotId}"
                Result.success(ChildRegistrationResult(joinedWaitlist = true))
            },
            refreshAfterParticipantMutation = { eventId, warningMessage ->
                events += "refresh:$eventId:$warningMessage"
            },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
            setError = { message -> events += "error:$message" },
        )

        assertEquals(
            listOf(
                "show:Registering Child ...",
                "register-child:event-1:child-1:true:slot-1",
                "show:Refreshing Event ...",
                "refresh:event-1:Failed to refresh event after child registration.",
                "error:Alex Child added to waitlist.",
                "hide",
            ),
            events,
        )
    }

    @Test
    fun submit_minor_join_request_refreshes_event_and_reports_default_message() = runTest {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventJoinExecutionCoordinator(registrationFlow)
        val events = mutableListOf<String>()
        val occurrence = EventOccurrenceSelection(slotId = "slot-1", occurrenceDate = "2026-07-01")

        coordinator.submitMinorJoinRequestForParentApproval(
            event = Event(id = "event-1"),
            selectedDivisionId = "open",
            weeklyOccurrence = occurrence,
            requestCurrentUserRegistration = { event, preferredDivisionId, targetOccurrence ->
                events += "request:${event.id}:$preferredDivisionId:${targetOccurrence?.slotId}"
                Result.success(SelfRegistrationResult())
            },
            refreshAfterParticipantMutation = { eventId, warningMessage ->
                events += "refresh:$eventId:$warningMessage"
            },
            showLoading = { message -> events += "show:$message" },
            setError = { message -> events += "error:$message" },
        )

        assertEquals(
            listOf(
                "show:Submitting Join Request ...",
                "request:event-1:open:slot-1",
                "show:Reloading Event",
                "refresh:event-1:Failed to refresh event after submitting child join request.",
                "error:Join request submitted.",
            ),
            events,
        )
    }

    private suspend fun EventJoinExecutionCoordinator.executeSelfJoinForTest(
        event: Event,
        registrationFlow: EventRegistrationFlowCoordinator,
        currentUserCanManageEvent: Boolean = false,
        billResult: Result<PaymentPlanBillStatus> = Result.success(PaymentPlanBillStatus.CREATED),
        events: MutableList<String>,
    ) {
        executeSelfJoin(
            event = event,
            currentUserId = "user-1",
            currentUserIsMinor = false,
            currentUserCanManageEvent = currentUserCanManageEvent,
            selectedDivisionId = "open",
            isEventFull = false,
            weeklyOccurrence = null,
            submitMinorJoinRequest = {
                events += "minor-request"
            },
            addCurrentUserToEvent = { targetEvent, divisionId, occurrence ->
                events += "add-self:${targetEvent.id}:$divisionId:${occurrence?.slotId}"
                Result.success(SelfRegistrationResult())
            },
            createPaymentPlanBill = { ownerType, ownerId, allowSplit, preferredDivisionId ->
                events += "bill:$ownerType:$ownerId:$allowSplit:$preferredDivisionId"
                billResult
            },
            rollbackUserJoinAfterBillingFailure = { targetEvent ->
                events += "rollback-user:${targetEvent.id}"
            },
            ensureBillingAddressOrPrompt = {
                error("Billing address should not be requested")
            },
            onBillingAddressReady = {
                error("Billing address continuation should not run")
            },
            createPurchaseIntent = { _, _, _, _ ->
                error("Purchase intent should not be created")
            },
            processPurchaseIntent = {
                error("Purchase intent should not be processed")
            },
            refreshAfterParticipantMutation = { eventId, warningMessage ->
                events += "refresh:$eventId:$warningMessage"
            },
            clearRegistrationProgress = {
                events += "clear-progress"
            },
            setPendingJoinConfirmationTarget = registrationFlow::setPendingJoinConfirmationTarget,
            showLoading = { message -> events += "show:$message" },
            setError = { message -> events += "error:$message" },
        )
    }

    private suspend fun EventJoinExecutionCoordinator.executeTeamJoinForTest(
        event: Event,
        team: TeamWithPlayers,
        registrationFlow: EventRegistrationFlowCoordinator,
        currentUserCanManageEvent: Boolean = false,
        targetEvents: MutableList<JoinConfirmationTarget>,
        events: MutableList<String>,
    ) {
        executeTeamJoin(
            event = event,
            team = team,
            currentUserIsMinor = false,
            currentUserCanManageEvent = currentUserCanManageEvent,
            selectedDivisionId = "open",
            isEventFull = false,
            weeklyOccurrence = null,
            submitMinorJoinRequest = {
                events += "minor-request"
            },
            addTeamToEvent = { targetEvent, targetTeam, divisionId, occurrence ->
                events += "add-team:${targetEvent.id}:${targetTeam.id}:$divisionId:${occurrence?.slotId}"
                Result.success(Unit)
            },
            createPaymentPlanBill = { _, _, _, _ ->
                error("Payment plan should not be created")
            },
            rollbackTeamJoinAfterBillingFailure = { _, _ ->
                error("Team rollback should not run")
            },
            ensureBillingAddressOrPrompt = {
                events += "billing-address-ready"
                true
            },
            onBillingAddressReady = {
                events += "billing-address-continuation"
            },
            createPurchaseIntent = { _, teamId, priceCents, _: EventOccurrenceSelection?, divisionId ->
                events += "purchase:$teamId:$priceCents:$divisionId"
                Result.success(PurchaseIntent(registrationId = "registration-1"))
            },
            processPurchaseIntent = { intent ->
                events += "process:${intent.registrationId}"
            },
            refreshAfterParticipantMutation = { eventId, warningMessage ->
                events += "refresh:$eventId:$warningMessage"
            },
            clearRegistrationProgress = {
                events += "clear-progress"
            },
            setPendingJoinConfirmationTarget = { target ->
                registrationFlow.setPendingJoinConfirmationTarget(target)
                target?.let { targetEvents += it }
            },
            showLoading = { message -> events += "show:$message" },
            setError = { message -> events += "error:$message" },
        )
    }

    private fun paidPaymentPlanEvent(teamSignup: Boolean): Event {
        return Event(
            id = "event-1",
            teamSignup = teamSignup,
            divisions = listOf("open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "open",
                    price = 4500,
                    allowPaymentPlans = true,
                    installmentAmounts = listOf(1500, 3000),
                    installmentDueDates = listOf("2026-07-01", "2026-08-01"),
                ),
            ),
        )
    }

    private fun paidPurchaseIntentEvent(): Event {
        return Event(
            id = "event-1",
            teamSignup = true,
            divisions = listOf("open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "open",
                    price = 4500,
                    allowPaymentPlans = false,
                ),
            ),
        )
    }

    private fun team(): TeamWithPlayers {
        return TeamWithPlayers(
            team = Team(captainId = "captain-1").copy(id = "team-1"),
            captain = null,
            players = emptyList(),
            pendingPlayers = emptyList(),
        )
    }

    private fun child(): JoinChildOption {
        return JoinChildOption(
            userId = "child-1",
            fullName = "Alex Child",
            email = "alex@example.com",
            hasEmail = true,
        )
    }
}
