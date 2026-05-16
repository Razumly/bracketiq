package com.razumly.mvp.eventDetail.composables

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.eventDetail.buildRegistrationDivisionOptions
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

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

    @Test
    fun givenSplitDivisionEvent_whenFilteringParticipantTeams_thenOnlySelectedDivisionTeamsAreVisible() {
        val event = Event(
            eventType = EventType.LEAGUE,
            teamSignup = true,
            singleDivision = false,
            divisions = listOf("open", "competitive"),
            divisionDetails = listOf(
                DivisionDetail(id = "open", name = "Open"),
                DivisionDetail(id = "competitive", name = "Competitive"),
            ),
        )
        val teams = listOf(
            buildTeamWithPlayers(teamId = "open-team", division = "open"),
            buildTeamWithPlayers(teamId = "competitive-team", division = "competitive"),
            buildTeamWithPlayers(teamId = "placeholder-open", division = "open", parentTeamId = null),
        )

        val visibleTeamIds = visibleParticipantTeamsForDivision(
            event = event,
            teams = teams,
            divisionOptions = buildRegistrationDivisionOptions(event),
            selectedDivisionId = "open",
        ).map { team -> team.team.id }

        assertEquals(listOf("open-team"), visibleTeamIds)
    }

    @Test
    fun givenSplitDivisionEvent_whenTeamUsesDivisionTypeId_thenDivisionFilterMatchesIt() {
        val event = Event(
            eventType = EventType.LEAGUE,
            teamSignup = true,
            singleDivision = false,
            divisions = listOf("open_adult", "competitive_adult"),
            divisionDetails = listOf(
                DivisionDetail(id = "open_adult", name = "Open Adult", divisionTypeId = "open_adult"),
                DivisionDetail(id = "competitive_adult", name = "Competitive Adult", divisionTypeId = "competitive_adult"),
            ),
        )
        val teams = listOf(
            buildTeamWithPlayers(
                teamId = "open-team",
                division = "legacy-open-label",
                divisionTypeId = "open_adult",
            ),
            buildTeamWithPlayers(
                teamId = "competitive-team",
                division = "legacy-competitive-label",
                divisionTypeId = "competitive_adult",
            ),
        )

        val visibleTeamIds = visibleParticipantTeamsForDivision(
            event = event,
            teams = teams,
            divisionOptions = buildRegistrationDivisionOptions(event),
            selectedDivisionId = "competitive_adult",
        ).map { team -> team.team.id }

        assertEquals(listOf("competitive-team"), visibleTeamIds)
    }

    @Test
    fun givenSingleDivisionEventWithMultipleStoredDivisions_whenFilteringParticipantTeams_thenDivisionFilterIsIgnored() {
        val event = Event(
            eventType = EventType.LEAGUE,
            teamSignup = true,
            singleDivision = true,
            divisions = listOf("open", "competitive"),
            divisionDetails = listOf(
                DivisionDetail(id = "open", name = "Open"),
                DivisionDetail(id = "competitive", name = "Competitive"),
            ),
        )
        val teams = listOf(
            buildTeamWithPlayers(teamId = "open-team", division = "open"),
            buildTeamWithPlayers(teamId = "competitive-team", division = "competitive"),
        )
        val divisionOptions = buildRegistrationDivisionOptions(event)

        val visibleTeamIds = visibleParticipantTeamsForDivision(
            event = event,
            teams = teams,
            divisionOptions = divisionOptions,
            selectedDivisionId = "open",
        ).map { team -> team.team.id }

        assertEquals(listOf("open-team", "competitive-team"), visibleTeamIds)
        assertFalse(hasParticipantDivisionFilter(event, divisionOptions, selectedDivisionId = "open"))
    }

    private fun buildTeamWithPlayers(
        teamId: String,
        kind: String? = "REGISTERED",
        parentTeamId: String? = "parent-$teamId",
        captainId: String = "captain-$teamId",
        division: String = "open",
        divisionTypeId: String? = null,
    ): TeamWithPlayers = TeamWithPlayers(
        team = Team(
            division = division,
            name = teamId,
            kind = kind,
            captainId = captainId,
            parentTeamId = parentTeamId,
            divisionTypeId = divisionTypeId,
            teamSize = 6,
            id = teamId,
        ),
        captain = UserData().copy(id = captainId),
        players = emptyList(),
        pendingPlayers = emptyList(),
    )
}
