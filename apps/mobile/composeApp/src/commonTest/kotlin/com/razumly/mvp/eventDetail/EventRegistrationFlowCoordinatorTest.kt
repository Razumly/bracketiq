package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.RegistrationProgressDraft
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.FeeBreakdown
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.SignerContext
import com.razumly.mvp.core.data.repositories.TeamJoinQuestion
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

        coordinator.clearPendingSignatureFlow()

        assertFalse(coordinator.hasPendingSignatureFlow())
        assertFalse(coordinator.hasSignatureContexts())
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
