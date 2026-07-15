package com.razumly.mvp.matchDetail

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlin.test.Test
import kotlin.test.assertEquals

class MatchTeamDisplayLabelTest {

    @Test
    fun uses_player_first_name_when_unnamed_team_has_empty_last_name() {
        val player = user(id = "player_1", firstName = "Avery", lastName = "")
        val team = unnamedTeam(players = listOf(player))

        assertEquals("Avery", matchTeamDisplayLabel(team, fallbackLabel = "Team 1"))
    }

    @Test
    fun trims_whitespace_names_and_uses_the_team_fallback_when_no_player_name_remains() {
        val namedPlayer = user(id = "player_1", firstName = "  Jordan  ", lastName = "   ")
        val blankPlayer = user(id = "player_2", firstName = "   ", lastName = "  ")
        val team = unnamedTeam(players = listOf(namedPlayer, blankPlayer))

        assertEquals("Jordan", matchTeamDisplayLabel(team, fallbackLabel = "Team 2"))
        assertEquals("Team 2", matchTeamDisplayLabel(unnamedTeam(players = listOf(blankPlayer)), fallbackLabel = "Team 2"))
    }

    private fun unnamedTeam(players: List<UserData>): TeamWithRelations =
        TeamWithRelations(
            team = Team(captainId = players.firstOrNull()?.id.orEmpty()).copy(
                id = "team_1",
                name = "   ",
                playerIds = players.map(UserData::id),
            ),
            players = players,
            matchAsTeam1 = emptyList(),
            matchAsTeam2 = emptyList(),
        )

    private fun user(id: String, firstName: String, lastName: String): UserData =
        UserData(
            firstName = firstName,
            lastName = lastName,
            teamIds = emptyList(),
            friendIds = emptyList(),
            friendRequestIds = emptyList(),
            friendRequestSentIds = emptyList(),
            followingIds = emptyList(),
            userName = "",
            hasStripeAccount = false,
            uploadedImages = emptyList(),
            profileImageId = null,
            id = id,
        )
}
