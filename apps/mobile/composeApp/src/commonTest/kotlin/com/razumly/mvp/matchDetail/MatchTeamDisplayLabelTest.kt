package com.razumly.mvp.matchDetail

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlin.test.Test
import kotlin.test.assertEquals

class MatchTeamDisplayLabelTest {
    @Test
    fun unnamedTeam_withBlankLegacyPlayerNames_usesSafeFallbacks() {
        val team = TeamWithRelations(
            team = Team(
                id = "team_1",
                name = "   ",
                division = "OPEN",
                captainId = "player_1",
                playerIds = listOf("player_1", "player_2", "player_3"),
                teamSize = 3,
            ),
            players = listOf(
                user(id = "player_1", firstName = "Avery", lastName = ""),
                user(id = "player_2", firstName = "", lastName = "Ng"),
                user(id = "player_3", firstName = "", lastName = " "),
            ),
            matchAsTeam1 = emptyList(),
            matchAsTeam2 = emptyList(),
        )

        assertEquals("Avery & N", matchTeamDisplayLabel(team, fallback = "Team 1"))
        assertEquals("Team 2", matchTeamDisplayLabel(null, fallback = "Team 2"))
    }

    @Test
    fun namedTeam_takesPrecedenceOverPlayerFallbacks() {
        val team = TeamWithRelations(
            team = Team(
                id = "team_1",
                name = "Cascade Crew",
                division = "OPEN",
                captainId = "player_1",
                teamSize = 1,
            ),
            players = listOf(user(id = "player_1", firstName = "Avery", lastName = "")),
            matchAsTeam1 = emptyList(),
            matchAsTeam2 = emptyList(),
        )

        assertEquals("Cascade Crew", matchTeamDisplayLabel(team, fallback = "Team 1"))
    }

    private fun user(id: String, firstName: String, lastName: String) = UserData(
        id = id,
        firstName = firstName,
        lastName = lastName,
        teamIds = emptyList(),
        friendIds = emptyList(),
        friendRequestIds = emptyList(),
        friendRequestSentIds = emptyList(),
        followingIds = emptyList(),
        userName = id,
        hasStripeAccount = false,
        uploadedImages = emptyList(),
    )
}
