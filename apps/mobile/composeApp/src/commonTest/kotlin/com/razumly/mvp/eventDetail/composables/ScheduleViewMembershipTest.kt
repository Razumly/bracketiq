package com.razumly.mvp.eventDetail.composables

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.TeamStaffAssignment
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ScheduleViewMembershipTest {
    @Test
    fun canonical_active_player_is_included_without_legacy_player_ids() {
        val team = team(
            playerRegistrations = listOf(
                TeamPlayerRegistration(
                    id = "registration-player",
                    teamId = "team-home",
                    userId = "tracked-player",
                    status = "ACTIVE",
                ),
            ),
        )

        assertTrue(
            matchIncludesTrackedUsers(
                match = matchWithTeam(team),
                trackedUserIds = setOf("tracked-player"),
            ),
        )
    }

    @Test
    fun canonical_active_staff_is_included_without_legacy_coach_ids() {
        val team = team(
            staffAssignments = listOf(
                TeamStaffAssignment(
                    id = "assignment-coach",
                    teamId = "team-home",
                    userId = "tracked-coach",
                    role = "ASSISTANT_COACH",
                    status = "ACTIVE",
                ),
            ),
        )

        assertTrue(
            matchIncludesTrackedUsers(
                match = matchWithTeam(team),
                trackedUserIds = setOf("tracked-coach"),
            ),
        )
    }

    @Test
    fun inactive_canonical_membership_is_not_included() {
        val team = team(
            playerRegistrations = listOf(
                TeamPlayerRegistration(
                    id = "registration-left",
                    teamId = "team-home",
                    userId = "former-player",
                    status = "LEFT",
                ),
            ),
            staffAssignments = listOf(
                TeamStaffAssignment(
                    id = "assignment-removed",
                    teamId = "team-home",
                    userId = "former-coach",
                    role = "ASSISTANT_COACH",
                    status = "REMOVED",
                ),
            ),
        )

        assertFalse(
            matchIncludesTrackedUsers(
                match = matchWithTeam(team),
                trackedUserIds = setOf("former-player", "former-coach"),
            ),
        )
    }

    @Test
    fun legacy_player_and_coach_ids_remain_supported_as_fallbacks() {
        val legacyPlayerTeam = team(playerIds = listOf("legacy-player"))
        val legacyCoachTeam = team(id = "team-away", coachIds = listOf("legacy-coach"))
        val match = matchWithTeam(legacyPlayerTeam, legacyCoachTeam)

        assertTrue(matchIncludesTrackedUsers(match, setOf("legacy-player")))
        assertTrue(matchIncludesTrackedUsers(match, setOf("legacy-coach")))
    }
}

private fun team(
    id: String = "team-home",
    playerIds: List<String> = emptyList(),
    coachIds: List<String> = emptyList(),
    playerRegistrations: List<TeamPlayerRegistration> = emptyList(),
    staffAssignments: List<TeamStaffAssignment> = emptyList(),
): Team = Team(
    division = "OPEN",
    name = id,
    captainId = "captain-$id",
    coachIds = coachIds,
    playerIds = playerIds,
    playerRegistrations = playerRegistrations,
    staffAssignments = staffAssignments,
    teamSize = 6,
    id = id,
)

private fun matchWithTeam(
    team1: Team,
    team2: Team? = null,
): MatchWithRelations = MatchWithRelations(
    match = MatchMVP(
        matchId = 1,
        eventId = "event-1",
        team1Id = team1.id,
        team2Id = team2?.id,
        id = "match-1",
    ),
    field = null,
    team1 = team1,
    team2 = team2,
    teamOfficial = null,
    winnerNextMatch = null,
    loserNextMatch = null,
    previousLeftMatch = null,
    previousRightMatch = null,
)
