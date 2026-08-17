package com.razumly.mvp.wear.data

import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals

class WearTeamHydrationTest {
    @Test
    fun givenRosterUserIds_whenHydrated_thenUsesProfilesForPlayerLabels() = runBlocking {
        var requestedUserIds: List<String>? = null

        val teamsById = hydrateWearTeams(
            teams = listOf(
                WearTeamDto(
                    id = "team_1",
                    name = "Hustle and Bustle",
                    playerRegistrations = listOf(
                        WearTeamRegistrationDto(
                            id = "registration_1",
                            userId = " player_1 ",
                            jerseyNumber = "7",
                        ),
                        WearTeamRegistrationDto(
                            id = "registration_2",
                            registrantId = "player_2",
                        ),
                    ),
                ),
                WearTeamDto(
                    id = "team_2",
                    name = "Tape Merchants",
                    playerIds = listOf("player_2", "player_3", "player_3", " "),
                ),
            ),
        ) { userIds ->
            requestedUserIds = userIds
            mapOf(
                "player_1" to WearUserProfileDto(firstName = "Alex", lastName = "Player"),
                "player_2" to WearUserProfileDto(displayName = "Casey Setter"),
                "player_3" to WearUserProfileDto(userName = "Morgan Libero"),
            )
        }

        assertEquals(listOf("player_1", "player_2", "player_3"), requestedUserIds)
        assertEquals(
            listOf(
                WearPlayer(
                    participantUserId = "player_1",
                    eventRegistrationId = "registration_1",
                    label = "Alex Player",
                    jerseyNumber = "7",
                ),
                WearPlayer(
                    participantUserId = "player_2",
                    eventRegistrationId = "registration_2",
                    label = "Casey Setter",
                ),
            ),
            teamsById.getValue("team_1").players,
        )
        assertEquals(
            listOf(
                WearPlayer(
                    participantUserId = "player_2",
                    eventRegistrationId = null,
                    label = "Casey Setter",
                ),
                WearPlayer(
                    participantUserId = "player_3",
                    eventRegistrationId = null,
                    label = "Morgan Libero",
                ),
            ),
            teamsById.getValue("team_2").players,
        )
    }
}
