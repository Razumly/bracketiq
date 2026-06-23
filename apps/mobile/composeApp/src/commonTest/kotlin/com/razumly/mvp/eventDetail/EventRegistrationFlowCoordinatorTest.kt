package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.RegistrationProgressDraft
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.repositories.ChildRegistrationResult
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.FeeBreakdown
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.data.repositories.SelfRegistrationResult
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.SignerContext
import com.razumly.mvp.core.data.repositories.TeamJoinQuestion
import com.razumly.mvp.core.data.repositories.TeamRegistrationConsent
import com.razumly.mvp.core.data.repositories.TeamRegistrationResult
import kotlinx.coroutines.Job
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class EventRegistrationFlowCoordinatorTest {

    @Test
    fun update_question_answer_trims_question_id_and_ignores_blank_ids() {
        val coordinator = EventRegistrationFlowCoordinator()

        assertTrue(coordinator.updateQuestionAnswer(" question-1 ", "Blue"))
        assertFalse(coordinator.updateQuestionAnswer(" ", "Ignored"))

        assertEquals(mapOf("question-1" to "Blue"), coordinator.answers.value)
    }

    @Test
    fun replace_registration_questions_preserves_known_answers_and_adds_empty_defaults() {
        val coordinator = EventRegistrationFlowCoordinator()
        coordinator.replaceRegistrationQuestions(
            listOf(
                question("q1"),
                question("q2"),
            ),
        )
        coordinator.updateQuestionAnswer("q1", "Answer 1")
        coordinator.updateQuestionAnswer("unknown", "Unknown")

        coordinator.replaceRegistrationQuestions(
            listOf(
                question("q1"),
                question("q3"),
            ),
        )

        assertEquals(
            mapOf("q1" to "Answer 1", "q3" to ""),
            coordinator.answers.value,
        )
    }

    @Test
    fun ensure_questions_answered_opens_dialog_until_required_answers_are_confirmed() {
        val coordinator = EventRegistrationFlowCoordinator()
        var continued = false
        val requiredQuestion = question("q1", prompt = "Required question", required = true)
        coordinator.replaceRegistrationQuestions(listOf(requiredQuestion))

        assertFalse(coordinator.ensureQuestionsAnswered(eventName = "Summer League") { continued = true })
        assertEquals("Summer League", coordinator.questionDialog.value?.eventName)
        assertEquals(listOf(requiredQuestion), coordinator.questionDialog.value?.questions)
        assertTrue(coordinator.questionsExpanded.value)

        val missingResult = coordinator.submitQuestionDialogAnswers(mapOf("q1" to " "))
        assertSame(requiredQuestion, missingResult?.missingQuestion)
        assertFalse(continued)
        assertFalse(coordinator.ensureQuestionsAnswered(eventName = "Summer League") { continued = true })

        val submittedResult = coordinator.submitQuestionDialogAnswers(mapOf("q1" to "Answered"))
        submittedResult?.continuation?.invoke()

        assertNull(submittedResult?.missingQuestion)
        assertTrue(continued)
        assertNull(coordinator.questionDialog.value)
        assertTrue(coordinator.ensureQuestionsAnswered(eventName = "Summer League") {})
    }

    @Test
    fun progress_key_and_draft_normalize_scope_and_preserve_answers() {
        val coordinator = EventRegistrationFlowCoordinator()
        val scope = EventRegistrationProgressScope(
            userId = " user-1 ",
            eventId = " event-1 ",
            occurrence = EventOccurrenceSelection(
                slotId = " slot-1 ",
                occurrenceDate = " 2026-07-01 ",
            ),
        )
        coordinator.updateQuestionAnswer("q1", "Answer 1")
        coordinator.setRegistrationHoldExpiresAt(" 2026-07-01T10:00:00Z ")

        assertEquals(
            "event:user-1:event-1:slot-1:2026-07-01",
            coordinator.registrationProgressKey(scope),
        )

        val draft = coordinator.buildRegistrationProgressDraft(
            scope = scope,
            selectedDivisionId = "division-1",
            step = "checkout",
            registrationId = "registration-1",
        )

        assertEquals("event", draft?.scope)
        assertEquals("user-1", draft?.userId)
        assertEquals("event-1", draft?.eventId)
        assertEquals("checkout", draft?.step)
        assertEquals(mapOf("q1" to "Answer 1"), draft?.answers)
        assertEquals("division-1", draft?.selectedDivisionId)
        assertEquals(" slot-1 ", draft?.slotId)
        assertEquals(" 2026-07-01 ", draft?.occurrenceDate)
        assertEquals("registration-1", draft?.registrationId)
        assertEquals("2026-07-01T10:00:00Z", draft?.holdExpiresAt)
    }

    @Test
    fun apply_progress_draft_restores_answers_hold_and_selected_division() {
        val coordinator = EventRegistrationFlowCoordinator()
        coordinator.replaceRegistrationQuestions(listOf(question("q1")))

        val selectedDivision = coordinator.applyRegistrationProgressDraft(
            RegistrationProgressDraft(
                scope = "event",
                userId = "user-1",
                eventId = "event-1",
                step = "checkout",
                answers = mapOf("q1" to "Saved answer"),
                selectedDivisionId = " division-1 ",
                holdExpiresAt = "2026-07-01T10:00:00Z",
                updatedAt = "2026-06-22T12:00:00Z",
            ),
        )

        assertEquals("division-1", selectedDivision)
        assertEquals(mapOf("q1" to "Saved answer"), coordinator.answers.value)
        assertEquals("2026-07-01T10:00:00Z", coordinator.holdExpiresAt.value)
        assertTrue(coordinator.ensureQuestionsAnswered(eventName = "Event") {})

        assertNull(coordinator.applyRegistrationProgressDraft(null))
        assertNull(coordinator.holdExpiresAt.value)
        assertFalse(coordinator.ensureQuestionsAnswered(eventName = "Event") {})
    }

    @Test
    fun progress_persistence_helpers_save_load_and_clear_through_callbacks() = runTest {
        val coordinator = EventRegistrationFlowCoordinator()
        val scope = EventRegistrationProgressScope(
            userId = " user-1 ",
            eventId = " event-1 ",
            occurrence = EventOccurrenceSelection(
                slotId = " slot-1 ",
                occurrenceDate = " 2026-07-01 ",
            ),
        )
        coordinator.updateQuestionAnswer("q1", "Answer 1")
        coordinator.setRegistrationHoldExpiresAt(" 2026-07-01T10:00:00Z ")
        var savedKey: String? = null
        var savedDraft: RegistrationProgressDraft? = null

        coordinator.saveRegistrationProgress(
            scope = scope,
            selectedDivisionId = "division-1",
            step = "checkout",
            registrationId = "registration-1",
        ) { key, draft ->
            savedKey = key
            savedDraft = draft
        }

        assertEquals("event:user-1:event-1:slot-1:2026-07-01", savedKey)
        assertEquals("registration-1", savedDraft?.registrationId)
        assertEquals("2026-07-01T10:00:00Z", savedDraft?.holdExpiresAt)

        coordinator.clearRegistrationProgress(scope) { key ->
            assertEquals(savedKey, key)
        }
        assertNull(coordinator.holdExpiresAt.value)

        val restoredDivision = coordinator.loadRegistrationProgress(scope) { key ->
            assertEquals(savedKey, key)
            savedDraft
        }

        assertEquals("division-1", restoredDivision)
        assertEquals(mapOf("q1" to "Answer 1"), coordinator.answers.value)
        assertEquals("2026-07-01T10:00:00Z", coordinator.holdExpiresAt.value)
    }

    @Test
    fun answer_aware_registration_requests_choose_empty_or_answered_callbacks() = runTest {
        val coordinator = EventRegistrationFlowCoordinator()
        val event = Event(id = "event-1")
        val team = Team(captainId = "captain-1").copy(id = "team-1")
        val occurrence = EventOccurrenceSelection(
            slotId = "slot-1",
            occurrenceDate = "2026-07-01",
        )
        var selfPath = ""
        var teamPath = ""
        var purchasePath = ""

        coordinator.addCurrentUserToEventWithRegistrationAnswers(
            event = event,
            preferredDivisionId = "open",
            occurrence = occurrence,
            addWithoutAnswers = { targetEvent, divisionId, targetOccurrence ->
                assertEquals(event, targetEvent)
                assertEquals("open", divisionId)
                assertEquals(occurrence, targetOccurrence)
                selfPath = "empty"
                Result.success(SelfRegistrationResult())
            },
            addWithAnswers = { _, _, _, _ ->
                error("Answered self path should not run without answers.")
            },
        )
        coordinator.addTeamToEventWithRegistrationAnswers(
            event = event,
            team = team,
            preferredDivisionId = "open",
            occurrence = occurrence,
            addWithoutAnswers = { targetEvent, targetTeam, divisionId, targetOccurrence ->
                assertEquals(event, targetEvent)
                assertEquals(team, targetTeam)
                assertEquals("open", divisionId)
                assertEquals(occurrence, targetOccurrence)
                teamPath = "empty"
                Result.success(Unit)
            },
            addWithAnswers = { _, _, _, _, _ ->
                error("Answered team path should not run without answers.")
            },
        )
        coordinator.createPurchaseIntentWithRegistrationAnswers(
            event = event,
            teamId = "team-1",
            priceCents = 1000,
            occurrence = occurrence,
            divisionId = "open",
            createWithoutAnswers = { targetEvent, teamId, priceCents, targetOccurrence, divisionId ->
                assertEquals(event, targetEvent)
                assertEquals("team-1", teamId)
                assertEquals(1000, priceCents)
                assertEquals(occurrence, targetOccurrence)
                assertEquals("open", divisionId)
                purchasePath = "empty"
                Result.success(purchaseIntent("registration-1"))
            },
            createWithAnswers = { _, _, _, _, _, _ ->
                error("Answered purchase path should not run without answers.")
            },
        )

        assertEquals("empty", selfPath)
        assertEquals("empty", teamPath)
        assertEquals("empty", purchasePath)

        coordinator.replaceRegistrationQuestions(listOf(question("q1")))
        coordinator.updateQuestionAnswer("q1", "Answer 1")
        val expectedAnswers = mapOf("q1" to "Answer 1")

        coordinator.addCurrentUserToEventWithRegistrationAnswers(
            event = event,
            preferredDivisionId = "open",
            occurrence = occurrence,
            addWithoutAnswers = { _, _, _ ->
                error("Empty self path should not run with answers.")
            },
            addWithAnswers = { _, _, _, answers ->
                assertEquals(expectedAnswers, answers)
                selfPath = "answered"
                Result.success(SelfRegistrationResult())
            },
        )
        coordinator.addTeamToEventWithRegistrationAnswers(
            event = event,
            team = team,
            preferredDivisionId = "open",
            occurrence = occurrence,
            addWithoutAnswers = { _, _, _, _ ->
                error("Empty team path should not run with answers.")
            },
            addWithAnswers = { _, _, _, _, answers ->
                assertEquals(expectedAnswers, answers)
                teamPath = "answered"
                Result.success(Unit)
            },
        )
        coordinator.createPurchaseIntentWithRegistrationAnswers(
            event = event,
            teamId = "team-1",
            priceCents = 1000,
            occurrence = occurrence,
            divisionId = "open",
            createWithoutAnswers = { _, _, _, _, _ ->
                error("Empty purchase path should not run with answers.")
            },
            createWithAnswers = { _, _, _, _, _, answers ->
                assertEquals(expectedAnswers, answers)
                purchasePath = "answered"
                Result.success(purchaseIntent("registration-2"))
            },
        )

        assertEquals("answered", selfPath)
        assertEquals("answered", teamPath)
        assertEquals("answered", purchasePath)
    }

    @Test
    fun clear_after_hold_expired_dismisses_dialog_and_resets_hold() {
        val coordinator = EventRegistrationFlowCoordinator()
        coordinator.replaceRegistrationQuestions(listOf(question("q1", required = true)))
        coordinator.setRegistrationHoldExpiresAt("2026-07-01T10:00:00Z")
        coordinator.ensureQuestionsAnswered(eventName = "Event") {}

        coordinator.clearAfterRegistrationHoldExpired()

        assertNull(coordinator.questionDialog.value)
        assertNull(coordinator.holdExpiresAt.value)
        assertFalse(coordinator.ensureQuestionsAnswered(eventName = "Event") {})
    }

    @Test
    fun payment_plan_preview_confirm_returns_continuation_and_dismisses_dialog() {
        val coordinator = EventRegistrationFlowCoordinator()
        val preview = paymentPreview()
        var continued = false

        coordinator.showPaymentPlanPreviewDialog(preview) {
            continued = true
        }

        assertEquals(preview, coordinator.paymentPlanPreviewDialog.value)

        val continuation = coordinator.confirmPaymentPlanPreviewDialog()

        assertNull(coordinator.paymentPlanPreviewDialog.value)
        assertFalse(continued)

        continuation?.invoke()

        assertTrue(continued)
        assertNull(coordinator.confirmPaymentPlanPreviewDialog())
    }

    @Test
    fun payment_plan_preview_dismiss_clears_dialog_and_pending_continuation() {
        val coordinator = EventRegistrationFlowCoordinator()
        coordinator.showPaymentPlanPreviewDialog(paymentPreview()) {}

        coordinator.dismissPaymentPlanPreviewDialog()

        assertNull(coordinator.paymentPlanPreviewDialog.value)
        assertNull(coordinator.confirmPaymentPlanPreviewDialog())
    }

    @Test
    fun withdraw_targets_can_be_replaced_and_cleared() {
        val coordinator = EventRegistrationFlowCoordinator()
        val target = WithdrawTargetOption(
            userId = "user-1",
            fullName = "User One",
            membership = WithdrawTargetMembership.PARTICIPANT,
            isSelf = true,
        )

        coordinator.replaceWithdrawTargets(listOf(target))

        assertEquals(listOf(target), coordinator.withdrawTargets.value)

        coordinator.clearWithdrawTargets()

        assertEquals(emptyList(), coordinator.withdrawTargets.value)
    }

    @Test
    fun withdrawal_action_preflight_normalizes_target_and_reports_membership_errors() {
        val coordinator = EventRegistrationFlowCoordinator()

        assertEquals(
            "user-1",
            coordinator.normalizedWithdrawalTargetUserId(
                targetUserId = " ",
                currentUserId = "user-1",
            ),
        )

        val decision = coordinator.prepareWithdrawalAction(
            event = paidEvent(),
            action = WithdrawalActionKind.LEAVE,
            targetUserId = " user-2 ",
            currentUserId = "user-1",
            membership = null,
            weeklyOccurrence = null,
            currentUserIsFreeAgent = false,
            eventOrOccurrenceStarted = false,
        )

        assertEquals("user-2", decision.targetUserId)
        assertEquals("Selected profile is not registered for this event.", decision.errorMessage)
    }

    @Test
    fun withdrawal_action_preflight_handles_refund_and_started_event_messages() {
        val coordinator = EventRegistrationFlowCoordinator()
        val paidEvent = paidEvent()
        val freeEvent = Event(id = "event-1")

        assertEquals(
            "Refund requests are only available for paid events.",
            coordinator.prepareWithdrawalAction(
                event = freeEvent,
                action = WithdrawalActionKind.REQUEST_REFUND,
                targetUserId = "user-1",
                currentUserId = "user-1",
                membership = WithdrawTargetMembership.PARTICIPANT,
                weeklyOccurrence = null,
                currentUserIsFreeAgent = false,
                eventOrOccurrenceStarted = false,
            ).errorMessage,
        )
        assertEquals(
            "Only registered participants can request refunds.",
            coordinator.prepareWithdrawalAction(
                event = paidEvent,
                action = WithdrawalActionKind.REQUEST_REFUND,
                targetUserId = "user-1",
                currentUserId = "user-1",
                membership = WithdrawTargetMembership.WAITLIST,
                weeklyOccurrence = null,
                currentUserIsFreeAgent = false,
                eventOrOccurrenceStarted = false,
            ).errorMessage,
        )
        assertEquals(
            "Automatic refunds are no longer available after the event starts.",
            coordinator.prepareWithdrawalAction(
                event = paidEvent,
                action = WithdrawalActionKind.WITHDRAW_AND_REFUND,
                targetUserId = "user-1",
                currentUserId = "user-1",
                membership = WithdrawTargetMembership.PARTICIPANT,
                weeklyOccurrence = null,
                currentUserIsFreeAgent = false,
                eventOrOccurrenceStarted = true,
            ).errorMessage,
        )
        assertEquals(
            "This event has already started. Leaving is disabled. Request a refund instead.",
            coordinator.prepareWithdrawalAction(
                event = paidEvent,
                action = WithdrawalActionKind.LEAVE,
                targetUserId = "user-1",
                currentUserId = "user-1",
                membership = WithdrawTargetMembership.PARTICIPANT,
                weeklyOccurrence = null,
                currentUserIsFreeAgent = false,
                eventOrOccurrenceStarted = true,
            ).errorMessage,
        )
    }

    @Test
    fun withdrawal_action_preflight_selects_team_withdrawal_and_blocks_individual_weekly_refunds() {
        val coordinator = EventRegistrationFlowCoordinator()
        val event = paidEvent(teamSignup = true)
        val occurrence = EventOccurrenceSelection(
            slotId = "slot-1",
            occurrenceDate = "2026-07-01",
        )

        val teamDecision = coordinator.prepareWithdrawalAction(
            event = event,
            action = WithdrawalActionKind.REQUEST_REFUND,
            targetUserId = "user-1",
            currentUserId = "user-1",
            membership = WithdrawTargetMembership.PARTICIPANT,
            weeklyOccurrence = occurrence,
            currentUserIsFreeAgent = false,
            eventOrOccurrenceStarted = false,
        )

        assertNull(teamDecision.errorMessage)
        assertTrue(teamDecision.useTeamWithdrawal)

        assertEquals(
            "Refunds for individual weekly registrations are not available here yet. Contact the host for help.",
            coordinator.prepareWithdrawalAction(
                event = event.copy(teamSignup = false),
                action = WithdrawalActionKind.REQUEST_REFUND,
                targetUserId = "user-1",
                currentUserId = "user-1",
                membership = WithdrawTargetMembership.PARTICIPANT,
                weeklyOccurrence = occurrence,
                currentUserIsFreeAgent = false,
                eventOrOccurrenceStarted = false,
            ).errorMessage,
        )
    }

    @Test
    fun billing_address_prompt_completion_returns_continuation_and_clears_prompt() {
        val coordinator = EventRegistrationFlowCoordinator()
        var continued = false

        coordinator.showBillingAddressPrompt(BillingAddressDraft(countryCode = "US")) {
            continued = true
        }

        assertEquals("US", coordinator.billingAddressPrompt.value?.countryCode)

        val continuation = coordinator.completeBillingAddressPrompt()

        assertNull(coordinator.billingAddressPrompt.value)
        assertFalse(continued)

        continuation?.invoke()

        assertTrue(continued)
        assertNull(coordinator.completeBillingAddressPrompt())
    }

    @Test
    fun billing_address_prompt_dismiss_clears_prompt_and_pending_continuation() {
        val coordinator = EventRegistrationFlowCoordinator()
        coordinator.showBillingAddressPrompt(null) {}

        assertEquals(BillingAddressDraft(), coordinator.billingAddressPrompt.value)

        coordinator.dismissBillingAddressPrompt()

        assertNull(coordinator.billingAddressPrompt.value)
        assertNull(coordinator.completeBillingAddressPrompt())
    }

    @Test
    fun join_choice_and_child_selection_dialogs_are_mutually_exclusive() {
        val coordinator = EventRegistrationFlowCoordinator()
        val child = joinChild("child-1")

        coordinator.showJoinChoiceDialog(listOf(child))

        assertEquals(listOf(child), coordinator.joinChoiceDialog.value?.children)
        assertNull(coordinator.childJoinSelectionDialog.value)

        coordinator.showChildJoinSelectionDialog(listOf(child))

        assertNull(coordinator.joinChoiceDialog.value)
        assertEquals(listOf(child), coordinator.childJoinSelectionDialog.value?.children)
    }

    @Test
    fun join_dialogs_can_be_dismissed_individually_or_together() {
        val coordinator = EventRegistrationFlowCoordinator()
        val child = joinChild("child-1")

        coordinator.showJoinChoiceDialog(listOf(child))
        coordinator.dismissJoinChoiceDialog()

        assertNull(coordinator.joinChoiceDialog.value)

        coordinator.showChildJoinSelectionDialog(listOf(child))
        coordinator.dismissChildJoinSelectionDialog()

        assertNull(coordinator.childJoinSelectionDialog.value)

        coordinator.showJoinChoiceDialog(listOf(child))
        coordinator.showChildJoinSelectionDialog(listOf(child))
        coordinator.clearJoinDialogs()

        assertNull(coordinator.joinChoiceDialog.value)
        assertNull(coordinator.childJoinSelectionDialog.value)
    }

    @Test
    fun joinable_children_are_retained_for_child_selection() {
        val coordinator = EventRegistrationFlowCoordinator()
        val child = joinChild("child-1")

        coordinator.showJoinChoiceDialog(listOf(child))
        coordinator.dismissJoinChoiceDialog()

        assertEquals(listOf(child), coordinator.currentJoinableChildren())
        assertEquals(child, coordinator.findJoinableChild(" child-1 "))

        coordinator.showChildJoinSelectionDialog(listOf(child))

        assertEquals(listOf(child), coordinator.currentJoinableChildren())
        assertNull(coordinator.findJoinableChild("missing-child"))
    }

    @Test
    fun child_registration_result_message_classifies_completion_pending_and_warning_states() {
        val coordinator = EventRegistrationFlowCoordinator()
        val child = joinChild("child-1")

        assertEquals(
            "Child child-1 registration completed.",
            coordinator.childRegistrationResultMessage(
                child = child,
                registration = ChildRegistrationResult(registrationStatus = "ACTIVE"),
            ),
        )
        assertEquals(
            "Child child-1 added to waitlist.",
            coordinator.childRegistrationResultMessage(
                child = child,
                registration = ChildRegistrationResult(joinedWaitlist = true),
            ),
        )
        assertEquals(
            "Child child-1 request sent. A parent/guardian must approve before registration can continue.",
            coordinator.childRegistrationResultMessage(
                child = child,
                registration = ChildRegistrationResult(requiresParentApproval = true),
            ),
        )
        assertEquals(
            "Child child-1 registration started. Add child email to continue child-signature document steps.",
            coordinator.childRegistrationResultMessage(
                child = child,
                registration = ChildRegistrationResult(requiresChildEmail = true),
            ),
        )
        assertEquals(
            "Child child-1 registration is pending. Consent status: sent.",
            coordinator.childRegistrationResultMessage(
                child = child,
                registration = ChildRegistrationResult(consentStatus = "sent"),
            ),
        )
        assertEquals(
            "Child child-1 registration is pending. Status: pending.",
            coordinator.childRegistrationResultMessage(
                child = child,
                registration = ChildRegistrationResult(registrationStatus = "PENDING"),
            ),
        )
        assertEquals(
            "Child child-1 registration request submitted and is pending processing. Bring a signed waiver.",
            coordinator.childRegistrationResultMessage(
                child = child,
                registration = ChildRegistrationResult(
                    warnings = listOf("Bring a signed waiver."),
                ),
            ),
        )
    }

    @Test
    fun self_registration_result_message_classifies_minor_waitlist_and_default_states() {
        val coordinator = EventRegistrationFlowCoordinator()

        assertEquals(
            "Join request sent. A parent/guardian must approve before registration can continue.",
            coordinator.selfRegistrationResultMessage(
                SelfRegistrationResult(requiresParentApproval = true),
            ),
        )
        assertEquals(
            "Added to event waitlist.",
            coordinator.selfRegistrationResultMessage(
                SelfRegistrationResult(joinedWaitlist = true),
            ),
        )
        assertEquals(
            "Join request submitted.",
            coordinator.selfRegistrationResultMessage(
                registration = SelfRegistrationResult(),
                defaultMessage = "Join request submitted.",
            ),
        )
        assertNull(coordinator.selfRegistrationResultMessage(SelfRegistrationResult()))
    }

    @Test
    fun self_join_before_payment_plan_decision_classifies_registration_result_and_duplicate_errors() {
        val coordinator = EventRegistrationFlowCoordinator()
        val failure = IllegalStateException("Backend unavailable")

        assertEquals(
            SelfJoinBeforePaymentPlanDecision(
                joinedByThisFlow = true,
                shouldContinueToPaymentPlan = true,
            ),
            coordinator.selfJoinBeforePaymentPlanDecision(
                Result.success(SelfRegistrationResult()),
            ),
        )
        assertEquals(
            SelfJoinBeforePaymentPlanDecision(
                joinedByThisFlow = false,
                shouldContinueToPaymentPlan = false,
                shouldReloadEvent = true,
                message = "Added to event waitlist.",
            ),
            coordinator.selfJoinBeforePaymentPlanDecision(
                Result.success(SelfRegistrationResult(joinedWaitlist = true)),
            ),
        )
        assertEquals(
            SelfJoinBeforePaymentPlanDecision(
                joinedByThisFlow = false,
                shouldContinueToPaymentPlan = true,
            ),
            coordinator.selfJoinBeforePaymentPlanDecision(
                Result.failure(IllegalStateException("Already registered for event")),
            ),
        )

        val decision = coordinator.selfJoinBeforePaymentPlanDecision(Result.failure(failure))
        assertFalse(decision.joinedByThisFlow)
        assertFalse(decision.shouldContinueToPaymentPlan)
        assertSame(failure, decision.failure)
    }

    @Test
    fun team_join_before_payment_plan_decision_classifies_success_duplicate_and_failure() {
        val coordinator = EventRegistrationFlowCoordinator()
        val failure = IllegalStateException("Team capacity check failed")

        assertEquals(
            TeamJoinBeforePaymentPlanDecision(
                joinedByThisFlow = true,
                shouldContinueToPaymentPlan = true,
            ),
            coordinator.teamJoinBeforePaymentPlanDecision(Result.success(Unit)),
        )
        assertEquals(
            TeamJoinBeforePaymentPlanDecision(
                joinedByThisFlow = false,
                shouldContinueToPaymentPlan = true,
            ),
            coordinator.teamJoinBeforePaymentPlanDecision(
                Result.failure(IllegalStateException("Team already a participant")),
            ),
        )

        val decision = coordinator.teamJoinBeforePaymentPlanDecision(Result.failure(failure))
        assertFalse(decision.joinedByThisFlow)
        assertFalse(decision.shouldContinueToPaymentPlan)
        assertSame(failure, decision.failure)
    }

    @Test
    fun payment_plan_bill_success_message_preserves_user_and_team_copy() {
        val coordinator = EventRegistrationFlowCoordinator()

        assertEquals(
            "Joined. Payment plan already exists. You can manage installments from your Profile.",
            coordinator.paymentPlanBillSuccessMessage(
                status = PaymentPlanBillStatus.ALREADY_EXISTS,
                forTeamJoin = false,
            ),
        )
        assertEquals(
            "Joined. Payment plan started. A bill was created for you. Pay installments from your Profile.",
            coordinator.paymentPlanBillSuccessMessage(
                status = PaymentPlanBillStatus.CREATED,
                forTeamJoin = false,
            ),
        )
        assertEquals(
            "Team joined. Payment plan already exists. Manage installments from your Profile.",
            coordinator.paymentPlanBillSuccessMessage(
                status = PaymentPlanBillStatus.ALREADY_EXISTS,
                forTeamJoin = true,
            ),
        )
        assertEquals(
            "Team joined. Payment plan started. A bill was created. Manage installments from your Profile.",
            coordinator.paymentPlanBillSuccessMessage(
                status = PaymentPlanBillStatus.CREATED,
                forTeamJoin = true,
            ),
        )
    }

    @Test
    fun join_execution_action_preserves_self_join_branching() {
        val coordinator = EventRegistrationFlowCoordinator()

        assertEquals(
            JoinExecutionAction.REQUEST_PARENT_APPROVAL,
            coordinator.determineJoinExecutionAction(
                paymentPlan = effectivePaymentPlan(priceCents = null, allowPaymentPlans = true),
                currentUserIsMinor = true,
                isEventFull = false,
                isTeamSignup = false,
                forTeamJoin = false,
            ),
        )
        assertEquals(
            JoinExecutionAction.REQUIRE_PRICE,
            coordinator.determineJoinExecutionAction(
                paymentPlan = effectivePaymentPlan(priceCents = null, allowPaymentPlans = true),
                currentUserIsMinor = false,
                isEventFull = false,
                isTeamSignup = false,
                forTeamJoin = false,
            ),
        )
        assertEquals(
            JoinExecutionAction.START_PAYMENT_PLAN,
            coordinator.determineJoinExecutionAction(
                paymentPlan = effectivePaymentPlan(priceCents = 4500, allowPaymentPlans = true),
                currentUserIsMinor = false,
                isEventFull = false,
                isTeamSignup = false,
                forTeamJoin = false,
            ),
        )
        assertEquals(
            JoinExecutionAction.JOIN_DIRECTLY,
            coordinator.determineJoinExecutionAction(
                paymentPlan = effectivePaymentPlan(priceCents = 4500, allowPaymentPlans = true),
                currentUserIsMinor = false,
                isEventFull = false,
                isTeamSignup = true,
                forTeamJoin = false,
            ),
        )
        assertEquals(
            JoinExecutionAction.CREATE_PURCHASE_INTENT,
            coordinator.determineJoinExecutionAction(
                paymentPlan = effectivePaymentPlan(priceCents = 4500, allowPaymentPlans = false),
                currentUserIsMinor = false,
                isEventFull = false,
                isTeamSignup = false,
                forTeamJoin = false,
            ),
        )
    }

    @Test
    fun join_execution_action_preserves_team_join_branching() {
        val coordinator = EventRegistrationFlowCoordinator()

        assertEquals(
            JoinExecutionAction.START_PAYMENT_PLAN,
            coordinator.determineJoinExecutionAction(
                paymentPlan = effectivePaymentPlan(priceCents = 4500, allowPaymentPlans = true),
                currentUserIsMinor = false,
                isEventFull = false,
                isTeamSignup = true,
                forTeamJoin = true,
            ),
        )
        assertEquals(
            JoinExecutionAction.JOIN_DIRECTLY,
            coordinator.determineJoinExecutionAction(
                paymentPlan = effectivePaymentPlan(priceCents = 4500, allowPaymentPlans = true),
                currentUserIsMinor = false,
                isEventFull = true,
                isTeamSignup = false,
                forTeamJoin = true,
            ),
        )
        assertEquals(
            JoinExecutionAction.JOIN_DIRECTLY,
            coordinator.determineJoinExecutionAction(
                paymentPlan = effectivePaymentPlan(priceCents = 0, allowPaymentPlans = false),
                currentUserIsMinor = false,
                isEventFull = false,
                isTeamSignup = false,
                forTeamJoin = true,
            ),
        )
        assertEquals(
            JoinExecutionAction.CREATE_PURCHASE_INTENT,
            coordinator.determineJoinExecutionAction(
                paymentPlan = effectivePaymentPlan(priceCents = 4500, allowPaymentPlans = false),
                currentUserIsMinor = false,
                isEventFull = false,
                isTeamSignup = false,
                forTeamJoin = true,
            ),
        )
    }

    @Test
    fun team_join_policy_decision_classifies_open_request_and_closed_policies() {
        val coordinator = EventRegistrationFlowCoordinator()

        assertEquals(
            TeamJoinPolicyDecision(TeamJoinPolicyKind.OPEN_REGISTRATION),
            coordinator.teamJoinPolicyDecision("OPEN_REGISTRATION"),
        )
        assertEquals(
            TeamJoinPolicyDecision(TeamJoinPolicyKind.REQUEST_TO_JOIN),
            coordinator.teamJoinPolicyDecision("request_to_join"),
        )

        val closedDecision = coordinator.teamJoinPolicyDecision("INVITE_ONLY")

        assertEquals(TeamJoinPolicyKind.CLOSED, closedDecision.kind)
        assertFalse(closedDecision.isAccepted)
        assertEquals("This team is not accepting registrations.", closedDecision.errorMessage)
    }

    @Test
    fun team_join_policy_controls_submit_loading_message_and_request_detection() {
        val coordinator = EventRegistrationFlowCoordinator()

        assertEquals(
            "Submitting join request...",
            coordinator.teamJoinSubmitLoadingMessage("REQUEST_TO_JOIN"),
        )
        assertEquals(
            "Starting team registration...",
            coordinator.teamJoinSubmitLoadingMessage("OPEN_REGISTRATION"),
        )
        assertTrue(coordinator.isRequestToJoinPolicy("request_to_join"))
        assertFalse(coordinator.isRequestToJoinPolicy("OPEN_REGISTRATION"))
    }

    @Test
    fun registration_target_team_id_prefers_non_blank_parent_team_id() {
        val coordinator = EventRegistrationFlowCoordinator()

        assertEquals(
            "parent-team",
            coordinator.registrationTargetTeamId(
                Team(captainId = "captain-1").copy(
                    id = " child-team ",
                    parentTeamId = " parent-team ",
                ),
            ),
        )
        assertEquals(
            "team-1",
            coordinator.registrationTargetTeamId(
                Team(captainId = "captain-1").copy(
                    id = " team-1 ",
                    parentTeamId = " ",
                ),
            ),
        )
    }

    @Test
    fun team_registration_result_decision_classifies_follow_up_actions() {
        val coordinator = EventRegistrationFlowCoordinator()

        assertEquals(
            TeamRegistrationResultDecision(
                action = TeamRegistrationResultAction.WAIT_FOR_PARENT_APPROVAL,
                message = "A parent must approve this roster.",
            ),
            coordinator.teamRegistrationResultDecision(
                teamRegistrationResult(
                    requiresParentApproval = true,
                    message = "A parent must approve this roster.",
                ),
            ),
        )
        assertEquals(
            TeamRegistrationResultDecision(
                action = TeamRegistrationResultAction.REQUIRE_CHILD_EMAIL,
                message = "Add child email.",
            ),
            coordinator.teamRegistrationResultDecision(
                teamRegistrationResult(
                    warnings = listOf("Add child email."),
                    consent = TeamRegistrationConsent(requiresChildEmail = true),
                ),
            ),
        )
        assertEquals(
            TeamRegistrationResultDecision(TeamRegistrationResultAction.REQUIRE_ADDITIONAL_SIGNING),
            coordinator.teamRegistrationResultDecision(
                teamRegistrationResult(
                    consent = TeamRegistrationConsent(
                        documentId = "document-1",
                        status = "sent",
                    ),
                ),
            ),
        )
        assertEquals(
            TeamRegistrationResultDecision(TeamRegistrationResultAction.CONTINUE),
            coordinator.teamRegistrationResultDecision(
                teamRegistrationResult(registrationStatus = "ACTIVE"),
            ),
        )
    }

    @Test
    fun team_registration_continuation_decision_classifies_checkout_inactive_and_complete_paths() {
        val coordinator = EventRegistrationFlowCoordinator()

        assertEquals(
            TeamRegistrationContinuationDecision(
                action = TeamRegistrationContinuationAction.MISSING_TEAM_ID,
                teamId = "",
                message = "This team is missing an id.",
            ),
            coordinator.teamRegistrationContinuationDecision(
                team = Team(captainId = "captain-1").copy(id = " "),
                result = teamRegistrationResult(),
            ),
        )
        assertEquals(
            TeamRegistrationContinuationDecision(
                action = TeamRegistrationContinuationAction.START_CHECKOUT,
                teamId = "team-1",
            ),
            coordinator.teamRegistrationContinuationDecision(
                team = Team(captainId = "captain-1").copy(
                    id = " team-1 ",
                    registrationPriceCents = 500,
                ),
                result = teamRegistrationResult(),
            ),
        )
        assertEquals(
            TeamRegistrationContinuationDecision(
                action = TeamRegistrationContinuationAction.REJECT_INACTIVE,
                teamId = "team-1",
                message = "Unable to join this team.",
            ),
            coordinator.teamRegistrationContinuationDecision(
                team = Team(captainId = "captain-1").copy(id = " team-1 "),
                result = teamRegistrationResult(registrationStatus = "STARTED"),
            ),
        )
        assertEquals(
            TeamRegistrationContinuationDecision(
                action = TeamRegistrationContinuationAction.COMPLETE_ACTIVE,
                teamId = "team-1",
            ),
            coordinator.teamRegistrationContinuationDecision(
                team = Team(captainId = "captain-1").copy(id = " team-1 "),
                result = teamRegistrationResult(registrationStatus = "ACTIVE"),
            ),
        )
    }

    @Test
    fun team_join_question_submit_requires_answers_then_returns_dialog_and_team() {
        val coordinator = EventRegistrationFlowCoordinator()
        val requiredQuestion = question("q1", required = true)
        val dialog = TeamJoinQuestionDialogState(
            teamId = "team-1",
            teamName = "Team One",
            joinPolicy = "OPEN_REGISTRATION",
            questions = listOf(requiredQuestion),
        )
        val team = teamWithPlayers("team-1")

        coordinator.showTeamJoinQuestionDialog(dialog, team)

        assertEquals(dialog, coordinator.teamJoinQuestionDialog.value)

        val missingResult = coordinator.submitTeamJoinQuestionAnswers(mapOf("q1" to " "))

        assertSame(requiredQuestion, missingResult?.missingQuestion)
        assertEquals(dialog, coordinator.teamJoinQuestionDialog.value)

        val submittedResult = coordinator.submitTeamJoinQuestionAnswers(mapOf("q1" to "Ready"))

        assertNull(submittedResult?.missingQuestion)
        assertEquals(dialog, submittedResult?.dialog)
        assertEquals(team, submittedResult?.team)
        assertNull(coordinator.teamJoinQuestionDialog.value)
        assertNull(coordinator.submitTeamJoinQuestionAnswers(mapOf("q1" to "Ready")))
    }

    @Test
    fun team_join_question_dismiss_clears_dialog_and_pending_team() {
        val coordinator = EventRegistrationFlowCoordinator()
        coordinator.showTeamJoinQuestionDialog(
            dialog = TeamJoinQuestionDialogState(
                teamId = "team-1",
                teamName = "Team One",
                joinPolicy = "REQUEST_TO_JOIN",
                questions = listOf(question("q1")),
            ),
            team = teamWithPlayers("team-1"),
        )

        coordinator.dismissTeamJoinQuestionDialog()

        assertNull(coordinator.teamJoinQuestionDialog.value)
        assertNull(coordinator.submitTeamJoinQuestionAnswers(mapOf("q1" to "Ready")))
    }

    @Test
    fun pending_join_confirmation_target_can_be_set_replaced_and_cleared() {
        val coordinator = EventRegistrationFlowCoordinator()
        val target = JoinConfirmationTarget(
            eventId = "event-1",
            registrantType = JoinConfirmationRegistrantType.SELF,
            registrantId = "user-1",
            occurrence = EventOccurrenceSelection(
                slotId = "slot-1",
                occurrenceDate = "2026-07-01",
            ),
        )
        val replacement = target.copy(
            registrantType = JoinConfirmationRegistrantType.TEAM,
            registrantId = "team-1",
        )

        coordinator.setPendingJoinConfirmationTarget(target)

        assertEquals(target, coordinator.currentJoinConfirmationTarget())

        coordinator.setPendingJoinConfirmationTarget(replacement)

        assertEquals(replacement, coordinator.currentJoinConfirmationTarget())

        coordinator.clearPendingJoinConfirmationTarget()

        assertNull(coordinator.currentJoinConfirmationTarget())
    }

    @Test
    fun fee_breakdown_confirm_returns_continuation_and_clears_state() {
        val coordinator = EventRegistrationFlowCoordinator()
        val feeBreakdown = feeBreakdown()
        val purchaseIntent = purchaseIntent("registration-1")
        var continued = false

        coordinator.setPendingPaymentSheetIntent(purchaseIntent)
        coordinator.showFeeBreakdown(feeBreakdown) {
            continued = coordinator.consumePendingPaymentSheetIntent() == purchaseIntent
        }

        assertTrue(coordinator.showFeeBreakdown.value)
        assertEquals(feeBreakdown, coordinator.currentFeeBreakdown.value)

        val continuation = coordinator.confirmFeeBreakdown()

        assertFalse(coordinator.showFeeBreakdown.value)
        assertNull(coordinator.currentFeeBreakdown.value)
        assertFalse(continued)

        continuation?.invoke()

        assertTrue(continued)
        assertNull(coordinator.consumePendingPaymentSheetIntent())
        assertNull(coordinator.confirmFeeBreakdown())
    }

    @Test
    fun fee_breakdown_dismiss_clears_state_and_pending_continuation() {
        val coordinator = EventRegistrationFlowCoordinator()
        coordinator.showFeeBreakdown(feeBreakdown()) {}

        coordinator.dismissFeeBreakdown()

        assertFalse(coordinator.showFeeBreakdown.value)
        assertNull(coordinator.currentFeeBreakdown.value)
        assertNull(coordinator.confirmFeeBreakdown())
    }

    @Test
    fun payment_sheet_intent_can_be_consumed_once_or_cleared() {
        val coordinator = EventRegistrationFlowCoordinator()
        val purchaseIntent = purchaseIntent("registration-1")

        coordinator.setPendingPaymentSheetIntent(purchaseIntent)

        assertEquals(purchaseIntent, coordinator.consumePendingPaymentSheetIntent())
        assertNull(coordinator.consumePendingPaymentSheetIntent())

        coordinator.setPendingPaymentSheetIntent(purchaseIntent)
        coordinator.clearPendingPaymentSheetIntent()

        assertNull(coordinator.consumePendingPaymentSheetIntent())
    }

    @Test
    fun fee_breakdown_dismiss_clears_pending_payment_sheet_intent() {
        val coordinator = EventRegistrationFlowCoordinator()
        coordinator.setPendingPaymentSheetIntent(purchaseIntent("registration-1"))
        coordinator.showFeeBreakdown(feeBreakdown()) {}

        coordinator.dismissFeeBreakdown()

        assertNull(coordinator.consumePendingPaymentSheetIntent())
    }

    @Test
    fun team_registration_state_tracks_starting_id_and_pending_team() {
        val coordinator = EventRegistrationFlowCoordinator()
        val team = teamWithPlayers("team-1")

        assertTrue(coordinator.startTeamRegistration(" team-1 "))
        assertEquals("team-1", coordinator.startingTeamRegistrationId.value)
        assertFalse(coordinator.startTeamRegistration("team-2"))

        coordinator.setPendingTeamRegistration(team)

        assertEquals(team, coordinator.currentPendingTeamRegistration())

        coordinator.clearStartingTeamRegistrationIfNoPendingTeam()

        assertEquals("team-1", coordinator.startingTeamRegistrationId.value)

        coordinator.clearPendingTeamRegistration()
        coordinator.clearStartingTeamRegistrationIfNoPendingTeam()

        assertNull(coordinator.startingTeamRegistrationId.value)
    }

    @Test
    fun team_registration_state_can_be_cleared_together() {
        val coordinator = EventRegistrationFlowCoordinator()
        val team = teamWithPlayers("team-1")

        coordinator.setStartingTeamRegistrationId(" team-1 ")
        coordinator.setPendingTeamRegistration(team)
        coordinator.clearTeamRegistrationState()

        assertNull(coordinator.startingTeamRegistrationId.value)
        assertNull(coordinator.currentPendingTeamRegistration())
    }

    @Test
    fun signature_prompts_can_be_shown_and_cleared_independently() {
        val coordinator = EventRegistrationFlowCoordinator()
        val textPrompt = TextSignaturePromptState(
            step = signStep("text-template"),
            currentStep = 1,
            totalSteps = 2,
        )
        val webPrompt = WebSignaturePromptState(
            step = signStep("web-template", type = "PDF"),
            url = "https://example.com/sign",
            currentStep = 2,
            totalSteps = 2,
        )

        coordinator.showTextSignaturePrompt(textPrompt)
        coordinator.showWebSignaturePrompt(webPrompt)

        assertEquals(textPrompt, coordinator.textSignaturePrompt.value)
        assertEquals(webPrompt, coordinator.webSignaturePrompt.value)

        coordinator.clearTextSignaturePrompt()

        assertNull(coordinator.textSignaturePrompt.value)
        assertEquals(webPrompt, coordinator.webSignaturePrompt.value)

        coordinator.clearWebSignaturePrompt()

        assertNull(coordinator.webSignaturePrompt.value)
    }

    @Test
    fun clear_signature_prompts_dismisses_text_and_web_prompts() {
        val coordinator = EventRegistrationFlowCoordinator()
        coordinator.showTextSignaturePrompt(
            TextSignaturePromptState(
                step = signStep("text-template"),
                currentStep = 1,
                totalSteps = 1,
            ),
        )
        coordinator.showWebSignaturePrompt(
            WebSignaturePromptState(
                step = null,
                url = "https://example.com/sign",
                currentStep = 1,
                totalSteps = 1,
            ),
        )

        coordinator.clearSignaturePrompts()

        assertNull(coordinator.textSignaturePrompt.value)
        assertNull(coordinator.webSignaturePrompt.value)
    }

    @Test
    fun signature_flow_state_tracks_targets_steps_and_continuation() = runTest {
        val coordinator = EventRegistrationFlowCoordinator()
        val child = joinChild("child-1")
        val firstStep = signStep("text-template")
        val secondStep = signStep("web-template", type = "PDF")
        var continued = false

        coordinator.startRequiredSignatureFlow(
            signerContext = SignerContext.PARENT_GUARDIAN,
            child = child,
            currentAccountEmail = " child@example.com ",
            teamId = " team-1 ",
            onReady = { continued = true },
        )

        assertTrue(coordinator.hasPendingSignatureFlow())
        assertTrue(coordinator.hasSignatureContexts())

        val firstTarget = coordinator.currentSignatureFetchTarget()

        assertEquals(SignerContext.PARENT_GUARDIAN, firstTarget.signerContext)
        assertEquals(child, firstTarget.child)
        assertEquals("team-1", firstTarget.teamId)
        assertEquals(firstTarget, coordinator.currentSignatureRecordingTarget())

        coordinator.replacePendingSignatureSteps(listOf(firstStep, secondStep))

        assertEquals(
            PendingSignatureStepState(
                step = firstStep,
                currentStep = 1,
                totalSteps = 2,
            ),
            coordinator.currentPendingSignatureStep(),
        )

        coordinator.clearPendingSignatureSteps()

        assertNull(coordinator.currentPendingSignatureStep())
        assertTrue(coordinator.advanceSignatureContext())

        val secondTarget = coordinator.currentSignatureFetchTarget()

        assertEquals(SignerContext.CHILD, secondTarget.signerContext)
        assertFalse(continued)

        coordinator.completePendingSignatureFlow()?.invoke()

        assertTrue(continued)
        assertFalse(coordinator.hasPendingSignatureFlow())
        assertFalse(coordinator.hasSignatureContexts())
    }

    @Test
    fun signature_flow_clear_resets_state_and_prompts() {
        val coordinator = EventRegistrationFlowCoordinator()
        val child = joinChild("child-1")
        val step = signStep("text-template")
        val pollJob = Job()

        coordinator.startRequiredSignatureFlow(
            signerContext = SignerContext.PARENT_GUARDIAN,
            child = child,
            currentAccountEmail = "parent@example.com",
            teamId = "team-1",
            onReady = {},
        )
        coordinator.replacePendingSignatureSteps(listOf(step))
        coordinator.showTextSignaturePrompt(
            TextSignaturePromptState(
                step = step,
                currentStep = 1,
                totalSteps = 1,
            )
        )
        coordinator.showWebSignaturePrompt(
            WebSignaturePromptState(
                step = null,
                url = "https://example.com/sign",
                currentStep = 1,
                totalSteps = 1,
            )
        )
        coordinator.replacePendingSignaturePollJob(pollJob)

        coordinator.clearPendingSignatureFlow()

        assertFalse(coordinator.hasPendingSignatureFlow())
        assertFalse(coordinator.hasSignatureContexts())
        assertFalse(coordinator.hasPendingSignaturePollJob())
        assertTrue(pollJob.isCancelled)
        assertNull(coordinator.currentPendingSignatureStep())
        assertNull(coordinator.textSignaturePrompt.value)
        assertNull(coordinator.webSignaturePrompt.value)
        assertEquals(
            SignatureFlowTarget(
                signerContext = SignerContext.PARTICIPANT,
                child = null,
                teamId = null,
            ),
            coordinator.currentSignatureRecordingTarget(),
        )
    }

    @Test
    fun signature_poll_job_replacement_cancels_previous_job() {
        val coordinator = EventRegistrationFlowCoordinator()
        val firstJob = Job()
        val secondJob = Job()

        coordinator.replacePendingSignaturePollJob(firstJob)

        assertTrue(coordinator.hasPendingSignaturePollJob())
        assertTrue(firstJob.isActive)

        coordinator.replacePendingSignaturePollJob(secondJob)

        assertTrue(firstJob.isCancelled)
        assertTrue(secondJob.isActive)
        assertTrue(coordinator.hasPendingSignaturePollJob())

        coordinator.clearPendingSignaturePollJob()

        assertTrue(secondJob.isCancelled)
        assertFalse(coordinator.hasPendingSignaturePollJob())
    }

    private fun signStep(
        templateId: String,
        type: String = "TEXT",
    ): SignStep {
        return SignStep(
            templateId = templateId,
            type = type,
        )
    }

    private fun joinChild(userId: String): JoinChildOption {
        return JoinChildOption(
            userId = userId,
            fullName = "Child $userId",
            email = "child@example.com",
            hasEmail = true,
        )
    }

    private fun teamWithPlayers(teamId: String): TeamWithPlayers {
        return TeamWithPlayers(
            team = Team(captainId = "captain-1").copy(
                id = teamId,
                name = "Team One",
            ),
            captain = null,
            players = emptyList(),
            pendingPlayers = emptyList(),
        )
    }

    private fun paymentPreview(): PaymentPlanPreviewDialogState {
        return PaymentPlanPreviewDialogState(
            ownerLabel = "You",
            totalAmountCents = 10000,
            installmentAmounts = listOf(5000, 5000),
            installmentDueDates = listOf("2026-07-01", "2026-08-01"),
        )
    }

    private fun feeBreakdown(): FeeBreakdown {
        return FeeBreakdown(
            eventPrice = 10000,
            stripeFee = 300,
            processingFee = 500,
            totalCharge = 10800,
            hostReceives = 9500,
            feePercentage = 5f,
        )
    }

    private fun purchaseIntent(registrationId: String): PurchaseIntent {
        return PurchaseIntent(
            paymentIntent = "pi_$registrationId",
            registrationId = registrationId,
        )
    }

    private fun paidEvent(teamSignup: Boolean = false): Event {
        return Event(
            id = "event-1",
            teamSignup = teamSignup,
            divisions = listOf("open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "open",
                    price = 1000,
                )
            ),
        )
    }

    private fun teamRegistrationResult(
        registrationStatus: String? = null,
        consent: TeamRegistrationConsent? = null,
        warnings: List<String> = emptyList(),
        requiresParentApproval: Boolean = false,
        message: String? = null,
    ): TeamRegistrationResult {
        return TeamRegistrationResult(
            team = Team(captainId = "captain-1").copy(id = "team-1"),
            registrationStatus = registrationStatus,
            consent = consent,
            warnings = warnings,
            requiresParentApproval = requiresParentApproval,
            message = message,
        )
    }

    private fun effectivePaymentPlan(
        priceCents: Int?,
        allowPaymentPlans: Boolean,
    ): EffectivePaymentPlan {
        return EffectivePaymentPlan(
            priceCents = priceCents,
            allowPaymentPlans = allowPaymentPlans,
            installmentAmounts = emptyList(),
            installmentDueDates = emptyList(),
            installmentDueRelativeDays = emptyList(),
        )
    }

    private fun question(
        id: String,
        prompt: String = "Prompt $id",
        required: Boolean = false,
    ): TeamJoinQuestion {
        return TeamJoinQuestion(
            id = id,
            prompt = prompt,
            required = required,
        )
    }
}
