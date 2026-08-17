package com.razumly.mvp.profile

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class ProfileCheckoutSessionCoordinatorTest {

    @Test
    fun given_bill_checkout_when_child_checkout_starts_then_second_owner_is_rejected() {
        val coordinator = coordinator()

        val billCheckout = coordinator.start(ProfileCheckoutOwner.BILL_INSTALLMENT)
        val childCheckout = coordinator.start(ProfileCheckoutOwner.CHILD_TEAM_REGISTRATION)

        assertEquals("checkout-1", billCheckout?.operationId)
        assertNull(childCheckout)
        assertSame(billCheckout, coordinator.activeSession)
    }

    @Test
    fun given_presented_bill_checkout_when_result_arrives_then_only_bill_owner_claims_it() {
        val coordinator = coordinator()
        val billCheckout = requireNotNull(coordinator.start(ProfileCheckoutOwner.BILL_INSTALLMENT))
        assertTrue(coordinator.awaitPaymentResult(billCheckout))

        val claimed = requireNotNull(coordinator.claimPaymentResult())

        assertSame(billCheckout, claimed)
        assertEquals(ProfileCheckoutOwner.BILL_INSTALLMENT, claimed.owner)
        assertEquals(ProfileCheckoutPhase.RESOLVING, claimed.phase)
        assertNull(coordinator.start(ProfileCheckoutOwner.CHILD_TEAM_REGISTRATION))
    }

    @Test
    fun given_no_presented_checkout_when_result_arrives_then_result_is_unowned_and_state_is_unchanged() {
        val coordinator = coordinator()
        val preparingCheckout = requireNotNull(coordinator.start(ProfileCheckoutOwner.CHILD_TEAM_REGISTRATION))

        assertNull(coordinator.claimPaymentResult())
        assertSame(preparingCheckout, coordinator.activeSession)
        assertEquals(ProfileCheckoutPhase.PREPARING, preparingCheckout.phase)
    }

    @Test
    fun given_claimed_result_when_payload_is_rejected_then_original_owner_remains_waiting() {
        val coordinator = coordinator()
        val billCheckout = requireNotNull(coordinator.start(ProfileCheckoutOwner.BILL_INSTALLMENT))
        assertTrue(coordinator.awaitPaymentResult(billCheckout))
        val claimed = requireNotNull(coordinator.claimPaymentResult())

        assertTrue(coordinator.releasePaymentResultClaim(claimed))

        assertSame(billCheckout, coordinator.activeSession)
        assertEquals(ProfileCheckoutPhase.AWAITING_PAYMENT_RESULT, billCheckout.phase)
    }

    @Test
    fun given_finished_checkout_when_stale_session_finishes_then_new_checkout_remains_owned() {
        val coordinator = coordinator()
        val firstCheckout = requireNotNull(coordinator.start(ProfileCheckoutOwner.BILL_INSTALLMENT))
        assertTrue(coordinator.finish(firstCheckout))
        val secondCheckout = requireNotNull(coordinator.start(ProfileCheckoutOwner.CHILD_TEAM_REGISTRATION))

        assertFalse(coordinator.finish(firstCheckout))
        assertSame(secondCheckout, coordinator.activeSession)
        assertEquals("checkout-2", secondCheckout.operationId)
    }

    private fun coordinator(): ProfileCheckoutSessionCoordinator {
        var nextId = 0
        return ProfileCheckoutSessionCoordinator {
            nextId += 1
            "checkout-$nextId"
        }
    }
}
