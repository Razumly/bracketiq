package com.razumly.mvp.core.presentation.composables

import com.razumly.mvp.core.data.repositories.InclusivePriceBreakdown
import com.razumly.mvp.core.data.repositories.InclusivePriceQuote
import com.razumly.mvp.core.data.repositories.InclusivePriceQuoteDirection
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class InclusivePriceQuoteCoordinatorTest {
    @Test
    fun requests_initial_total_quote_including_zero() = runTest {
        val requests = mutableListOf<Triple<InclusivePriceQuoteDirection, Int, String?>>()
        val coordinator = InclusivePriceQuoteCoordinator(
            initialTotalPriceCents = 0,
            eventType = "TOURNAMENT",
            scope = backgroundScope,
            requestQuote = { direction, amountCents, eventType ->
                requests += Triple(direction, amountCents, eventType)
                Result.success(quote(direction, amountCents, hostCents = 0, totalCents = 0))
            },
        )

        assertTrue(coordinator.state.value.isPending)
        runCurrent()

        assertEquals(
            listOf<Triple<InclusivePriceQuoteDirection, Int, String?>>(
                Triple(InclusivePriceQuoteDirection.TOTAL_PRICE, 0, "TOURNAMENT"),
            ),
            requests,
        )
        assertEquals("", coordinator.state.value.hostInput)
        assertEquals("", coordinator.state.value.totalInput)
        assertEquals(1L, coordinator.state.value.generation)
        assertEquals(1L, coordinator.state.value.acceptedGeneration)
        assertTrue(coordinator.state.value.isCurrentInputConfirmed)
    }

    @Test
    fun debounces_edits_and_requests_only_the_latest_raw_amount() = runTest {
        val requests = mutableListOf<Pair<InclusivePriceQuoteDirection, Int>>()
        val coordinator = InclusivePriceQuoteCoordinator(
            initialTotalPriceCents = 1000,
            eventType = null,
            scope = backgroundScope,
            debounceMillis = 250,
            requestQuote = { direction, amountCents, _ ->
                requests += direction to amountCents
                Result.success(quote(direction, amountCents))
            },
        )
        runCurrent()

        coordinator.updateHostInput("1200")
        advanceTimeBy(200)
        coordinator.updateHostInput("1300")
        advanceTimeBy(249)
        runCurrent()

        assertEquals(listOf(InclusivePriceQuoteDirection.TOTAL_PRICE to 1000), requests)
        assertEquals("1300", coordinator.state.value.hostInput)
        assertTrue(coordinator.state.value.isPending)
        assertFalse(coordinator.state.value.isCurrentInputConfirmed)

        advanceTimeBy(1)
        runCurrent()

        assertEquals(
            listOf(
                InclusivePriceQuoteDirection.TOTAL_PRICE to 1000,
                InclusivePriceQuoteDirection.HOST_AMOUNT to 1300,
            ),
            requests,
        )
        assertTrue(coordinator.state.value.isCurrentInputConfirmed)
    }

    @Test
    fun newer_generation_wins_when_in_flight_responses_finish_out_of_order() = runTest {
        val olderResponse = CompletableDeferred<Result<InclusivePriceQuote>>()
        val newerResponse = CompletableDeferred<Result<InclusivePriceQuote>>()
        val startedAmounts = mutableListOf<Int>()
        val coordinator = InclusivePriceQuoteCoordinator(
            initialTotalPriceCents = 1000,
            eventType = null,
            scope = backgroundScope,
            debounceMillis = 10,
            requestQuote = { direction, amountCents, _ ->
                startedAmounts += amountCents
                when (amountCents) {
                    1000 -> Result.success(quote(direction, amountCents))
                    2000 -> olderResponse.await()
                    3000 -> newerResponse.await()
                    else -> error("Unexpected amount: $amountCents")
                }
            },
        )
        runCurrent()

        coordinator.updateHostInput("2000")
        advanceTimeBy(10)
        runCurrent()
        coordinator.updateHostInput("3000")
        advanceTimeBy(10)
        runCurrent()

        assertEquals(listOf(1000, 2000, 3000), startedAmounts)
        newerResponse.complete(
            Result.success(
                quote(
                    direction = InclusivePriceQuoteDirection.HOST_AMOUNT,
                    requestedAmountCents = 3000,
                    hostCents = 3000,
                    totalCents = 3333,
                ),
            ),
        )
        runCurrent()

        assertEquals(3000, coordinator.state.value.acceptedQuote?.requestedAmountCents)
        assertEquals("3333", coordinator.state.value.totalInput)
        assertTrue(coordinator.state.value.isCurrentInputConfirmed)

        olderResponse.complete(
            Result.success(
                quote(
                    direction = InclusivePriceQuoteDirection.HOST_AMOUNT,
                    requestedAmountCents = 2000,
                    hostCents = 2000,
                    totalCents = 2222,
                ),
            ),
        )
        runCurrent()

        assertEquals(3000, coordinator.state.value.acceptedQuote?.requestedAmountCents)
        assertEquals("3333", coordinator.state.value.totalInput)
        assertTrue(coordinator.state.value.isCurrentInputConfirmed)
    }

    @Test
    fun failure_keeps_last_quote_unconfirmed_and_retry_accepts_current_amount() = runTest {
        var currentAmountAttempts = 0
        val coordinator = InclusivePriceQuoteCoordinator(
            initialTotalPriceCents = 1000,
            eventType = "EVENT",
            scope = backgroundScope,
            debounceMillis = 10,
            requestQuote = { direction, amountCents, _ ->
                if (amountCents == 1200) {
                    currentAmountAttempts += 1
                    if (currentAmountAttempts == 1) {
                        Result.failure(IllegalStateException("Quote service unavailable"))
                    } else {
                        Result.success(quote(direction, amountCents, hostCents = 1111, totalCents = 1200))
                    }
                } else {
                    Result.success(quote(direction, amountCents))
                }
            },
        )
        runCurrent()
        val acceptedInitialQuote = coordinator.state.value.acceptedQuote

        coordinator.updateTotalInput("1200")
        advanceTimeBy(10)
        runCurrent()

        assertEquals(acceptedInitialQuote, coordinator.state.value.acceptedQuote)
        assertEquals("1200", coordinator.state.value.totalInput)
        assertEquals("Unable to refresh the online price.", coordinator.state.value.errorMessage)
        assertFalse(coordinator.state.value.isPending)
        assertFalse(coordinator.state.value.isCurrentInputConfirmed)

        val failedGeneration = coordinator.state.value.generation
        coordinator.retry()
        runCurrent()

        assertEquals(failedGeneration + 1, coordinator.state.value.generation)
        assertEquals(1200, coordinator.state.value.acceptedQuote?.requestedAmountCents)
        assertEquals("1111", coordinator.state.value.hostInput)
        assertNull(coordinator.state.value.errorMessage)
        assertTrue(coordinator.state.value.isCurrentInputConfirmed)
    }

    @Test
    fun same_external_total_does_not_implicitly_retry_a_failed_quote() = runTest {
        var attempts = 0
        val coordinator = InclusivePriceQuoteCoordinator(
            initialTotalPriceCents = 1_000,
            eventType = null,
            scope = backgroundScope,
            requestQuote = { direction, amountCents, _ ->
                attempts += 1
                if (attempts == 1) {
                    Result.failure(IllegalStateException("Quote service unavailable"))
                } else {
                    Result.success(quote(direction, amountCents, hostCents = 800, totalCents = 1_000))
                }
            },
        )
        runCurrent()

        assertEquals(1, attempts)
        assertEquals("Unable to refresh the online price.", coordinator.state.value.errorMessage)

        coordinator.syncExternalTotalPrice(1_000)
        runCurrent()

        assertEquals(1, attempts)
        assertEquals("Unable to refresh the online price.", coordinator.state.value.errorMessage)
        assertFalse(coordinator.state.value.isPending)
        assertFalse(coordinator.state.value.isCurrentInputConfirmed)

        coordinator.retry()
        runCurrent()

        assertEquals(2, attempts)
        assertNull(coordinator.state.value.errorMessage)
        assertTrue(coordinator.state.value.isCurrentInputConfirmed)
    }

    @Test
    fun owner_driven_total_changes_replace_stale_editor_state_and_requote() = runTest {
        val requests = mutableListOf<Pair<InclusivePriceQuoteDirection, Int>>()
        val coordinator = InclusivePriceQuoteCoordinator(
            initialTotalPriceCents = 1_000,
            eventType = null,
            scope = backgroundScope,
            requestQuote = { direction, amountCents, _ ->
                requests += direction to amountCents
                Result.success(quote(direction, amountCents))
            },
        )
        runCurrent()

        coordinator.syncExternalTotalPrice(2_500)
        assertFalse(coordinator.state.value.isCurrentInputConfirmed)
        assertEquals("2500", coordinator.state.value.totalInput)
        runCurrent()

        assertEquals(
            listOf(
                InclusivePriceQuoteDirection.TOTAL_PRICE to 1_000,
                InclusivePriceQuoteDirection.TOTAL_PRICE to 2_500,
            ),
            requests,
        )
        assertEquals(2_500, coordinator.state.value.acceptedQuote?.requestedAmountCents)
        assertTrue(coordinator.state.value.isCurrentInputConfirmed)

        coordinator.syncExternalTotalPrice(2_500)
        runCurrent()
        assertEquals(2, requests.size)
    }

    @Test
    fun owner_echo_of_an_accepted_host_quote_does_not_start_a_second_request() = runTest {
        val requests = mutableListOf<Pair<InclusivePriceQuoteDirection, Int>>()
        val coordinator = InclusivePriceQuoteCoordinator(
            initialTotalPriceCents = 1_000,
            eventType = null,
            scope = backgroundScope,
            debounceMillis = 0,
            requestQuote = { direction, amountCents, _ ->
                requests += direction to amountCents
                Result.success(
                    if (direction == InclusivePriceQuoteDirection.HOST_AMOUNT) {
                        quote(direction, amountCents, hostCents = amountCents, totalCents = 9_876)
                    } else {
                        quote(direction, amountCents)
                    },
                )
            },
        )
        runCurrent()

        coordinator.updateHostInput("7777")
        runCurrent()
        assertTrue(coordinator.state.value.isCurrentInputConfirmed)
        assertEquals(9_876, coordinator.state.value.acceptedQuote?.breakdown?.totalPriceCents)

        coordinator.syncExternalTotalPrice(9_876)
        runCurrent()

        assertEquals(
            listOf(
                InclusivePriceQuoteDirection.TOTAL_PRICE to 1_000,
                InclusivePriceQuoteDirection.HOST_AMOUNT to 7_777,
            ),
            requests,
        )
        assertEquals(InclusivePriceQuoteDirection.HOST_AMOUNT, coordinator.state.value.activeDirection)
        assertTrue(coordinator.state.value.isCurrentInputConfirmed)
    }

    @Test
    fun mismatched_success_is_not_accepted() = runTest {
        val coordinator = InclusivePriceQuoteCoordinator(
            initialTotalPriceCents = 1000,
            eventType = null,
            scope = backgroundScope,
            requestQuote = { direction, amountCents, _ ->
                Result.success(quote(direction, amountCents + 1))
            },
        )

        runCurrent()

        assertNull(coordinator.state.value.acceptedQuote)
        assertEquals("The price quote did not match the current amount.", coordinator.state.value.errorMessage)
        assertFalse(coordinator.state.value.isPending)
        assertFalse(coordinator.state.value.isCurrentInputConfirmed)
    }

    @Test
    fun close_invalidates_generation_and_ignores_late_response() = runTest {
        val response = CompletableDeferred<Result<InclusivePriceQuote>>()
        val coordinator = InclusivePriceQuoteCoordinator(
            initialTotalPriceCents = 1000,
            eventType = null,
            scope = backgroundScope,
            requestQuote = { direction, amountCents, _ ->
                response.await().map { returned ->
                    assertEquals(direction, returned.direction)
                    assertEquals(amountCents, returned.requestedAmountCents)
                    returned
                }
            },
        )
        runCurrent()
        val pendingGeneration = coordinator.state.value.generation

        coordinator.close()
        assertEquals(pendingGeneration + 1, coordinator.state.value.generation)
        assertFalse(coordinator.state.value.isPending)

        response.complete(
            Result.success(
                quote(
                    direction = InclusivePriceQuoteDirection.TOTAL_PRICE,
                    requestedAmountCents = 1000,
                ),
            ),
        )
        runCurrent()

        assertNull(coordinator.state.value.acceptedQuote)
        assertNull(coordinator.state.value.acceptedGeneration)
        assertFalse(coordinator.state.value.isCurrentInputConfirmed)
    }

    private fun quote(
        direction: InclusivePriceQuoteDirection,
        requestedAmountCents: Int,
        hostCents: Int = requestedAmountCents,
        totalCents: Int = requestedAmountCents,
    ): InclusivePriceQuote = InclusivePriceQuote(
        version = 1,
        direction = direction,
        requestedAmountCents = requestedAmountCents,
        breakdown = InclusivePriceBreakdown(
            hostReceivesCents = hostCents,
            processingFeeCents = (totalCents - hostCents).coerceAtLeast(0),
            platformFeeCents = 0,
            totalPriceCents = totalCents,
            platformFeePercentage = 0.123,
        ),
    )
}
