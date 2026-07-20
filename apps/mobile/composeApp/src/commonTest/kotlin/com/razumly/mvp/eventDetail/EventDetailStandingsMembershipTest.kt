package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals

class EventDetailStandingsMembershipTest {
    @Test
    fun league_standings_keep_division_teams_when_there_are_no_matches() {
        val divisionId = "division_open"
        val teams = listOf(
            team("team_1", "Team One", divisionId),
            team("team_2", "Team Two", divisionId),
        )
        val presentation = buildEventDetailDivisionPresentation(
            selectedEvent = EventWithFullRelations(
                event = Event(
                    id = "league_1",
                    eventType = EventType.LEAGUE,
                    singleDivision = false,
                    divisions = listOf(divisionId),
                    divisionDetails = listOf(
                        DivisionDetail(
                            id = divisionId,
                            name = "Open",
                            teamIds = teams.map { it.team.id },
                        ),
                    ),
                ),
                players = emptyList(),
                matches = emptyList(),
                teams = teams,
            ),
            selectedDivision = divisionId,
            selectedStandingsPoolDivisionId = null,
            tournamentPoolPlayEnabled = false,
            showStandingsDrawColumn = true,
            leagueDivisionStandings = null,
        )

        assertEquals(listOf("team_1", "team_2"), presentation.leagueStandings.map { it.teamId })
        presentation.leagueStandings.forEach { standing ->
            assertEquals(0, standing.matchesPlayed)
            assertEquals(0.0, standing.finalPoints)
        }
    }

    @Test
    fun tournament_pool_without_membership_or_matches_uses_parent_tournament_division_teams() {
        val bracketId = "bracket_open"
        val poolId = "pool_open_a"
        val teams = listOf(
            team("team_1", "Team One", bracketId),
            team("team_2", "Team Two", bracketId),
            team("team_3", "Elite Team", "bracket_elite"),
        )
        val presentation = buildEventDetailDivisionPresentation(
            selectedEvent = EventWithFullRelations(
                event = Event(
                    id = "tournament_1",
                    eventType = EventType.TOURNAMENT,
                    includePlayoffs = true,
                    singleDivision = false,
                    divisions = listOf(poolId),
                    divisionDetails = listOf(
                        DivisionDetail(id = bracketId, kind = "PLAYOFF", name = "Open"),
                        DivisionDetail(
                            id = poolId,
                            name = "Pool A",
                            playoffPlacementDivisionIds = listOf(bracketId),
                        ),
                    ),
                ),
                players = emptyList(),
                matches = emptyList(),
                teams = teams,
            ),
            selectedDivision = bracketId,
            selectedStandingsPoolDivisionId = poolId,
            tournamentPoolPlayEnabled = true,
            showStandingsDrawColumn = false,
            leagueDivisionStandings = null,
        )

        assertEquals(listOf("team_1", "team_2"), presentation.leagueStandings.map { it.teamId })
    }

    private fun team(id: String, name: String, divisionId: String): TeamWithPlayers = TeamWithPlayers(
        team = Team(
            division = divisionId,
            name = name,
            captainId = "${id}_captain",
            managerId = "${id}_captain",
            playerIds = listOf("${id}_captain"),
            teamSize = 5,
            id = id,
        ),
        captain = null,
        players = emptyList(),
        pendingPlayers = emptyList(),
    )
}
