package com.razumly.mvp.eventDetail

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class EventNotificationCoordinatorTest {
    @Test
    fun send_event_notification_passes_event_payload_and_tournament_flag() = runTest {
        val calls = mutableListOf<NotificationCall>()
        val coordinator = EventNotificationCoordinator { eventId, title, body, isTournament ->
            calls += NotificationCall(eventId, title, body, isTournament)
            Result.success(Unit)
        }

        val error = coordinator.sendEventNotification(
            eventId = "event-1",
            title = "Schedule update",
            message = "Court changed.",
        )

        assertNull(error)
        assertEquals(
            listOf(NotificationCall("event-1", "Schedule update", "Court changed.", true)),
            calls,
        )
    }

    @Test
    fun send_event_notification_returns_error_message_on_failure() = runTest {
        val coordinator = EventNotificationCoordinator { _, _, _, _ ->
            Result.failure(IllegalStateException("No token"))
        }

        val error = coordinator.sendEventNotification(
            eventId = "event-1",
            title = "Schedule update",
            message = "Court changed.",
        )

        assertEquals("Failed to send message: No token", error?.message)
    }

    private data class NotificationCall(
        val eventId: String,
        val title: String,
        val body: String,
        val isTournament: Boolean,
    )
}
