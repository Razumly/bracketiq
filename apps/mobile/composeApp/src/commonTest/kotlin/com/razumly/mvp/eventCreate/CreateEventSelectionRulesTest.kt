package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class CreateEventSelectionRulesTest {

    @Test
    fun league_selection_enforces_team_single_division_and_open_ended_flag() {
        val start = Instant.fromEpochMilliseconds(1_000L)
        val end = Instant.fromEpochMilliseconds(2_000L)
        val draft = Event(
            eventType = EventType.LEAGUE,
            teamSignup = false,
            singleDivision = false,
            noFixedEndDateTime = true,
            start = start,
            end = end,
        )

        val updated = draft.applyCreateSelectionRules(isRentalFlow = false)

        assertEquals(EventType.LEAGUE, updated.eventType)
        assertTrue(updated.teamSignup)
        assertTrue(updated.singleDivision)
        assertTrue(updated.noFixedEndDateTime)
        assertEquals(end, updated.end)
    }

    @Test
    fun tournament_selection_enforces_team_single_division_and_open_ended_flag() {
        val start = Instant.fromEpochMilliseconds(5_000L)
        val end = Instant.fromEpochMilliseconds(8_000L)
        val draft = Event(
            eventType = EventType.TOURNAMENT,
            teamSignup = false,
            singleDivision = false,
            noFixedEndDateTime = true,
            start = start,
            end = end,
        )

        val updated = draft.applyCreateSelectionRules(isRentalFlow = false)

        assertEquals(EventType.TOURNAMENT, updated.eventType)
        assertTrue(updated.teamSignup)
        assertTrue(updated.singleDivision)
        assertTrue(updated.noFixedEndDateTime)
        assertEquals(end, updated.end)
    }

    @Test
    fun event_selection_preserves_event_specific_flags() {
        val start = Instant.fromEpochMilliseconds(10_000L)
        val end = Instant.fromEpochMilliseconds(12_000L)
        val draft = Event(
            eventType = EventType.EVENT,
            teamSignup = false,
            singleDivision = false,
            start = start,
            end = end,
        )

        val updated = draft.applyCreateSelectionRules(isRentalFlow = false)

        assertEquals(EventType.EVENT, updated.eventType)
        assertFalse(updated.teamSignup)
        assertFalse(updated.singleDivision)
        assertFalse(updated.noFixedEndDateTime)
        assertEquals(end, updated.end)
    }

    @Test
    fun rental_flow_forces_event_type() {
        val draft = Event(eventType = EventType.LEAGUE)

        val updated = draft.applyCreateSelectionRules(isRentalFlow = true)

        assertEquals(EventType.EVENT, updated.eventType)
    }

    @Test
    fun rental_flow_forces_event_type_but_does_not_apply_team_signup_defaults() {
        val start = Instant.fromEpochMilliseconds(15_000L)
        val end = Instant.fromEpochMilliseconds(20_000L)
        val draft = Event(
            eventType = EventType.TOURNAMENT,
            teamSignup = false,
            singleDivision = false,
            start = start,
            end = end,
        )

        val updated = draft.applyCreateSelectionRules(isRentalFlow = true)

        assertEquals(EventType.EVENT, updated.eventType)
        assertFalse(updated.teamSignup)
        assertFalse(updated.singleDivision)
        assertFalse(updated.noFixedEndDateTime)
        assertEquals(end, updated.end)
    }
}
