package com.razumly.mvp.core.util

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PopupHandlerTest {
    @Test
    fun given_job_cancellation_message_when_showing_popup_then_snackbar_state_stays_empty() {
        val popupHandler = PopupHandlerImpl()

        popupHandler.showPopup("Failed to fetch events: Job was cancelled")

        assertNull(popupHandler.errorState.value)
    }

    @Test
    fun given_task_cancellation_error_when_showing_popup_then_snackbar_state_stays_empty() {
        val popupHandler = PopupHandlerImpl()

        popupHandler.showPopup(ErrorMessage("Task was cancelled."))

        assertNull(popupHandler.errorState.value)
    }

    @Test
    fun given_request_cancellation_message_when_classifying_then_it_is_cancellation_error() {
        assertTrue("Client request was canceled during navigation".isCancellationErrorMessage())
    }

    @Test
    fun given_network_error_when_showing_popup_then_snackbar_state_is_set() {
        val popupHandler = PopupHandlerImpl()

        popupHandler.showPopup("Failed to fetch events: Network request failed")

        assertEquals(
            "Failed to fetch events: Network request failed",
            popupHandler.errorState.value?.message,
        )
    }

    @Test
    fun given_intentional_payment_cancel_message_when_showing_popup_then_snackbar_state_is_set() {
        val popupHandler = PopupHandlerImpl()

        popupHandler.showPopup("Payment canceled.")

        assertEquals("Payment canceled.", popupHandler.errorState.value?.message)
    }
}
