package com.razumly.mvp.core.util

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LoadingHandlerTest {

    @Test
    fun repeated_show_from_one_operation_updates_without_acquiring_another_slot() {
        val handler = LoadingHandlerImpl()
        val operation = handler.newOperation()

        operation.showLoading("Preparing...", progress = 0.1f)
        operation.showLoading("Waiting...", progress = 0.6f)

        assertTrue(handler.loadingState.value.isLoading)
        assertEquals(1, handler.loadingState.value.activeOperationCount)
        assertEquals("Waiting...", handler.loadingState.value.message)
        assertEquals(0.6f, handler.loadingState.value.progress)

        operation.hideLoading()

        assertFalse(handler.loadingState.value.isLoading)
        assertEquals(0, handler.loadingState.value.activeOperationCount)
    }

    @Test
    fun completing_one_owner_does_not_clear_an_overlapping_owner() {
        val handler = LoadingHandlerImpl()
        val first = handler.newOperation()
        val second = handler.newOperation()

        first.showLoading("First")
        second.showLoading("Second")
        first.hideLoading()

        assertTrue(handler.loadingState.value.isLoading)
        assertEquals(1, handler.loadingState.value.activeOperationCount)
        assertEquals("Second", handler.loadingState.value.message)

        second.hideLoading()

        assertFalse(handler.loadingState.value.isLoading)
    }

    @Test
    fun oldest_owner_remains_visible_then_reveals_latest_state_of_next_owner() {
        val handler = LoadingHandlerImpl()
        val first = handler.newOperation()
        val second = handler.newOperation()

        first.showLoading("First", progress = 0.25f)
        second.showLoading("Second")
        second.showLoading("Second updated", progress = 0.75f)

        assertEquals("First", handler.loadingState.value.message)
        assertEquals(0.25f, handler.loadingState.value.progress)
        assertEquals(2, handler.loadingState.value.activeOperationCount)

        first.hideLoading()

        assertEquals("Second updated", handler.loadingState.value.message)
        assertEquals(0.75f, handler.loadingState.value.progress)
        assertEquals(1, handler.loadingState.value.activeOperationCount)
    }

    @Test
    fun completion_is_idempotent_and_terminal_for_late_callbacks() {
        val handler = LoadingHandlerImpl()
        val operation = handler.newOperation()

        operation.updateProgress(0.1f)
        assertFalse(handler.loadingState.value.isLoading)

        operation.showLoading("Working")
        operation.updateProgress(0.5f)
        assertEquals(0.5f, handler.loadingState.value.progress)

        operation.hideLoading()
        operation.hideLoading()
        operation.showLoading("Late")
        operation.updateProgress(0.9f)

        assertFalse(handler.loadingState.value.isLoading)
        assertEquals(0, handler.loadingState.value.activeOperationCount)
        assertEquals("Loading...", handler.loadingState.value.message)
        assertNull(handler.loadingState.value.progress)
    }

    @Test
    fun completion_during_pending_show_cannot_resurrect_the_operation() {
        lateinit var operation: LoadingOperation
        var hookCalls = 0
        val handler = LoadingHandlerImpl.withTestHooks(
            LoadingHandlerTestHooks(
                beforeShowStateCommit = {
                    hookCalls += 1
                    operation.hideLoading()
                },
            ),
        )
        operation = handler.newOperation()

        operation.showLoading("Working")

        assertEquals(1, hookCalls)
        assertFalse(handler.loadingState.value.isLoading)
        assertEquals(0, handler.loadingState.value.activeOperationCount)
    }

    @Test
    fun completion_during_pending_progress_update_cannot_restore_the_operation() {
        lateinit var operation: LoadingOperation
        var hookCalls = 0
        val handler = LoadingHandlerImpl.withTestHooks(
            LoadingHandlerTestHooks(
                beforeProgressStateCommit = {
                    hookCalls += 1
                    operation.hideLoading()
                },
            ),
        )
        operation = handler.newOperation()
        operation.showLoading("Working", progress = 0.1f)

        operation.updateProgress(0.9f)

        assertEquals(1, hookCalls)
        assertFalse(handler.loadingState.value.isLoading)
        assertEquals(0, handler.loadingState.value.activeOperationCount)
    }

    @Test
    fun finishing_all_keyed_operations_clears_every_owned_slot_and_reference() {
        val handler = LoadingHandlerImpl()
        val first = handler.newOperation().also { it.showLoading("First") }
        val second = handler.newOperation().also { it.showLoading("Second") }
        val ownedOperations = mutableMapOf(
            "first" to first,
            "second" to second,
        )

        ownedOperations.finishAllLoadingOperations()
        ownedOperations.finishAllLoadingOperations()

        assertTrue(ownedOperations.isEmpty())
        assertFalse(handler.loadingState.value.isLoading)
        assertEquals(0, handler.loadingState.value.activeOperationCount)
    }
}
