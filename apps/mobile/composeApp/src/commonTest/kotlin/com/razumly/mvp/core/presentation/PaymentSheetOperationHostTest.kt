package com.razumly.mvp.core.presentation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class PaymentSheetOperationHostTest {

    @Test
    fun given_presented_product_checkout_when_team_checkout_starts_then_second_owner_is_rejected() {
        val host = host()
        val product = requireNotNull(host.start(TestOwner.PRODUCT))

        assertTrue(host.awaitResult(product))

        assertNull(host.start(TestOwner.TEAM))
        assertSame(product, host.activeOperation)
        assertEquals(TestOwner.PRODUCT, host.activeOperation?.owner)
    }

    @Test
    fun given_presented_rental_checkout_when_result_arrives_then_only_that_operation_can_claim_it() {
        val host = host()
        val rental = requireNotNull(host.start(TestOwner.RENTAL))
        assertTrue(host.awaitResult(rental))

        val claimed = requireNotNull(host.claimResult())

        assertSame(rental, claimed)
        assertEquals("checkout-1", claimed.operationId)
        assertEquals(TestOwner.RENTAL, claimed.owner)
        assertEquals(PaymentSheetOperationPhase.RESOLVING, claimed.phase)
        assertNull(host.start(TestOwner.PRODUCT))
    }

    @Test
    fun given_preparing_checkout_when_a_stale_result_arrives_then_it_is_not_claimed() {
        val host = host()
        val checkout = requireNotNull(host.start(TestOwner.TEAM))

        assertNull(host.claimResult())
        assertSame(checkout, host.activeOperation)
        assertEquals(PaymentSheetOperationPhase.PREPARING, checkout.phase)
    }

    @Test
    fun given_claimed_result_when_its_payload_is_not_a_match_then_original_checkout_stays_waiting() {
        val host = host()
        val checkout = requireNotNull(host.start(TestOwner.PRODUCT))
        assertTrue(host.awaitResult(checkout))
        val claimed = requireNotNull(host.claimResult())

        assertTrue(host.releaseResultClaim(claimed))
        assertSame(checkout, host.activeOperation)
        assertEquals(PaymentSheetOperationPhase.AWAITING_RESULT, checkout.phase)
        assertNull(host.start(TestOwner.RENTAL))
    }

    @Test
    fun given_finished_checkout_when_stale_operation_finishes_then_new_owner_remains_active() {
        val host = host()
        val first = requireNotNull(host.start(TestOwner.PRODUCT))
        assertTrue(host.finish(first))
        val second = requireNotNull(host.start(TestOwner.TEAM))

        assertFalse(host.finish(first))
        assertSame(second, host.activeOperation)
        assertEquals("checkout-2", second.operationId)
    }

    private fun host(): PaymentSheetOperationHost<TestOwner> {
        var nextId = 0
        return PaymentSheetOperationHost {
            nextId += 1
            "checkout-$nextId"
        }
    }

    private enum class TestOwner {
        PRODUCT,
        TEAM,
        RENTAL,
    }
}
