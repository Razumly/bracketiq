package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TeamDtosTest {
    @Test
    fun to_update_dto_includes_player_registration_jersey_numbers() {
        val team = Team(
            division = "OPEN",
            name = "Aces",
            captainId = "user-1",
            playerIds = listOf("user-1", "user-2"),
            pending = listOf("user-3"),
            teamSize = 6,
            playerRegistrations = listOf(
                TeamPlayerRegistration(
                    id = "registration-1",
                    teamId = "team-1",
                    userId = "user-1",
                    status = "ACTIVE",
                    jerseyNumber = "7",
                    isCaptain = true,
                ),
                TeamPlayerRegistration(
                    id = "registration-2",
                    teamId = "team-1",
                    userId = "user-2",
                    status = "ACTIVE",
                    jerseyNumber = null,
                ),
                TeamPlayerRegistration(
                    id = "registration-3",
                    teamId = "team-1",
                    userId = "user-3",
                    status = "INVITED",
                    jerseyNumber = "12",
                ),
            ),
            id = "team-1",
        )

        val registrations = team.toUpdateDto().playerRegistrations.orEmpty()

        assertEquals(3, registrations.size)
        assertEquals("7", registrations.first { it.userId == "user-1" }.jerseyNumber)
        assertNull(registrations.first { it.userId == "user-2" }.jerseyNumber)
        assertEquals("12", registrations.first { it.userId == "user-3" }.jerseyNumber)
    }
}
