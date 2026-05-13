package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.buildEventDivisionId
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventDetailsValidationTest {

    @Test
    fun given_single_division_team_event_when_max_teams_blank_then_validation_fails() {
        val result = validateEvent(baseLeagueEvent(maxParticipants = 0))

        assertFalse(result.isMaxParticipantsValid)
        assertFalse(result.isValid)
        assertTrue("Max teams must be at least 2." in result.validationErrors)
    }

    @Test
    fun given_single_division_team_event_when_max_teams_set_then_validation_passes() {
        val result = validateEvent(baseLeagueEvent(maxParticipants = 2))

        assertTrue(result.isMaxParticipantsValid)
        assertTrue(result.isValid)
        assertFalse(result.validationErrors.any { error -> error.contains("Max teams") })
    }

    @Test
    fun given_split_division_team_event_when_division_max_teams_missing_then_validation_fails() {
        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 0).copy(
                singleDivision = false,
                divisions = listOf("open"),
            ),
            divisionDetailsForSettings = listOf(DivisionDetail(id = "open", maxParticipants = null)),
        )

        assertFalse(result.isMaxParticipantsValid)
        assertFalse(result.isValid)
        assertTrue("Each division must have max teams of at least 2." in result.validationErrors)
    }

    @Test
    fun given_split_division_team_event_when_divisions_have_same_identity_then_validation_fails() {
        val firstId = buildEventDivisionId("event-1", "m_skill_open_age_u18")
        val secondId = buildEventDivisionId("event-1_2", "m_skill_open_age_u18")
        val first = DivisionDetail(
            id = firstId,
            key = "m_skill_open_age_u18",
            name = "Men's Open U18",
            gender = "M",
            skillDivisionTypeId = "open",
            ageDivisionTypeId = "u18",
            maxParticipants = 8,
        )
        val second = DivisionDetail(
            id = secondId,
            key = "m_skill_open_age_u18",
            name = "Renamed U18",
            gender = "M",
            skillDivisionTypeId = "open",
            ageDivisionTypeId = "u18",
            maxParticipants = 8,
        )

        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 0).copy(
                id = "event-1",
                singleDivision = false,
                divisions = listOf(firstId, secondId),
                divisionDetails = listOf(first, second),
            ),
            divisionDetailsForSettings = listOf(first, second),
        )

        assertFalse(result.isDivisionIdentityValid)
        assertFalse(result.isValid)
        assertTrue(
            "Each division must have a unique gender, skill division, and age division." in result.validationErrors,
        )
    }

    @Test
    fun given_timed_league_when_match_duration_is_one_minute_then_validation_passes_duration() {
        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 2).copy(matchDurationMinutes = 1),
        )

        assertTrue(result.isLeagueDurationValid)
        assertTrue(result.isValid)
    }

    @Test
    fun given_timed_league_when_match_duration_is_empty_then_validation_warns_for_one_minute_minimum() {
        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 2).copy(matchDurationMinutes = null),
        )

        assertFalse(result.isLeagueDurationValid)
        assertFalse(result.isValid)
        assertTrue("Match duration must be at least 1 minute." in result.validationErrors)
    }

    private fun validateEvent(
        event: Event,
        divisionDetailsForSettings: List<DivisionDetail> = emptyList(),
    ): EventValidationResult {
        return computeEventValidationResult(
            editEvent = event,
            isNewEvent = false,
            fieldCount = 0,
            leagueTimeSlots = emptyList(),
            leagueSlotErrors = emptyMap(),
            slotEditorEnabled = false,
            divisionDetailsForSettings = divisionDetailsForSettings,
            isColorLoaded = true,
            scheduleTimeLocked = true,
        )
    }

    private fun baseLeagueEvent(maxParticipants: Int): Event {
        return Event(
            name = "Spring League",
            eventType = EventType.LEAGUE,
            teamSignup = true,
            singleDivision = true,
            maxParticipants = maxParticipants,
            location = "Main Courts",
            coordinates = listOf(-122.0, 37.0),
            imageId = "image-1",
            matchDurationMinutes = 15,
        )
    }
}
