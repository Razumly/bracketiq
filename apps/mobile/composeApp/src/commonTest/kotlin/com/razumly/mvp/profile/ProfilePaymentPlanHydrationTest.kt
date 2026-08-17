package com.razumly.mvp.profile

import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.dataTypes.BillPayment
import com.razumly.mvp.core.data.dataTypes.Event
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class ProfilePaymentPlanHydrationTest {
    @Test
    fun bounded_requests_preserve_input_order_without_exceeding_the_limit() = runTest {
        var activeRequests = 0
        var maximumActiveRequests = 0
        val completionOrder = mutableListOf<Int>()
        val delays = listOf(100L, 10L, 30L, 5L, 20L, 1L)

        val result = mapProfilePaymentPlanRequestsBounded(
            items = (0..5).toList(),
            maxConcurrency = 2,
            isCurrent = { true },
        ) { item ->
            activeRequests += 1
            maximumActiveRequests = maxOf(maximumActiveRequests, activeRequests)
            delay(delays[item])
            completionOrder += item
            activeRequests -= 1
            "result-$item"
        }

        assertEquals(2, maximumActiveRequests)
        assertEquals(listOf(1, 2, 3, 4, 5, 0), completionOrder)
        assertEquals((0..5).map { "result-$it" }, result)
    }

    @Test
    fun superseded_requests_stop_scheduling_new_work_and_return_null() = runTest {
        val release = CompletableDeferred<Unit>()
        val started = mutableListOf<Int>()
        var isCurrent = true

        val result = async {
            mapProfilePaymentPlanRequestsBounded(
                items = (0..4).toList(),
                maxConcurrency = 2,
                isCurrent = { isCurrent },
            ) { item ->
                started += item
                release.await()
                item
            }
        }
        runCurrent()

        assertEquals(listOf(0, 1), started)
        isCurrent = false
        release.complete(Unit)
        runCurrent()

        assertNull(result.await())
        assertEquals(listOf(0, 1), started)
    }

    @Test
    fun hydration_deduplicates_duplicate_bills_and_keeps_detail_failures_local() = runTest {
        val paymentFailure = IllegalStateException("payments unavailable")
        val eventFailure = IllegalStateException("event unavailable")
        val paymentCalls = mutableListOf<String>()
        val eventCalls = mutableListOf<String>()
        val loggedPaymentFailures = mutableListOf<Pair<String, Throwable>>()
        val loggedEventFailures = mutableListOf<Triple<String, String, Throwable>>()
        val payment = payment("bill-1")
        val sharedEvent = Event(id = "event-shared", name = "Shared Event")

        val hydration = hydrateProfilePaymentPlans(
            sources = listOf(
                source("bill-1", "User", eventId = " event-shared "),
                source("bill-2", "Team A", eventId = "event-shared"),
                source("bill-3", "Team B", eventId = "event-missing"),
                source("bill-1", "Duplicate owner", eventId = "event-shared"),
            ),
            isCurrent = { true },
            loadPayments = { bill ->
                paymentCalls += bill.id
                when (bill.id) {
                    "bill-1" -> Result.success(listOf(payment))
                    "bill-2" -> Result.failure(paymentFailure)
                    else -> Result.success(emptyList())
                }
            },
            loadEvent = { eventId ->
                eventCalls += eventId
                if (eventId == sharedEvent.id) {
                    Result.success(sharedEvent)
                } else {
                    Result.failure(eventFailure)
                }
            },
            onPaymentFailure = { bill, throwable ->
                loggedPaymentFailures += bill.id to throwable
            },
            onEventFailure = { eventId, bills, throwable ->
                bills.forEach { bill ->
                    loggedEventFailures += Triple(eventId, bill.id, throwable)
                }
            },
            maxConcurrency = 2,
        )

        assertEquals(listOf("bill-1", "bill-2", "bill-3"), paymentCalls)
        assertEquals(listOf("event-shared", "event-missing"), eventCalls)
        assertEquals(listOf("bill-1", "bill-2", "bill-3"), hydration?.plans?.map { it.bill.id })
        assertEquals(listOf("User", "Team A", "Team B"), hydration?.plans?.map { it.ownerLabel })
        assertEquals(listOf(payment), hydration?.plans?.get(0)?.payments)
        assertEquals(emptyList(), hydration?.plans?.get(1)?.payments)
        assertEquals(sharedEvent, hydration?.plans?.get(0)?.event)
        assertEquals(sharedEvent, hydration?.plans?.get(1)?.event)
        assertNull(hydration?.plans?.get(2)?.event)
        assertEquals(1, hydration?.paymentDetailFailureCount)
        assertEquals(1, hydration?.eventDetailFailureCount)
        assertEquals(
            "Some bill details could not be loaded: payment details for 1 bill and event details for 1 event. " +
                "The available bills are shown below; pull to refresh the missing details.",
            hydration?.warning,
        )
        assertEquals("bill-2", loggedPaymentFailures.single().first)
        assertEquals(paymentFailure, loggedPaymentFailures.single().second)
        assertEquals("event-missing", loggedEventFailures.single().first)
        assertEquals("bill-3", loggedEventFailures.single().second)
        assertEquals(eventFailure, loggedEventFailures.single().third)
    }

    @Test
    fun replacement_refresh_cancels_and_joins_previous_work_before_starting() = runTest {
        val coordinator = ProfilePaymentPlanRefreshCoordinator()
        val allowCancellationCleanup = CompletableDeferred<Unit>()
        var activeRequests = 0
        var maximumActiveRequests = 0
        var firstRefreshCancelled = false
        var secondRefreshStarted = false

        val firstRefresh = coordinator.replace(this) { isCurrent ->
            mapProfilePaymentPlanRequestsBounded(
                items = (0 until PROFILE_PAYMENT_PLAN_NETWORK_CONCURRENCY).toList(),
                isCurrent = isCurrent,
            ) {
                activeRequests += 1
                maximumActiveRequests = maxOf(maximumActiveRequests, activeRequests)
                try {
                    awaitCancellation()
                } finally {
                    firstRefreshCancelled = true
                    withContext(NonCancellable) {
                        allowCancellationCleanup.await()
                    }
                    activeRequests -= 1
                }
            }
        }
        runCurrent()
        assertEquals(PROFILE_PAYMENT_PLAN_NETWORK_CONCURRENCY, activeRequests)

        val secondRefresh = coordinator.replace(this) { isCurrent ->
            secondRefreshStarted = true
            mapProfilePaymentPlanRequestsBounded(
                items = (0 until PROFILE_PAYMENT_PLAN_NETWORK_CONCURRENCY).toList(),
                isCurrent = isCurrent,
            ) {
                activeRequests += 1
                maximumActiveRequests = maxOf(maximumActiveRequests, activeRequests)
                activeRequests -= 1
            }
        }
        runCurrent()

        assertTrue(firstRefreshCancelled)
        assertFalse(secondRefreshStarted)
        assertEquals(PROFILE_PAYMENT_PLAN_NETWORK_CONCURRENCY, maximumActiveRequests)

        allowCancellationCleanup.complete(Unit)
        firstRefresh.join()
        secondRefresh.join()

        assertTrue(secondRefreshStarted)
        assertEquals(0, activeRequests)
        assertEquals(PROFILE_PAYMENT_PLAN_NETWORK_CONCURRENCY, maximumActiveRequests)
    }

    @Test
    fun repeatedly_superseding_a_refresh_preserves_the_full_cancellation_handoff_chain() = runTest {
        val coordinator = ProfilePaymentPlanRefreshCoordinator()
        val allowFirstCleanup = CompletableDeferred<Unit>()
        var firstActive = true
        var secondStarted = false
        var thirdStarted = false

        val first = coordinator.replace(this) {
            try {
                awaitCancellation()
            } finally {
                withContext(NonCancellable) {
                    allowFirstCleanup.await()
                }
                firstActive = false
            }
        }
        runCurrent()

        val second = coordinator.replace(this) {
            secondStarted = true
        }
        val third = coordinator.replace(this) {
            thirdStarted = true
            assertFalse(firstActive)
        }
        runCurrent()

        assertFalse(secondStarted)
        assertFalse(thirdStarted)
        allowFirstCleanup.complete(Unit)
        first.join()
        second.join()
        third.join()

        assertFalse(secondStarted)
        assertTrue(thirdStarted)
    }

    @Test
    fun successful_hydration_has_no_partial_results_warning() = runTest {
        val hydration = hydrateProfilePaymentPlans(
            sources = listOf(source("bill-1", "User", eventId = null)),
            isCurrent = { true },
            loadPayments = { Result.success(emptyList()) },
            loadEvent = { error("No event should be loaded") },
        )

        assertEquals(0, hydration?.paymentDetailFailureCount)
        assertEquals(0, hydration?.eventDetailFailureCount)
        assertNull(hydration?.warning)
    }
}

private fun source(
    billId: String,
    ownerLabel: String,
    eventId: String?,
): ProfilePaymentPlanBillSource = ProfilePaymentPlanBillSource(
    bill = Bill(
        id = billId,
        ownerType = "USER",
        ownerId = "user-1",
        eventId = eventId,
        totalAmountCents = 1_000,
    ),
    ownerLabel = ownerLabel,
)

private fun payment(billId: String): BillPayment = BillPayment(
    id = "payment-$billId",
    billId = billId,
    sequence = 1,
    dueDate = "2026-07-20",
    amountCents = 1_000,
)
