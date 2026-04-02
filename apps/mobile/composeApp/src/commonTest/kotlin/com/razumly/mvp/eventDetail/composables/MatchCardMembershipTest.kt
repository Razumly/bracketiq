package com.razumly.mvp.eventDetail.composables

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MatchCardMembershipTest {

    @Test
    fun match_belongs_to_user_when_user_is_assigned_as_official() {
        val match = matchWithRelations(
            MatchMVP(
                matchId = 1,
                eventId = "event_1",
                officialId = "official_user",
                id = "match_1",
            ),
        )

        val belongsToUser = matchBelongsToUser(
            match = match,
            teams = emptyMap(),
            currentUserId = "official_user",
        )

        assertTrue(belongsToUser)
    }

    @Test
    fun match_belongs_to_user_when_user_is_on_competing_team() {
        val homeTeam = team(
            id = "team_home",
            captainId = "captain_1",
            playerIds = listOf("current_user"),
        )
        val match = matchWithRelations(
            MatchMVP(
                matchId = 2,
                eventId = "event_1",
                team1Id = homeTeam.id,
                id = "match_2",
            ),
            team1 = homeTeam,
        )

        val belongsToUser = matchBelongsToUser(
            match = match,
            teams = mapOf(homeTeam.id to teamWithPlayers(homeTeam)),
            currentUserId = "current_user",
        )

        assertTrue(belongsToUser)
    }

    @Test
    fun match_belongs_to_user_when_user_is_on_team_assigned_to_officiate() {
        val officialTeam = team(
            id = "team_official",
            captainId = "captain_2",
            coachIds = listOf("current_user"),
        )
        val match = matchWithRelations(
            MatchMVP(
                matchId = 3,
                eventId = "event_1",
                teamOfficialId = officialTeam.id,
                id = "match_3",
            ),
            teamOfficial = officialTeam,
        )

        val belongsToUser = matchBelongsToUser(
            match = match,
            teams = mapOf(officialTeam.id to teamWithPlayers(officialTeam)),
            currentUserId = "current_user",
        )

        assertTrue(belongsToUser)
    }

    @Test
    fun match_does_not_belong_to_user_when_user_is_not_on_teams_or_official_assignments() {
        val homeTeam = team(id = "team_home", captainId = "captain_1")
        val awayTeam = team(id = "team_away", captainId = "captain_2")
        val match = matchWithRelations(
            MatchMVP(
                matchId = 4,
                eventId = "event_1",
                team1Id = homeTeam.id,
                team2Id = awayTeam.id,
                id = "match_4",
            ),
            team1 = homeTeam,
            team2 = awayTeam,
        )

        val belongsToUser = matchBelongsToUser(
            match = match,
            teams = mapOf(
                homeTeam.id to teamWithPlayers(homeTeam),
                awayTeam.id to teamWithPlayers(awayTeam),
            ),
            currentUserId = "someone_else",
        )

        assertFalse(belongsToUser)
    }
}

private fun matchWithRelations(
    match: MatchMVP,
    team1: Team? = null,
    team2: Team? = null,
    teamOfficial: Team? = null,
): MatchWithRelations = MatchWithRelations(
    match = match,
    field = null,
    team1 = team1,
    team2 = team2,
    teamOfficial = teamOfficial,
    winnerNextMatch = null,
    loserNextMatch = null,
    previousLeftMatch = null,
    previousRightMatch = null,
)

private fun team(
    id: String,
    captainId: String,
    managerId: String? = null,
    headCoachId: String? = null,
    coachIds: List<String> = emptyList(),
    playerIds: List<String> = emptyList(),
): Team = Team(
    division = "OPEN",
    name = id,
    captainId = captainId,
    managerId = managerId,
    headCoachId = headCoachId,
    coachIds = coachIds,
    playerIds = playerIds,
    teamSize = maxOf(playerIds.size, 1),
    id = id,
)

private fun teamWithPlayers(team: Team): TeamWithPlayers = TeamWithPlayers(
    team = team,
    captain = null,
    players = emptyList(),
    pendingPlayers = emptyList(),
)
