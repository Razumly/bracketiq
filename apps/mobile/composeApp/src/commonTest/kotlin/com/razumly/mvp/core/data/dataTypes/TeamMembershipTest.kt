package com.razumly.mvp.core.data.dataTypes

import kotlin.test.Test
import kotlin.test.assertEquals

class TeamMembershipTest {
    @Test
    fun canonical_membership_ids_replace_stale_current_rows_and_remain_stable() {
        val team = Team(
            division = "OPEN",
            name = "Aces",
            captainId = "old-captain",
            managerId = "old-captain",
            playerIds = listOf(
                "new-captain",
                "retained-player",
                "started-player",
                "payment-pending-player",
            ),
            pending = listOf("new-invite"),
            playerRegistrations = listOf(
                TeamPlayerRegistration(
                    id = "registration-old-captain",
                    teamId = "team-1",
                    userId = "old-captain",
                    status = "ACTIVE",
                    isCaptain = true,
                ),
                TeamPlayerRegistration(
                    id = "registration-retained",
                    teamId = "team-1",
                    userId = "retained-player",
                    status = "ACTIVE",
                    jerseyNumber = "12",
                ),
                TeamPlayerRegistration(
                    id = "registration-new-captain",
                    teamId = "team-1",
                    userId = "new-captain",
                    status = "INVITED",
                    jerseyNumber = "7",
                ),
                TeamPlayerRegistration(
                    id = "registration-old-invite",
                    teamId = "team-1",
                    userId = "old-invite",
                    status = "INVITED",
                ),
                TeamPlayerRegistration(
                    id = "registration-started",
                    teamId = "team-1",
                    userId = "started-player",
                    status = "STARTED",
                    consentStatus = "sent",
                ),
                TeamPlayerRegistration(
                    id = "registration-payment-pending",
                    teamId = "team-1",
                    userId = "payment-pending-player",
                    status = "PENDING",
                    position = "setter",
                ),
                TeamPlayerRegistration(
                    id = "registration-unassigned-workflow",
                    teamId = "team-1",
                    userId = "checkout-only-player",
                    status = "PENDING",
                    consentStatus = "awaiting-payment",
                ),
                TeamPlayerRegistration(
                    id = "registration-history",
                    teamId = "team-1",
                    userId = "former-player",
                    status = "LEFT",
                ),
            ),
            teamSize = 6,
            id = "team-1",
        )

        val reconciled = team.withCanonicalMembershipIds()
        val resynchronized = reconciled.withSynchronizedMembership()

        assertEquals("new-captain", reconciled.captainId)
        assertEquals(
            listOf(
                "new-captain",
                "retained-player",
                "started-player",
                "payment-pending-player",
            ),
            resynchronized.playerIds,
        )
        assertEquals(listOf("new-invite"), resynchronized.pending)
        assertEquals(
            "7",
            resynchronized.playerRegistrations.single { it.userId == "new-captain" }.jerseyNumber,
        )
        assertEquals(
            "12",
            resynchronized.playerRegistrations.single { it.userId == "retained-player" }.jerseyNumber,
        )
        assertEquals(
            "ACTIVE" to "sent",
            resynchronized.playerRegistrations
                .single { it.userId == "started-player" }
                .let { it.normalizedStatus() to it.consentStatus },
        )
        assertEquals(
            "ACTIVE" to "setter",
            resynchronized.playerRegistrations
                .single { it.userId == "payment-pending-player" }
                .let { it.normalizedStatus() to it.position },
        )
        assertEquals(
            "PENDING" to "awaiting-payment",
            resynchronized.playerRegistrations
                .single { it.userId == "checkout-only-player" }
                .let { it.normalizedStatus() to it.consentStatus },
        )
        assertEquals(
            listOf("former-player"),
            resynchronized.playerRegistrations.filter { it.normalizedStatus() == "LEFT" }.map { it.userId },
        )
        assertEquals(
            emptyList(),
            resynchronized.playerRegistrations
                .filter { it.isActive() || it.isInvited() }
                .map { it.userId }
                .filter { it == "old-captain" || it == "old-invite" },
        )
    }

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
