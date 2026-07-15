package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.repositories.UserScheduleSnapshot
import com.razumly.mvp.core.data.repositories.UserScheduleNextAction
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant

class CenterNavActionResolverTest {
    private val now = Instant.parse("2026-06-16T12:00:00Z")

    @Test
    fun given_empty_schedule_when_resolving_center_action_then_create_event_is_returned() {
        val action = resolveCenterNavAction(UserScheduleSnapshot(), now)

        assertEquals(CenterNavAction.CreateEvent, action)
    }

    @Test
    fun narrow_server_match_action_maps_to_the_existing_navigation_contract() {
        val action = UserScheduleNextAction.MatchShortcut(
            eventId = "event_1",
            matchId = "match_1",
            eventName = "Event One",
            eventImageId = "image_1",
        ).toCenterNavAction()

        assertEquals(
            CenterNavAction.MatchShortcut(
                eventId = "event_1",
                matchId = "match_1",
                eventName = "Event One",
                eventImageId = "image_1",
            ),
            action,
        )
    }

    @Test
    fun given_event_starting_inside_twenty_four_hours_when_resolving_center_action_then_event_shortcut_is_returned() {
        val event = scheduleEvent(
            id = "event_1",
            start = now.plus(23.hours),
            end = now.plus(26.hours),
        )

        val action = resolveCenterNavAction(UserScheduleSnapshot(events = listOf(event)), now)

        assertEquals(
            CenterNavAction.EventShortcut(
                eventId = "event_1",
                eventName = "Event event_1",
                eventImageId = "image_event_1",
            ),
            action,
        )
    }

    @Test
    fun given_event_starting_after_twenty_four_hours_when_resolving_center_action_then_create_event_is_returned() {
        val event = scheduleEvent(
            id = "event_1",
            start = now.plus(25.hours),
            end = now.plus(27.hours),
        )

        val action = resolveCenterNavAction(UserScheduleSnapshot(events = listOf(event)), now)

        assertEquals(CenterNavAction.CreateEvent, action)
    }

    @Test
    fun given_match_inside_one_hour_when_resolving_center_action_then_match_shortcut_replaces_event_shortcut() {
        val event = scheduleEvent(
            id = "event_1",
            start = now.minus(1.hours),
            end = now.plus(6.hours),
        )
        val match = scheduleMatch(
            id = "match_1",
            eventId = event.id,
            start = now.plus(30.minutes),
            end = now.plus(90.minutes),
        )

        val action = resolveCenterNavAction(
            snapshot = UserScheduleSnapshot(events = listOf(event), matches = listOf(match)),
            now = now,
        )

        assertEquals(
            CenterNavAction.MatchShortcut(
                eventId = "event_1",
                matchId = "match_1",
                eventName = "Event event_1",
                eventImageId = "image_event_1",
            ),
            action,
        )
    }

    @Test
    fun given_started_match_without_schedule_time_when_resolving_center_action_then_match_shortcut_is_returned() {
        val event = scheduleEvent(
            id = "event_1",
            start = now.minus(1.hours),
            end = now.plus(6.hours),
        )
        val match = scheduleMatch(
            id = "match_1",
            eventId = event.id,
            status = "IN_PROGRESS",
        )

        val action = resolveCenterNavAction(
            snapshot = UserScheduleSnapshot(events = listOf(event), matches = listOf(match)),
            now = now,
        )

        assertIs<CenterNavAction.MatchShortcut>(action)
        assertEquals("match_1", action.matchId)
    }

    @Test
    fun given_started_match_with_stale_schedule_time_and_no_end_when_resolving_center_action_then_match_shortcut_is_not_used() {
        val event = scheduleEvent(
            id = "event_1",
            start = now.minus(48.hours),
            end = now.plus(6.hours),
        )
        val match = scheduleMatch(
            id = "match_1",
            eventId = event.id,
            start = now.minus(48.hours),
            status = "IN_PROGRESS",
        )

        val action = resolveCenterNavAction(
            snapshot = UserScheduleSnapshot(events = listOf(event), matches = listOf(match)),
            now = now,
        )

        assertIs<CenterNavAction.EventShortcut>(action)
        assertEquals("event_1", action.eventId)
    }

    @Test
    fun given_completed_match_when_resolving_center_action_then_event_shortcut_is_used() {
        val event = scheduleEvent(
            id = "event_1",
            start = now.minus(1.hours),
            end = now.plus(6.hours),
        )
        val match = scheduleMatch(
            id = "match_1",
            eventId = event.id,
            start = now.plus(15.minutes),
            end = now.plus(75.minutes),
            status = "COMPLETE",
            resultStatus = "FINAL",
        )

        val action = resolveCenterNavAction(
            snapshot = UserScheduleSnapshot(events = listOf(event), matches = listOf(match)),
            now = now,
        )

        assertIs<CenterNavAction.EventShortcut>(action)
        assertEquals("event_1", action.eventId)
    }

    private fun scheduleEvent(
        id: String,
        start: Instant,
        end: Instant,
    ): Event =
        Event(
            id = id,
            name = "Event $id",
            start = start,
            end = end,
            imageId = "image_$id",
        )

    private fun scheduleMatch(
        id: String,
        eventId: String,
        start: Instant? = null,
        end: Instant? = null,
        status: String? = null,
        resultStatus: String? = null,
    ): MatchMVP =
        MatchMVP(
            id = id,
            matchId = id.substringAfter('_').toIntOrNull() ?: 1,
            eventId = eventId,
            start = start,
            end = end,
            status = status,
            resultStatus = resultStatus,
        )
}
