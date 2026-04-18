package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals

class EventOverviewCapacityTest {
    @Test
    fun resolveOverviewFilledParticipantCount_teamSignup_excludesPlaceholderTeams() {
        val relations = EventWithFullRelations(
            event = Event(
                eventType = EventType.LEAGUE,
                teamSignup = true,
                maxParticipants = 5,
            ),
            players = emptyList(),
            matches = emptyList(),
            teams = listOf(
                buildTeamWithPlayers("team-1"),
                buildTeamWithPlayers("team-2"),
                buildTeamWithPlayers("team-3"),
                buildTeamWithPlayers("team-4", kind = "PLACEHOLDER", parentTeamId = null),
                buildTeamWithPlayers("team-5", parentTeamId = null),
            ),
        )

        assertEquals(3, relations.resolveOverviewFilledParticipantCount())
    }

    @Test
    fun resolveOverviewFilledParticipantCount_selectedWeeklySummaryOverridesRosterCount() {
        val relations = EventWithFullRelations(
            event = Event(teamSignup = true),
            players = emptyList(),
            matches = emptyList(),
            teams = listOf(
                buildTeamWithPlayers("team-1"),
                buildTeamWithPlayers("team-2"),
                buildTeamWithPlayers("team-3"),
                buildTeamWithPlayers("team-4"),
                buildTeamWithPlayers("team-5"),
            ),
        )

        val filled = relations.resolveOverviewFilledParticipantCount(
            WeeklyOccurrenceSummary(participantCount = 3, participantCapacity = 5),
        )

        assertEquals(3, filled)
    }

    @Test
    fun countTeamSignupParticipantsForCapacity_singleDivision_excludesPlaceholderTeams() {
        val event = Event(
            eventType = EventType.LEAGUE,
            teamSignup = true,
            singleDivision = true,
        )
        val teams = listOf(
            buildTeamWithPlayers("team-1"),
            buildTeamWithPlayers("team-2"),
            buildTeamWithPlayers("team-3"),
            buildTeamWithPlayers("team-4", kind = "PLACEHOLDER", parentTeamId = null),
            buildTeamWithPlayers("team-5", parentTeamId = null),
        )

        assertEquals(3, countTeamSignupParticipantsForCapacity(event, teams))
    }

    @Test
    fun countTeamSignupParticipantsForCapacity_multiDivision_filtersPlaceholdersBeforeDivisionCount() {
        val event = Event(
            eventType = EventType.LEAGUE,
            teamSignup = true,
            singleDivision = false,
        )
        val selectedDivision = DivisionDetail(
            id = "open",
            key = "open",
            name = "Open",
        )
        val teams = listOf(
            buildTeamWithPlayers("team-1", division = "open"),
            buildTeamWithPlayers("team-2", division = "open", kind = "PLACEHOLDER", parentTeamId = null),
            buildTeamWithPlayers("team-3", division = "advanced"),
        )

        assertEquals(1, countTeamSignupParticipantsForCapacity(event, teams, selectedDivision))
    }

    private fun buildTeamWithPlayers(
        teamId: String,
        division: String = "open",
        kind: String? = "REGISTERED",
        parentTeamId: String? = "parent-$teamId",
    ): TeamWithPlayers = TeamWithPlayers(
        team = Team(
            division = division,
            name = teamId,
            kind = kind,
            captainId = "captain-$teamId",
            parentTeamId = parentTeamId,
            teamSize = 2,
            id = teamId,
        ),
        captain = UserData(),
        players = emptyList(),
        pendingPlayers = emptyList(),
    )
}
