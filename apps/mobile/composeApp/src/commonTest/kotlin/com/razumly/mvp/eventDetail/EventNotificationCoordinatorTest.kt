package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class EventNotificationCoordinatorTest {
    @Test
    fun send_event_notification_passes_event_payload_and_event_topic_for_league() = runTest {
        val calls = mutableListOf<NotificationCall>()
        val coordinator = EventNotificationCoordinator { eventId, title, body, isTournament ->
            calls += NotificationCall(eventId, title, body, isTournament)
            Result.success(Unit)
        }

        val result = coordinator.sendEventNotification(
            eventId = "event-1",
            eventType = EventType.LEAGUE,
            title = "Schedule update",
            message = "Court changed.",
        )

        assertTrue(result.isSuccess)
        assertEquals(
            listOf(NotificationCall("event-1", "Schedule update", "Court changed.", false)),
            calls,
        )
    }

    @Test
    fun send_event_notification_returns_error_message_on_failure() = runTest {
        val coordinator = EventNotificationCoordinator { _, _, _, _ ->
            Result.failure(IllegalStateException("No token"))
        }

        val result = coordinator.sendEventNotification(
            eventId = "event-1",
            eventType = EventType.TOURNAMENT,
            title = "Schedule update",
            message = "Court changed.",
        )

        assertEquals("Failed to send message: No token", result.exceptionOrNull()?.message)
    }

    private data class NotificationCall(
        val eventId: String,
        val title: String,
        val body: String,
        val isTournament: Boolean,
    )
}
