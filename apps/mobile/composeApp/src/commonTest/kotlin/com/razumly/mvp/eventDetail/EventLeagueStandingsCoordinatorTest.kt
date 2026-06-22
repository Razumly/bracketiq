package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.LeagueDivisionStandings
import com.razumly.mvp.core.data.repositories.LeagueStandingsConfirmResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EventLeagueStandingsCoordinatorTest {
    @Test
    fun load_target_requires_standings_event_and_non_playoff_division() {
        val coordinator = EventLeagueStandingsCoordinator()

        assertEquals(
            LeagueStandingsLoadTarget(
                eventId = "event-1",
                divisionId = "division_a",
            ),
            coordinator.resolveLoadTarget(
                event = Event(id = "event-1", eventType = EventType.LEAGUE),
                selectedDivisionId = " Division A ",
                isPlayoffPlacementDivision = { false },
            ),
        )
        assertEquals(
            LeagueStandingsLoadTarget(
                eventId = "event-2",
                divisionId = "pool_a",
            ),
            coordinator.resolveLoadTarget(
                event = Event(id = "event-2", eventType = EventType.TOURNAMENT, includePlayoffs = true),
                selectedDivisionId = "pool-a",
                isPlayoffPlacementDivision = { false },
            ),
        )
        assertNull(
            coordinator.resolveLoadTarget(
                event = Event(id = "event-3", eventType = EventType.EVENT),
                selectedDivisionId = "division-a",
                isPlayoffPlacementDivision = { false },
            ),
        )
        assertNull(
            coordinator.resolveLoadTarget(
                event = Event(id = "event-4", eventType = EventType.LEAGUE),
                selectedDivisionId = "playoff",
                isPlayoffPlacementDivision = { it == "playoff" },
            ),
        )
    }

    @Test
    fun current_division_prefers_loaded_standings_before_selected_division() {
        val coordinator = EventLeagueStandingsCoordinator()

        assertEquals(
            "selected_a",
            coordinator.resolveCurrentDivisionId(
                selectedDivisionId = "selected-a",
                isSelectedDivisionEligible = { true },
            ),
        )
        assertNull(
            coordinator.resolveCurrentDivisionId(
                selectedDivisionId = "playoff",
                isSelectedDivisionEligible = { false },
            ),
        )

        coordinator.applyLoadSuccess(standings(" loaded-a "))

        assertEquals(
            "loaded_a",
            coordinator.resolveCurrentDivisionId(
                selectedDivisionId = "selected-a",
                isSelectedDivisionEligible = { true },
            ),
        )
    }

    @Test
    fun load_state_preserves_hidden_refresh_and_clears_unavailable_selection() {
        val coordinator = EventLeagueStandingsCoordinator()
        coordinator.applyLoadSuccess(standings("division-a"))

        coordinator.beginLoad(showLoading = false)
        assertFalse(coordinator.divisionStandingsLoading.value)
        coordinator.finishLoad(showLoading = false)
        assertFalse(coordinator.divisionStandingsLoading.value)

        coordinator.clearStandingsForSelectionLoad()
        assertNull(coordinator.divisionStandings.value)
        coordinator.beginLoad(showLoading = true)
        assertTrue(coordinator.divisionStandingsLoading.value)
        coordinator.applyLoadSuccess(standings("division-b"))
        coordinator.finishLoad(showLoading = true)

        assertFalse(coordinator.divisionStandingsLoading.value)
        assertEquals("division-b", coordinator.divisionStandings.value?.divisionId)

        coordinator.clearUnavailableSelection()
        assertNull(coordinator.divisionStandings.value)
        assertFalse(coordinator.divisionStandingsLoading.value)
    }

    @Test
    fun confirm_success_updates_standings_and_preserves_messages() {
        val coordinator = EventLeagueStandingsCoordinator()

        coordinator.beginConfirming()
        assertTrue(coordinator.standingsConfirming.value)

        val reassignedMessage = coordinator.applyConfirmSuccess(
            LeagueStandingsConfirmResult(
                division = standings("division-a"),
                applyReassignment = true,
                seededTeamIds = listOf("team-1"),
            ),
        )
        assertEquals("Standings confirmed. Playoff assignments updated.", reassignedMessage)
        assertEquals("division-a", coordinator.divisionStandings.value?.divisionId)

        val simpleMessage = coordinator.applyConfirmSuccess(
            LeagueStandingsConfirmResult(
                division = standings("division-b"),
                applyReassignment = true,
                seededTeamIds = emptyList(),
            ),
        )
        assertEquals("Standings confirmed.", simpleMessage)

        coordinator.finishConfirming()
        assertFalse(coordinator.standingsConfirming.value)
    }

    private fun standings(divisionId: String): LeagueDivisionStandings =
        LeagueDivisionStandings(
            divisionId = divisionId,
            divisionName = divisionId,
            standingsConfirmedAt = null,
            standingsConfirmedBy = null,
            rows = emptyList(),
        )
}
