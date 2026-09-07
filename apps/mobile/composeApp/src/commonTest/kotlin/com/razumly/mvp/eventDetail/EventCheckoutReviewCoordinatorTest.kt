package com.razumly.mvp.eventDetail

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class EventCheckoutReviewCoordinatorTest {
    private val registration = EventCheckoutReviewState("River Cup", "Free agent", null, 0, emptyList())

    @Test
    fun given_registration_rules_when_review_is_built_then_action_matches_execution() {
        val flow = EventRegistrationFlowCoordinator()
        val paid = EffectivePaymentPlan(12000, false, emptyList(), emptyList(), emptyList())
        fun action(minor: Boolean = false, manager: Boolean = false, manual: Boolean = false,
            full: Boolean = false, teamEvent: Boolean = false, forTeam: Boolean = false,
            plan: EffectivePaymentPlan = paid): EventCheckoutAction = checkoutReviewAction(
                flow.determineJoinExecutionAction(plan, minor, full, teamEvent, forTeam, manual, manager), false)
        assertEquals(EventCheckoutAction.PAYMENT, action())
        assertEquals(EventCheckoutAction.REGISTER, action(manager = true))
        assertEquals(EventCheckoutAction.APPROVAL, action(minor = true, manager = true))
        assertEquals(EventCheckoutAction.MANUAL, action(manual = true))
        assertEquals(EventCheckoutAction.PLAN, action(plan = paid.copy(allowPaymentPlans = true)))
        assertEquals(EventCheckoutAction.REGISTER, action(teamEvent = true))
        assertEquals(EventCheckoutAction.REGISTER, action(full = true, forTeam = true))
        assertEquals(EventCheckoutAction.CHILD, checkoutReviewAction(JoinExecutionAction.CREATE_PURCHASE_INTENT, true))
    }

    @Test
    fun given_pending_document_when_server_clears_it_then_review_records_signed_status() {
        val flow = EventRegistrationFlowCoordinator()
        val step = com.razumly.mvp.core.data.repositories.SignStep(templateId = "waiver", type = "TEXT")
        flow.replacePendingSignatureSteps(listOf(step))
        assertEquals(false, flow.checkoutDocuments.single().complete)
        flow.replacePendingSignatureSteps(emptyList())
        assertEquals(true, flow.checkoutDocuments.single().complete)
    }

    @Test
    fun given_prepared_registration_when_review_opens_then_submission_waits_for_confirmation() {
        val checkout = EventCheckoutReviewCoordinator()
        var submissions = 0
        checkout.prepare(registration) { submissions++ }
        assertEquals(0, submissions)
        assertEquals(registration, checkout.review.value)
        checkout.confirm()
        assertEquals(1, submissions)
        assertNull(checkout.review.value)
    }

    @Test
    fun given_confirmed_registration_when_confirm_is_repeated_then_submission_runs_once() {
        val checkout = EventCheckoutReviewCoordinator()
        var submissions = 0
        checkout.prepare(registration) { submissions++ }
        checkout.confirm()
        checkout.confirm()
        assertEquals(1, submissions)
    }

    @Test
    fun given_cancelled_review_when_stale_confirm_arrives_then_nothing_is_submitted() {
        val checkout = EventCheckoutReviewCoordinator()
        var submissions = 0
        checkout.prepare(registration) { submissions++ }
        checkout.cancel()
        checkout.confirm()
        assertEquals(0, submissions)
        assertNull(checkout.review.value)
    }

    @Test
    fun given_changed_registration_when_confirmed_then_only_the_current_selection_is_submitted() {
        val checkout = EventCheckoutReviewCoordinator()
        val submissions = mutableListOf<String>()
        checkout.prepare(registration) { submissions += "old" }
        checkout.prepare(registration.copy(ownerLabel = "New selection")) { submissions += "new" }
        checkout.confirm()
        assertEquals(listOf("new"), submissions)
    }
}
