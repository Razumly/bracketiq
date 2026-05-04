package com.razumly.mvp.core.data.dataTypes

import kotlin.test.Test
import kotlin.test.assertEquals

class TeamMembershipTest {
    @Test
    fun given_active_invited_and_started_members_when_counting_capacity_then_counts_them() {
        val team = Team(
            division = "OPEN",
            name = "Aces",
            captainId = "captain",
            managerId = "captain",
            playerRegistrations = listOf(
                TeamPlayerRegistration(
                    id = "registration-captain",
                    teamId = "team-1",
                    userId = "captain",
                    status = "ACTIVE",
                    isCaptain = true,
                ),
                TeamPlayerRegistration(
                    id = "registration-invited",
                    teamId = "team-1",
                    userId = "invited-player",
                    status = "INVITED",
                ),
                TeamPlayerRegistration(
                    id = "registration-started",
                    teamId = "team-1",
                    userId = "started-player",
                    status = "STARTED",
                ),
                TeamPlayerRegistration(
                    id = "registration-left",
                    teamId = "team-1",
                    userId = "left-player",
                    status = "LEFT",
                ),
                TeamPlayerRegistration(
                    id = "registration-removed",
                    teamId = "team-1",
                    userId = "removed-player",
                    status = "REMOVED",
                ),
            ),
            teamSize = 6,
            id = "team-1",
        )

        assertEquals(3, team.teamCapacityPlayerCount())
    }
}
