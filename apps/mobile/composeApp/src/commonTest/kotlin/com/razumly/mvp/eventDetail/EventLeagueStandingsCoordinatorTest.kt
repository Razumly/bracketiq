package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.LeagueDivisionStandings
import com.razumly.mvp.core.data.repositories.LeagueStandingsConfirmResult
import com.razumly.mvp.core.data.repositories.LeagueStandingsPointUpdate
import com.razumly.mvp.core.data.repositories.LeagueStandingsRow
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.LoadingHandlerImpl
import com.razumly.mvp.core.util.LoadingOperation
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
    fun point_editing_increments_one_team_and_saves_absolute_points() = runTest {
        val coordinator = EventLeagueStandingsCoordinator()
        coordinator.applyLoadSuccess(standingsWithRows("division-a"))

        assertTrue(coordinator.beginPointsEditing())
        assertTrue(coordinator.adjustDraftPoints("team-1", 1.0))
        assertEquals(4.0, coordinator.draftPoints.value["team-1"])
        assertEquals(1.0, coordinator.draftPoints.value["team-2"])

        var submittedUpdates = emptyList<LeagueStandingsPointUpdate>()
        val message = coordinator.savePointsEdits(
            target = LeagueStandingsLoadTarget("event-1", "division-a"),
            updateStandings = { eventId, divisionId, updates ->
                assertEquals("event-1", eventId)
                assertEquals("division-a", divisionId)
                submittedUpdates = updates
                Result.success(
                    standingsWithRows("division-a").copy(
                        rows = standingsWithRows("division-a").rows.map { row ->
                            if (row.teamId == "team-1") {
                                row.copy(finalPoints = 4.0, pointsDelta = 1.0)
                            } else {
                                row
                            }
                        },
                    ),
                )
            },
        )

        assertEquals(
            listOf(LeagueStandingsPointUpdate(teamId = "team-1", points = 4.0)),
            submittedUpdates,
        )
        assertEquals("Standings adjustments saved.", message.message)
        assertEquals(4.0, coordinator.divisionStandings.value?.rows?.first()?.finalPoints)
        assertFalse(coordinator.isEditingPoints.value)
        assertTrue(coordinator.draftPoints.value.isEmpty())
        assertFalse(coordinator.pointsSaving.value)
    }

    @Test
    fun point_editing_clears_an_override_at_base_and_preserves_draft_after_failure() = runTest {
        val coordinator = EventLeagueStandingsCoordinator()
        coordinator.applyLoadSuccess(
            standingsWithRows("division-a").copy(
                rows = standingsWithRows("division-a").rows.map { row ->
                    if (row.teamId == "team-1") {
                        row.copy(finalPoints = 4.0, pointsDelta = 1.0)
                    } else {
                        row
                    }
                },
            ),
        )
        coordinator.beginPointsEditing()
        coordinator.adjustDraftPoints("team-1", -1.0)

        var submittedUpdates = emptyList<LeagueStandingsPointUpdate>()
        val message = coordinator.savePointsEdits(
            target = LeagueStandingsLoadTarget("event-1", "division-a"),
            updateStandings = { _, _, updates ->
                submittedUpdates = updates
                Result.failure(IllegalStateException("Save failed"))
            },
        )

        assertEquals(
            listOf(LeagueStandingsPointUpdate(teamId = "team-1", points = null)),
            submittedUpdates,
        )
        assertEquals("Save failed", message.message)
        assertTrue(coordinator.isEditingPoints.value)
        assertEquals(3.0, coordinator.draftPoints.value["team-1"])
        assertFalse(coordinator.pointsSaving.value)

        coordinator.cancelPointsEditing()
        assertFalse(coordinator.isEditingPoints.value)
        assertTrue(coordinator.draftPoints.value.isEmpty())
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

    private fun standingsWithRows(divisionId: String): LeagueDivisionStandings =
        LeagueDivisionStandings(
            divisionId = divisionId,
            divisionName = divisionId,
            standingsConfirmedAt = null,
            standingsConfirmedBy = null,
            rows = listOf(
                LeagueStandingsRow(
                    position = 1,
                    teamId = "team-1",
                    teamName = "Team One",
                    wins = 1,
                    losses = 0,
                    draws = 0,
                    goalsFor = 3,
                    goalsAgainst = 1,
                    goalDifference = 2,
                    matchesPlayed = 1,
                    basePoints = 3.0,
                    finalPoints = 3.0,
                    pointsDelta = 0.0,
                ),
                LeagueStandingsRow(
                    position = 2,
                    teamId = "team-2",
                    teamName = "Team Two",
                    wins = 0,
                    losses = 1,
                    draws = 0,
                    goalsFor = 1,
                    goalsAgainst = 3,
                    goalDifference = -2,
                    matchesPlayed = 1,
                    basePoints = 1.0,
                    finalPoints = 1.0,
                    pointsDelta = 0.0,
                ),
            ),
        )

    private class RecordingLoadingHandler : LoadingHandler {
        private val delegate = LoadingHandlerImpl()
        override val loadingState = delegate.loadingState
        val events = mutableListOf<String>()

        override fun newOperation(): LoadingOperation {
            val operation = delegate.newOperation()
            return object : LoadingOperation {
                override fun showLoading(message: String, progress: Float?) {
                    events += "show:$message"
                    operation.showLoading(message, progress)
                }

                override fun hideLoading() {
                    events += "hide"
                    operation.hideLoading()
                }

                override fun updateProgress(progress: Float) {
                    operation.updateProgress(progress)
                }
            }
        }
    }
}
