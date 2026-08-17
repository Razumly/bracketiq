package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant

class EventOccurrenceRulesTest {
    private val now = Instant.parse("2026-06-23T12:00:00Z")

    @Test
    fun weekly_parent_requires_weekly_event_with_timeslot() {
        assertTrue(
            isWeeklyParentEvent(
                Event(
                    eventType = EventType.WEEKLY_EVENT,
                    timeSlotIds = listOf(" slot-1 "),
                ),
            ),
        )
        assertFalse(
            isWeeklyParentEvent(
                Event(
                    eventType = EventType.WEEKLY_EVENT,
                    timeSlotIds = listOf("", " "),
                ),
            ),
        )
        assertFalse(
            isWeeklyParentEvent(
                Event(
                    eventType = EventType.EVENT,
                    timeSlotIds = listOf("slot-1"),
                ),
            ),
        )
    }

    @Test
    fun started_state_uses_event_start_for_non_weekly_and_selected_occurrence_for_weekly_parent() {
        val startedEvent = Event(start = Instant.parse("2026-06-23T11:00:00Z"))
        val futureEvent = Event(start = Instant.parse("2026-06-23T13:00:00Z"))
        val weeklyParent = Event(
            eventType = EventType.WEEKLY_EVENT,
            timeSlotIds = listOf("slot-1"),
            start = Instant.parse("2026-06-23T11:00:00Z"),
        )

        assertTrue(hasEventStarted(startedEvent, now))
        assertFalse(hasEventStarted(futureEvent, now))
        assertTrue(
            hasSelectedEventOrOccurrenceStarted(
                event = startedEvent,
                selectedWeeklyOccurrenceStarted = false,
                now = now,
            ),
        )
        assertFalse(
            hasSelectedEventOrOccurrenceStarted(
                event = weeklyParent,
                selectedWeeklyOccurrenceStarted = false,
                now = now,
            ),
        )
        assertTrue(
            hasSelectedEventOrOccurrenceStarted(
                event = weeklyParent,
                selectedWeeklyOccurrenceStarted = true,
                now = now,
            ),
        )
    }

    @Test
    fun join_blocking_keeps_started_weekly_parents_open_until_selected_occurrence_started() {
        val startedEvent = Event(
            eventType = EventType.EVENT,
            start = Instant.parse("2026-06-23T11:00:00Z"),
        )
        val weeklyParent = Event(
            eventType = EventType.WEEKLY_EVENT,
            timeSlotIds = listOf("slot-1"),
            start = Instant.parse("2026-06-23T11:00:00Z"),
        )
        val weeklyEventWithoutParentSlot = Event(
            eventType = EventType.WEEKLY_EVENT,
            start = Instant.parse("2026-06-23T11:00:00Z"),
        )

        assertTrue(
            isJoinBlockedByStart(
                event = startedEvent,
                selectedWeeklyOccurrenceStarted = false,
                now = now,
            ),
        )
        assertFalse(
            isJoinBlockedByStart(
                event = weeklyParent,
                selectedWeeklyOccurrenceStarted = false,
                now = now,
            ),
        )
        assertTrue(
            isJoinBlockedByStart(
                event = weeklyParent,
                selectedWeeklyOccurrenceStarted = true,
                now = now,
            ),
        )
        assertFalse(
            isJoinBlockedByStart(
                event = weeklyEventWithoutParentSlot,
                selectedWeeklyOccurrenceStarted = true,
                now = now,
            ),
        )
    }

    @Test
    fun participant_management_room_target_requires_event_id_and_weekly_occurrence_selection() {
        assertNull(
            participantManagementRoomTarget(
                event = Event(id = " "),
                occurrence = null,
            ),
        )
        assertNull(
            participantManagementRoomTarget(
                event = Event(
                    id = "event-1",
                    eventType = EventType.WEEKLY_EVENT,
                    timeSlotIds = listOf("slot-1"),
                ),
                occurrence = null,
            ),
        )

        assertEquals(
            ParticipantManagementRoomTarget(
                eventId = "event-1",
                slotId = null,
                occurrenceDate = null,
                teamSignup = false,
            ),
            participantManagementRoomTarget(
                event = Event(id = " event-1 ", teamSignup = false),
                occurrence = null,
            ),
        )
        assertEquals(
            ParticipantManagementRoomTarget(
                eventId = "event-1",
                slotId = "slot-1",
                occurrenceDate = "2026-06-23",
                teamSignup = true,
            ),
            participantManagementRoomTarget(
                event = Event(
                    id = " event-1 ",
                    eventType = EventType.WEEKLY_EVENT,
                    timeSlotIds = listOf("slot-1"),
                    teamSignup = true,
                ),
                occurrence = EventOccurrenceSelection(
                    slotId = " slot-1 ",
                    occurrenceDate = " 2026-06-23 ",
                    label = "Tuesday",
                ),
            ),
        )
    }
}
