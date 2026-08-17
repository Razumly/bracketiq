package com.razumly.mvp.refundManager

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.RefundRequestWithRelations
import com.razumly.mvp.core.util.LoadingHandlerImpl
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.coroutines.Continuation
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.test.fail

class RefundManagerComponentTest {
    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun refreshes_apply_only_the_latest_response_when_requests_finish_out_of_order() = runTest {
        val pending = ArrayDeque<Continuation<Result<List<RefundRequestWithRelations>>>>()
        val appliedRefundIds = mutableListOf<List<String>>()
        val loadingStates = mutableListOf<Boolean>()
        val coordinator = RefundRefreshCoordinator(
            scope = this,
            loadRefunds = {
                suspendCoroutine { continuation -> pending.addLast(continuation) }
            },
            onLoadingChanged = { isLoading -> loadingStates.add(isLoading) },
            onSuccess = { refunds ->
                appliedRefundIds.add(refunds.map { refund -> refund.refundRequest.id })
            },
            onFailure = { error -> throw error },
        )

        coordinator.refresh()
        runCurrent()
        coordinator.refresh()
        runCurrent()

        val firstRequest = pending.removeFirst()
        val secondRequest = pending.removeFirst()
        secondRequest.resume(Result.success(listOf(refund("new-refund"))))
        runCurrent()
        firstRequest.resume(Result.success(listOf(refund("stale-refund"))))
        runCurrent()

        assertEquals(listOf(listOf("new-refund")), appliedRefundIds)
        assertEquals(listOf(true, true, false), loadingStates)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun closing_coordinator_invalidates_in_flight_response_and_rejects_future_refreshes() = runTest {
        val pending = mutableListOf<Continuation<Result<List<RefundRequestWithRelations>>>>()
        val appliedRefundIds = mutableListOf<String>()
        val loadingStates = mutableListOf<Boolean>()
        val coordinator = RefundRefreshCoordinator(
            scope = this,
            loadRefunds = {
                suspendCoroutine { continuation -> pending += continuation }
            },
            onLoadingChanged = { isLoading -> loadingStates.add(isLoading) },
            onSuccess = { refunds ->
                appliedRefundIds += refunds.map { refund -> refund.refundRequest.id }
            },
            onFailure = { error -> throw error },
        )

        coordinator.refresh()
        runCurrent()
        coordinator.close()
        coordinator.refresh()
        pending.single().resume(Result.success(listOf(refund("late-refund"))))
        runCurrent()

        assertTrue(appliedRefundIds.isEmpty())
        assertEquals(listOf(true, false), loadingStates)
        assertEquals(1, pending.size)
    }

    @Test
    fun destroying_component_context_cancels_refund_manager_scope() {
        val lifecycle = LifecycleRegistry().apply {
            onCreate()
            onStart()
            onResume()
        }
        val context = DefaultComponentContext(
            lifecycle = lifecycle,
            backHandler = BackDispatcher(),
        )
        val scopeJob = checkNotNull(context.refundManagerCoroutineScope().coroutineContext[Job])

        assertTrue(scopeJob.isActive)
        lifecycle.onPause()
        lifecycle.onStop()
        lifecycle.onDestroy()

        assertFalse(scopeJob.isActive)
    }

    @Test
    fun refund_mutation_hides_loading_when_operation_throws() = runTest {
        val loadingHandler = LoadingHandlerImpl()
        var failure: Throwable? = null

        runRefundMutation(
            loadingHandler = loadingHandler,
            loadingMessage = "Approving refund...",
            operation = { throw IllegalStateException("offline") },
            onSuccess = { fail("Throwing mutation must not report success.") },
            onFailure = { error -> failure = error },
        )

        assertEquals("offline", failure?.message)
        assertFalse(loadingHandler.loadingState.value.isLoading)
    }

    @Test
    fun refund_mutation_does_not_require_loading_handler_injection() = runTest {
        var succeeded = false

        runRefundMutation(
            loadingHandler = null,
            loadingMessage = "Rejecting refund...",
            operation = { Result.success(Unit) },
            onSuccess = { succeeded = true },
            onFailure = { error -> throw error },
        )

        assertTrue(succeeded)
    }

    private fun refund(id: String): RefundRequestWithRelations = RefundRequestWithRelations(
        refundRequest = RefundRequest(
            id = id,
            eventId = "event-1",
            userId = "user-1",
            hostId = "host-1",
            reason = "Schedule conflict",
        ),
        user = null,
        event = null,
    )
}
