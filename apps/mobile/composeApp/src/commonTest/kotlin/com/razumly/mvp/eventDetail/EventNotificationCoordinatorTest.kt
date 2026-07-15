package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class EventNotificationCoordinatorTest {
    @Test
    fun send_event_notification_routes_every_event_type_with_the_exact_payload() = runTest {
        val calls = mutableListOf<NotificationCall>()
        val coordinator = EventNotificationCoordinator { eventId, title, body, isTournament ->
            calls += NotificationCall(eventId, title, body, isTournament)
            Result.success(Unit)
        }
        val scenarios = listOf(
            EventRoutingScenario(EventType.TOURNAMENT, isTournament = true),
            EventRoutingScenario(EventType.LEAGUE, isTournament = false),
            EventRoutingScenario(EventType.EVENT, isTournament = false),
            EventRoutingScenario(EventType.WEEKLY_EVENT, isTournament = false),
        )

        scenarios.forEachIndexed { index, scenario ->
            val result = coordinator.sendEventNotification(
                eventId = "event-$index",
                eventType = scenario.eventType,
                title = "Schedule update $index",
                message = "Court changed $index.",
            )

            assertTrue(result.isSuccess)
        }
        assertEquals(
            scenarios.mapIndexed { index, scenario ->
                NotificationCall(
                    eventId = "event-$index",
                    title = "Schedule update $index",
                    body = "Court changed $index.",
                    isTournament = scenario.isTournament,
                )
            },
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

    private data class EventRoutingScenario(
        val eventType: EventType,
        val isTournament: Boolean,
    )
}
