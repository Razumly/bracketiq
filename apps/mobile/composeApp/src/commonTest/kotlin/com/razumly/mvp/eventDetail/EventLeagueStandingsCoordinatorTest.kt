package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.LeagueDivisionStandings
import com.razumly.mvp.core.data.repositories.LeagueStandingsConfirmResult
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.LoadingState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.test.runTest
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
    fun current_and_schedule_refresh_targets_normalize_supported_divisions() {
        val coordinator = EventLeagueStandingsCoordinator()

        assertEquals(
            LeagueStandingsLoadTarget(eventId = "event-1", divisionId = "division_a"),
            coordinator.resolveCurrentLoadTarget(
                eventId = "event-1",
                divisionId = " Division A ",
            ),
        )
        assertEquals(
            LeagueStandingsLoadTarget(eventId = "event-2", divisionId = "pool_a"),
            coordinator.resolveScheduleRefreshTarget(
                event = Event(id = "event-2", eventType = EventType.TOURNAMENT, includePlayoffs = true),
                divisionId = "pool-a",
            ),
        )
        assertNull(
            coordinator.resolveScheduleRefreshTarget(
                event = Event(id = "event-3", eventType = EventType.EVENT),
                divisionId = "division-a",
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
    fun load_division_standings_updates_state_and_reports_only_requested_failures() = runTest {
        val coordinator = EventLeagueStandingsCoordinator()
        val target = LeagueStandingsLoadTarget(eventId = "event-1", divisionId = "division-a")

        val successError = coordinator.loadDivisionStandings(
            target = target,
            showLoading = true,
            reportErrors = true,
            getStandings = { eventId, divisionId ->
                assertEquals("event-1", eventId)
                assertEquals("division-a", divisionId)
                Result.success(standings("division-a"))
            },
        )

        assertNull(successError)
        assertFalse(coordinator.divisionStandingsLoading.value)
        assertEquals("division-a", coordinator.divisionStandings.value?.divisionId)

        val hiddenError = coordinator.loadDivisionStandings(
            target = target,
            showLoading = false,
            reportErrors = false,
            getStandings = { _, _ -> Result.failure(IllegalStateException("No standings")) },
        )

        assertNull(hiddenError)

        val reportedError = coordinator.loadDivisionStandings(
            target = target,
            showLoading = true,
            reportErrors = true,
            getStandings = { _, _ -> Result.failure(IllegalStateException("No standings")) },
        )

        assertEquals("No standings", reportedError?.message)
        assertFalse(coordinator.divisionStandingsLoading.value)
    }

    @Test
    fun selection_load_clears_unavailable_selection_and_loads_valid_target() = runTest {
        val coordinator = EventLeagueStandingsCoordinator()
        coordinator.applyLoadSuccess(standings("division-a"))

        coordinator.loadStandingsForSelection(
            target = null,
            showLoading = true,
            reportErrors = true,
            getStandings = { _, _ -> error("No load should run for null target.") },
        )

        assertNull(coordinator.divisionStandings.value)
        assertFalse(coordinator.divisionStandingsLoading.value)

        coordinator.loadStandingsForSelection(
            target = LeagueStandingsLoadTarget(eventId = "event-1", divisionId = "division-b"),
            showLoading = true,
            reportErrors = true,
            getStandings = { _, divisionId -> Result.success(standings(divisionId)) },
        )

        assertEquals("division-b", coordinator.divisionStandings.value?.divisionId)
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

    @Test
    fun confirm_standings_updates_state_refreshes_event_data_and_wraps_loading() = runTest {
        val coordinator = EventLeagueStandingsCoordinator()
        val loadingHandler = RecordingLoadingHandler()
        val refreshed = mutableListOf<String>()

        val message = coordinator.confirmStandings(
            target = LeagueStandingsLoadTarget(eventId = "event-1", divisionId = "division-a"),
            applyReassignment = true,
            loadingHandler = loadingHandler,
            confirmStandings = { eventId, divisionId, applyReassignment ->
                assertEquals("event-1", eventId)
                assertEquals("division-a", divisionId)
                assertTrue(applyReassignment)
                Result.success(
                    LeagueStandingsConfirmResult(
                        division = standings("division-a"),
                        applyReassignment = true,
                        seededTeamIds = listOf("team-1"),
                    ),
                )
            },
            refreshMatches = { eventId ->
                refreshed += "matches:$eventId"
                Result.success(Unit)
            },
            refreshEvent = { eventId ->
                refreshed += "event:$eventId"
                Result.success(Unit)
            },
        )

        assertEquals("Standings confirmed. Playoff assignments updated.", message.message)
        assertEquals("division-a", coordinator.divisionStandings.value?.divisionId)
        assertEquals(listOf("matches:event-1", "event:event-1"), refreshed)
        assertEquals(listOf("show:Confirming standings...", "hide"), loadingHandler.events)
        assertFalse(coordinator.standingsConfirming.value)
    }

    @Test
    fun confirm_standings_reports_failure_without_refreshing_event_data() = runTest {
        val coordinator = EventLeagueStandingsCoordinator()
        val loadingHandler = RecordingLoadingHandler()
        var refreshCalled = false

        val message = coordinator.confirmStandings(
            target = LeagueStandingsLoadTarget(eventId = "event-1", divisionId = "division-a"),
            applyReassignment = true,
            loadingHandler = loadingHandler,
            confirmStandings = { _, _, _ -> Result.failure(IllegalStateException("Cannot confirm")) },
            refreshMatches = {
                refreshCalled = true
                Result.success(Unit)
            },
            refreshEvent = {
                refreshCalled = true
                Result.success(Unit)
            },
        )

        assertEquals("Cannot confirm", message.message)
        assertFalse(refreshCalled)
        assertEquals(listOf("show:Confirming standings...", "hide"), loadingHandler.events)
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

    private class RecordingLoadingHandler : LoadingHandler {
        private val _loadingState = MutableStateFlow(LoadingState())
        override val loadingState: StateFlow<LoadingState> = _loadingState.asStateFlow()
        val events = mutableListOf<String>()

        override fun showLoading(message: String, progress: Float?) {
            events += "show:$message"
            _loadingState.value = LoadingState(isLoading = true, message = message, progress = progress)
        }

        override fun hideLoading() {
            events += "hide"
            _loadingState.value = LoadingState()
        }

        override fun updateProgress(progress: Float) {
            _loadingState.value = _loadingState.value.copy(progress = progress)
        }
    }
}
