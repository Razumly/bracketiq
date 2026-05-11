package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
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
