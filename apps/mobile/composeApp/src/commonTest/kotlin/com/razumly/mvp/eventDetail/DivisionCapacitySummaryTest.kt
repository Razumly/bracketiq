package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeId
import com.razumly.mvp.core.data.util.buildEventDivisionId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class DivisionCapacitySummaryTest {
    @Test
    fun buildDivisionCapacitySummaries_usesDivisionTeamIds_asSourceOfTruth() {
        val eventId = "event-1"
        val u17DivisionId = buildEventDivisionId(eventId, "c_skill_open_age_u17")
        val u15DivisionId = buildEventDivisionId(eventId, "c_skill_open_age_u15")
        val divisionDetails = listOf(
            buildDivisionDetail(
                id = u17DivisionId,
                token = "c_skill_open_age_u17",
                ageDivisionTypeId = "u17",
                teamIds = listOf("team-1"),
            ),
            buildDivisionDetail(
                id = u15DivisionId,
                token = "c_skill_open_age_u15",
                ageDivisionTypeId = "u15",
                teamIds = listOf("team-2"),
            ),
        )
        val event = Event(
            id = eventId,
            teamSignup = true,
            singleDivision = false,
            teamIds = listOf("team-1", "team-2"),
            divisions = listOf(u17DivisionId, u15DivisionId),
            divisionDetails = divisionDetails,
        )
        val teams = listOf(
            buildTeamWithPlayers(teamId = "team-1"),
            buildTeamWithPlayers(teamId = "team-2"),
        )

        val summaries = buildDivisionCapacitySummaries(
            event = event,
            divisionDetails = divisionDetails,
            teams = teams,
        )

        val filledByDivision = summaries.associate { summary -> summary.id to summary.filled }
        assertEquals(1, filledByDivision[u17DivisionId])
        assertEquals(1, filledByDivision[u15DivisionId])
        assertFalse(summaries.any { summary -> summary.id == "unassigned" })
    }

    @Test
    fun buildDivisionCapacitySummaries_addsUnassigned_whenEventTeamsAreMissingFromDivisionTeamIds() {
        val eventId = "event-2"
        val u17DivisionId = buildEventDivisionId(eventId, "c_skill_open_age_u17")
        val u15DivisionId = buildEventDivisionId(eventId, "c_skill_open_age_u15")
        val divisionDetails = listOf(
            buildDivisionDetail(
                id = u17DivisionId,
                token = "c_skill_open_age_u17",
                ageDivisionTypeId = "u17",
                teamIds = listOf("team-1", "team-stale"),
            ),
            buildDivisionDetail(
                id = u15DivisionId,
                token = "c_skill_open_age_u15",
                ageDivisionTypeId = "u15",
                teamIds = emptyList(),
            ),
        )
        val event = Event(
            id = eventId,
            teamSignup = true,
            singleDivision = false,
            teamIds = listOf("team-1", "team-2"),
            divisions = listOf(u17DivisionId, u15DivisionId),
            divisionDetails = divisionDetails,
        )
        val teams = listOf(
            buildTeamWithPlayers(teamId = "team-1"),
            buildTeamWithPlayers(teamId = "team-2"),
        )

        val summaries = buildDivisionCapacitySummaries(
            event = event,
            divisionDetails = divisionDetails,
            teams = teams,
        )

        val filledByDivision = summaries.associate { summary -> summary.id to summary.filled }
        assertEquals(1, filledByDivision[u17DivisionId])
        assertEquals(0, filledByDivision[u15DivisionId])
        assertEquals(1, filledByDivision["unassigned"])
    }

    private fun buildDivisionDetail(
        id: String,
        token: String,
        ageDivisionTypeId: String,
        teamIds: List<String>,
    ): DivisionDetail = DivisionDetail(
        id = id,
        key = token,
        name = token,
        divisionTypeId = buildCombinedDivisionTypeId(
            skillDivisionTypeId = "open",
            ageDivisionTypeId = ageDivisionTypeId,
        ),
        skillDivisionTypeId = "open",
        ageDivisionTypeId = ageDivisionTypeId,
        maxParticipants = 8,
        teamIds = teamIds,
    )

    private fun buildTeamWithPlayers(teamId: String): TeamWithPlayers = TeamWithPlayers(
        team = Team(
            division = "open",
            name = teamId,
            captainId = "captain-$teamId",
            teamSize = 2,
            id = teamId,
        ),
        captain = UserData(),
        players = emptyList(),
        pendingPlayers = emptyList(),
    )
}
