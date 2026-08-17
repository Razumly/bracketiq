package com.razumly.mvp.organizationDetail

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class OrganizationCheckoutSessionCoordinatorTest {

    @Test
    fun given_product_checkout_when_rental_checkout_starts_then_second_owner_is_rejected() {
        val coordinator = coordinator()

        val productCheckout = coordinator.start(OrganizationCheckoutOwner.PRODUCT)
        val rentalCheckout = coordinator.start(OrganizationCheckoutOwner.RENTAL)

        assertEquals("checkout-1", productCheckout?.operationId)
        assertNull(rentalCheckout)
        assertSame(productCheckout, coordinator.activeSession)
    }

    @Test
    fun given_presented_team_checkout_when_result_arrives_then_only_that_session_claims_it() {
        val coordinator = coordinator()
        val teamCheckout = requireNotNull(coordinator.start(OrganizationCheckoutOwner.TEAM))
        assertTrue(coordinator.awaitResult(teamCheckout))

        val claimed = requireNotNull(coordinator.claimResult())

        assertSame(teamCheckout, claimed)
        assertEquals(OrganizationCheckoutOwner.TEAM, claimed.owner)
        assertEquals(OrganizationCheckoutPhase.RESOLVING, claimed.phase)
        assertNull(coordinator.start(OrganizationCheckoutOwner.PRODUCT))
    }

    @Test
    fun given_preparing_checkout_when_stale_result_arrives_then_result_is_not_claimed() {
        val coordinator = coordinator()
        val checkout = requireNotNull(coordinator.start(OrganizationCheckoutOwner.RENTAL))

        assertNull(coordinator.claimResult())
        assertSame(checkout, coordinator.activeSession)
        assertEquals(OrganizationCheckoutPhase.PREPARING, checkout.phase)
    }

    @Test
    fun given_claimed_result_when_it_is_released_then_original_checkout_remains_waiting() {
        val coordinator = coordinator()
        val checkout = requireNotNull(coordinator.start(OrganizationCheckoutOwner.PRODUCT))
        assertTrue(coordinator.awaitResult(checkout))
        val claimed = requireNotNull(coordinator.claimResult())

        assertTrue(coordinator.releaseClaim(claimed))

        assertSame(checkout, coordinator.activeSession)
        assertEquals(OrganizationCheckoutPhase.AWAITING_RESULT, checkout.phase)
    }

    @Test
    fun given_finished_checkout_when_stale_session_finishes_then_new_checkout_remains_owned() {
        val coordinator = coordinator()
        val firstCheckout = requireNotNull(coordinator.start(OrganizationCheckoutOwner.TEAM))
        assertTrue(coordinator.finish(firstCheckout))
        val secondCheckout = requireNotNull(coordinator.start(OrganizationCheckoutOwner.PRODUCT))

        assertFalse(coordinator.finish(firstCheckout))
        assertSame(secondCheckout, coordinator.activeSession)
        assertEquals("checkout-2", secondCheckout.operationId)
    }

    private fun coordinator(): OrganizationCheckoutSessionCoordinator {
        var nextId = 0
        return OrganizationCheckoutSessionCoordinator {
            nextId += 1
            "checkout-$nextId"
        }
    }
}
