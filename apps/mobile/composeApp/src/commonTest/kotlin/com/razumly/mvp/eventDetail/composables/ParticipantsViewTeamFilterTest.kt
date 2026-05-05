package com.razumly.mvp.eventDetail.composables

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals

class ParticipantsViewTeamFilterTest {
    @Test
    fun givenTeamSignupLeague_whenBuildingParticipantTeams_thenPlaceholderSlotsAreExcluded() {
        val event = Event(
            eventType = EventType.LEAGUE,
            teamSignup = true,
        )
        val teams = listOf(
            buildTeamWithPlayers(teamId = "actual-team"),
            buildTeamWithPlayers(teamId = "placeholder-kind", kind = "PLACEHOLDER", parentTeamId = "parent-team"),
            buildTeamWithPlayers(teamId = "placeholder-slot", parentTeamId = null),
        )

        val visibleTeamIds = visibleParticipantTeams(event, teams).map { team -> team.team.id }

        assertEquals(listOf("actual-team"), visibleTeamIds)
    }

    @Test
    fun givenIndividualEvent_whenBuildingParticipantTeams_thenExistingTeamsArePreserved() {
        val event = Event(
            eventType = EventType.EVENT,
            teamSignup = false,
        )
        val teams = listOf(
            buildTeamWithPlayers(teamId = "actual-team"),
            buildTeamWithPlayers(teamId = "blank-captain", captainId = ""),
        )

        val visibleTeamIds = visibleParticipantTeams(event, teams).map { team -> team.team.id }

        assertEquals(listOf("actual-team", "blank-captain"), visibleTeamIds)
    }

    private fun buildTeamWithPlayers(
        teamId: String,
        kind: String? = "REGISTERED",
        parentTeamId: String? = "parent-$teamId",
        captainId: String = "captain-$teamId",
    ): TeamWithPlayers = TeamWithPlayers(
        team = Team(
            division = "open",
            name = teamId,
            kind = kind,
            captainId = captainId,
            parentTeamId = parentTeamId,
            teamSize = 6,
            id = teamId,
        ),
        captain = UserData().copy(id = captainId),
        players = emptyList(),
        pendingPlayers = emptyList(),
    )
}
