package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class EventDivisionContentCoordinatorTest {
    @Test
    fun select_division_normalizes_id_and_filters_linked_matches_for_multi_division_event() {
        val coordinator = EventDivisionContentCoordinator()
        val selectedEvent = event(singleDivision = false)
        val left = match(id = "left", division = "division-a")
        val target = match(
            id = "target",
            division = "division-a",
            previousLeftMatch = left.match,
        )
        val otherDivision = match(
            id = "other",
            division = "division-b",
            previousLeftMatch = left.match,
        )
        val unlinked = match(id = "unlinked", division = "division-a")
        val team = teamWithPlayers("team-1")

        coordinator.selectDivision(
            division = "Division A",
            selectedEvent = selectedEvent,
            relations = EventWithFullRelations(
                event = selectedEvent,
                players = emptyList(),
                matches = listOf(target, otherDivision, unlinked),
                teams = listOf(team),
            ),
        )

        assertEquals("division_a", coordinator.selectedDivision.value)
        assertEquals(setOf("target"), coordinator.divisionMatches.value.keys)
        assertEquals(setOf("team-1"), coordinator.divisionTeams.value.keys)
    }

    @Test
    fun refresh_content_keeps_all_linked_matches_for_single_division_event() {
        val coordinator = EventDivisionContentCoordinator()
        val selectedEvent = event(singleDivision = true)
        val linked = match(
            id = "linked",
            division = "division-a",
            winnerNextMatch = MatchMVP(matchId = 2, eventId = "event-1", id = "next"),
        )
        val unlinked = match(id = "unlinked", division = "division-b")

        coordinator.restoreSelectedDivision("division-b")
        coordinator.refreshSelectedDivisionContent(
            selectedEvent = selectedEvent,
            relations = EventWithFullRelations(
                event = selectedEvent,
                players = emptyList(),
                matches = listOf(linked, unlinked),
                teams = emptyList(),
            ),
        )

        assertEquals(setOf("linked"), coordinator.divisionMatches.value.keys)
    }

    @Test
    fun restore_selected_division_normalizes_blank_to_null() {
        val coordinator = EventDivisionContentCoordinator()

        coordinator.restoreSelectedDivision(" Division A ")
        assertEquals("division_a", coordinator.currentSelectedDivision())

        coordinator.restoreSelectedDivision(" ")
        assertNull(coordinator.currentSelectedDivision())
    }

    private fun event(singleDivision: Boolean): Event {
        return Event(
            id = "event-1",
            name = "Event",
            eventType = EventType.LEAGUE,
            singleDivision = singleDivision,
            divisions = listOf("division-a", "division-b"),
        )
    }

    private fun match(
        id: String,
        division: String,
        previousLeftMatch: MatchMVP? = null,
        winnerNextMatch: MatchMVP? = null,
    ): MatchWithRelations {
        return MatchWithRelations(
            match = MatchMVP(
                matchId = id.hashCode(),
                eventId = "event-1",
                division = division,
                id = id,
            ),
            field = null,
            team1 = null,
            team2 = null,
            teamOfficial = null,
            winnerNextMatch = winnerNextMatch,
            loserNextMatch = null,
            previousLeftMatch = previousLeftMatch,
            previousRightMatch = null,
        )
    }

    private fun teamWithPlayers(id: String): TeamWithPlayers {
        return TeamWithPlayers(
            team = Team(
                division = "open",
                name = "Team",
                captainId = "captain-1",
                teamSize = 2,
                id = id,
            ),
            captain = null,
            players = emptyList(),
            pendingPlayers = emptyList(),
        )
    }
}
