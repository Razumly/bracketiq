package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals

class LeagueStandingsPresentationTest {
    @Test
    fun visibleLeagueStandingsColumns_hides_draw_column_when_not_supported() {
        assertContentEquals(
            listOf(
                LeagueStandingsColumn.WINS,
                LeagueStandingsColumn.LOSSES,
                LeagueStandingsColumn.POINTS,
            ),
            visibleLeagueStandingsColumns(showDrawColumn = false),
        )
    }

    @Test
    fun buildLeagueStandings_counts_wins_losses_draws_and_points() {
        val teamOne = team(id = "team_1", name = "Team One")
        val teamTwo = team(id = "team_2", name = "Team Two")

        val standings = buildLeagueStandings(
            teams = listOf(teamOne, teamTwo),
            matches = listOf(
                match(
                    id = "match_1",
                    matchNumber = 1,
                    team1Id = teamOne.team.id,
                    team2Id = teamTwo.team.id,
                    team1Points = listOf(2),
                    team2Points = listOf(1),
                ),
                match(
                    id = "match_2",
                    matchNumber = 2,
                    team1Id = teamOne.team.id,
                    team2Id = teamTwo.team.id,
                    team1Points = listOf(1),
                    team2Points = listOf(1),
                ),
            ),
            config = scoringConfig(pointsForWin = 3, pointsForDraw = 1, pointsForLoss = 0),
            supportsDraw = true,
        )

        val first = standings.first { it.teamId == teamOne.team.id }
        val second = standings.first { it.teamId == teamTwo.team.id }

        assertEquals(1, first.wins)
        assertEquals(0, first.losses)
        assertEquals(1, first.draws)
        assertEquals(2, first.matchesPlayed)
        assertEquals(4.0, first.finalPoints)

        assertEquals(0, second.wins)
        assertEquals(1, second.losses)
        assertEquals(1, second.draws)
        assertEquals(2, second.matchesPlayed)
        assertEquals(1.0, second.finalPoints)
    }

    @Test
    fun buildLeagueStandings_uses_explicit_winner_when_tied_score_cannot_draw() {
        val teamOne = team(id = "team_1", name = "Team One")
        val teamTwo = team(id = "team_2", name = "Team Two")

        val standings = buildLeagueStandings(
            teams = listOf(teamOne, teamTwo),
            matches = listOf(
                match(
                    id = "match_1",
                    matchNumber = 1,
                    team1Id = teamOne.team.id,
                    team2Id = teamTwo.team.id,
                    team1Points = listOf(1),
                    team2Points = listOf(1),
                    winnerEventTeamId = teamOne.team.id,
                ),
            ),
            config = scoringConfig(pointsForWin = 3, pointsForDraw = 1, pointsForLoss = 0),
            supportsDraw = false,
        )

        val first = standings.first { it.teamId == teamOne.team.id }
        val second = standings.first { it.teamId == teamTwo.team.id }

        assertEquals(1, first.wins)
        assertEquals(0, first.draws)
        assertEquals(3.0, first.finalPoints)

        assertEquals(1, second.losses)
        assertEquals(0, second.draws)
        assertEquals(0.0, second.finalPoints)
    }

    private fun team(
        id: String,
        name: String,
    ): TeamWithPlayers = TeamWithPlayers(
        team = Team(
            division = "open",
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

    private fun match(
        id: String,
        matchNumber: Int,
        team1Id: String,
        team2Id: String,
        team1Points: List<Int>,
        team2Points: List<Int>,
        winnerEventTeamId: String? = null,
    ): MatchWithRelations = MatchWithRelations(
        match = MatchMVP(
            matchId = matchNumber,
            team1Id = team1Id,
            team2Id = team2Id,
            eventId = "event_1",
            team1Points = team1Points,
            team2Points = team2Points,
            winnerEventTeamId = winnerEventTeamId,
            id = id,
        ),
        field = null,
        team1 = null,
        team2 = null,
        teamOfficial = null,
        winnerNextMatch = null,
        loserNextMatch = null,
        previousLeftMatch = null,
        previousRightMatch = null,
    )

    private fun scoringConfig(
        pointsForWin: Int,
        pointsForDraw: Int,
        pointsForLoss: Int,
    ): LeagueScoringConfig = LeagueScoringConfig(
        id = "cfg_1",
        pointsForWin = pointsForWin,
        pointsForDraw = pointsForDraw,
        pointsForLoss = pointsForLoss,
        pointsPerSetWin = null,
        pointsPerSetLoss = null,
        pointsPerGameWin = null,
        pointsPerGameLoss = null,
        pointsPerGoalScored = null,
        pointsPerGoalConceded = null,
    )
}
