package com.razumly.mvp.core.presentation.util

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlin.test.Test
import kotlin.test.assertEquals

class TeamDisplayLabelTest {

    @Test
    fun to_team_display_label_uses_explicit_team_name_when_present() {
        val captain = user(id = "captain", firstName = "Captain", lastName = "One")
        val team = buildTeamWithPlayers(
            team = Team(captainId = captain.id).copy(
                id = "team_1",
                name = "  The Rockets  ",
                playerIds = listOf(captain.id),
            ),
            captain = captain,
            players = listOf(captain),
        )

        assertEquals("The Rockets", team.toTeamDisplayLabel())
    }

    @Test
    fun to_team_display_label_falls_back_to_player_names_when_team_name_missing() {
        val alice = user(id = "alice", firstName = "Alice", lastName = "Baker")
        val bob = user(id = "bob", firstName = "Bob", lastName = "Clark")
        val team = buildTeamWithPlayers(
            team = Team(captainId = alice.id).copy(
                id = "team_2",
                name = "   ",
                playerIds = listOf(alice.id, bob.id),
            ),
            captain = alice,
            players = listOf(alice, bob),
        )

        assertEquals("Alice.B & Bob.C", team.toTeamDisplayLabel())
    }

    @Test
    fun to_team_display_label_falls_back_to_generic_team_label_when_no_name_or_players() {
        val captain = user(id = "captain", firstName = "Captain", lastName = "One")
        val team = buildTeamWithPlayers(
            team = Team(captainId = captain.id).copy(
                id = "team_3",
                name = null,
                playerIds = listOf(captain.id),
            ),
            captain = captain,
            players = emptyList(),
        )

        assertEquals("Team", team.toTeamDisplayLabel())
    }

    private fun buildTeamWithPlayers(
        team: Team,
        captain: UserData,
        players: List<UserData>,
    ): TeamWithPlayers {
        return TeamWithPlayers(
            team = team,
            captain = captain,
            players = players,
            pendingPlayers = emptyList(),
        )
    }

    private fun user(
        id: String,
        firstName: String,
        lastName: String,
    ): UserData {
        return UserData(
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
}
