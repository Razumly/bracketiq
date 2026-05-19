package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeId
import com.razumly.mvp.core.data.util.buildEventDivisionId
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class DivisionCapacitySummaryTest {
    @Test
    fun buildDivisionCapacitySummaries_usesExactTeamDivisionIds_withoutDivisionTypeFallback() {
        val eventId = "event-1"
        val u17DivisionId = buildEventDivisionId(eventId, "c_skill_open_age_u17")
        val u15DivisionId = buildEventDivisionId(eventId, "c_skill_open_age_u15")
        val divisionDetails = listOf(
            buildDivisionDetail(
                id = u17DivisionId,
                token = "c_skill_open_age_u17",
                ageDivisionTypeId = "u17",
                teamIds = emptyList(),
            ),
            buildDivisionDetail(
                id = u15DivisionId,
                token = "c_skill_open_age_u15",
                ageDivisionTypeId = "u15",
                teamIds = listOf("team-1", "stale-team"),
            ),
        )
        val event = Event(
            id = eventId,
            eventType = EventType.LEAGUE,
            teamSignup = true,
            singleDivision = false,
            teamIds = listOf("team-1", "team-2"),
            divisions = listOf(u17DivisionId, u15DivisionId),
            divisionDetails = divisionDetails,
        )
        val teams = listOf(
            buildTeamWithPlayers(
                teamId = "team-1",
                division = u17DivisionId,
                ageDivisionTypeId = "u17",
            ),
            buildTeamWithPlayers(
                teamId = "team-2",
                division = "unused",
                divisionTypeId = buildCombinedDivisionTypeId(
                    skillDivisionTypeId = "open",
                    ageDivisionTypeId = "u15",
                ),
                ageDivisionTypeId = "u15",
            ),
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

    @Test
    fun buildDivisionCapacitySummaries_addsUnassigned_whenLoadedTeamsDoNotMatchDivisions() {
        val eventId = "event-2"
        val u17DivisionId = buildEventDivisionId(eventId, "c_skill_open_age_u17")
        val u15DivisionId = buildEventDivisionId(eventId, "c_skill_open_age_u15")
        val divisionDetails = listOf(
            buildDivisionDetail(
                id = u17DivisionId,
                token = "c_skill_open_age_u17",
                ageDivisionTypeId = "u17",
            ),
            buildDivisionDetail(
                id = u15DivisionId,
                token = "c_skill_open_age_u15",
                ageDivisionTypeId = "u15",
            ),
        )
        val event = Event(
            id = eventId,
            eventType = EventType.LEAGUE,
            teamSignup = true,
            singleDivision = false,
            teamIds = listOf("team-1", "team-2"),
            divisions = listOf(u17DivisionId, u15DivisionId),
            divisionDetails = divisionDetails,
        )
        val teams = listOf(
            buildTeamWithPlayers(
                teamId = "team-1",
                division = u17DivisionId,
                ageDivisionTypeId = "u17",
            ),
            buildTeamWithPlayers(teamId = "team-2", division = "unknown"),
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

    @Test
    fun buildDivisionCapacitySummaries_splitLeaguePlayoffs_onlyCountsLeagueDivisionsByExactDivision() {
        val eventId = "example-league"
        val leagueADivisionId = buildEventDivisionId(eventId, "m_skill_open_age_18plus")
        val leagueBDivisionId = "${eventId}_2__division__m_skill_open_age_18plus"
        val upperPlayoffDivisionId = buildEventDivisionId(eventId, "playoff_1")
        val lowerPlayoffDivisionId = buildEventDivisionId(eventId, "playoff_2")
        val divisionDetails = listOf(
            buildDivisionDetail(
                id = leagueADivisionId,
                token = "m_skill_open_age_18plus",
                ageDivisionTypeId = "18plus",
                name = "Mens Open 18+ - A",
                teamIds = (1..8).map { index -> "team-a-$index" },
            ),
            buildDivisionDetail(
                id = leagueBDivisionId,
                token = "m_skill_open_age_18plus",
                ageDivisionTypeId = "18plus",
                name = "Mens Open 18+ - B",
                teamIds = (1..8).map { index -> "team-b-$index" },
            ),
            buildDivisionDetail(
                id = upperPlayoffDivisionId,
                token = "playoff_1",
                ageDivisionTypeId = "18plus",
                name = "Upper Division",
                teamIds = (1..8).map { index -> "team-a-$index" },
                kind = "PLAYOFF",
            ),
            buildDivisionDetail(
                id = lowerPlayoffDivisionId,
                token = "playoff_2",
                ageDivisionTypeId = "18plus",
                name = "Lower Division",
                teamIds = (1..8).map { index -> "team-b-$index" },
                kind = "PLAYOFF",
            ),
        )
        val event = Event(
            id = eventId,
            eventType = EventType.LEAGUE,
            includePlayoffs = true,
            splitLeaguePlayoffDivisions = true,
            teamSignup = true,
            singleDivision = false,
            teamIds = (1..8).map { index -> "team-a-$index" } +
                (1..8).map { index -> "team-b-$index" },
            divisions = listOf(leagueADivisionId, leagueBDivisionId),
            divisionDetails = divisionDetails,
        )
        val teams = (1..8).map { index ->
            buildTeamWithPlayers(
                teamId = "team-a-$index",
                division = leagueADivisionId,
                divisionTypeId = buildCombinedDivisionTypeId(
                    skillDivisionTypeId = "open",
                    ageDivisionTypeId = "18plus",
                ),
                ageDivisionTypeId = "18plus",
                divisionGender = "M",
            )
        } + (1..8).map { index ->
            buildTeamWithPlayers(
                teamId = "team-b-$index",
                division = leagueBDivisionId,
                divisionTypeId = buildCombinedDivisionTypeId(
                    skillDivisionTypeId = "open",
                    ageDivisionTypeId = "18plus",
                ),
                ageDivisionTypeId = "18plus",
                divisionGender = "M",
            )
        }

        val summaries = buildDivisionCapacitySummaries(
            event = event,
            divisionDetails = divisionDetails,
            teams = teams,
        )

        val filledByDivision = summaries.associate { summary -> summary.id to summary.filled }
        assertEquals(listOf(leagueADivisionId, leagueBDivisionId), summaries.map { summary -> summary.id })
        assertEquals(8, filledByDivision[leagueADivisionId])
        assertEquals(8, filledByDivision[leagueBDivisionId])
        assertFalse(summaries.any { summary -> summary.id == upperPlayoffDivisionId })
        assertFalse(summaries.any { summary -> summary.id == lowerPlayoffDivisionId })
    }

    @Test
    fun buildDivisionCapacitySummaries_excludesPlaceholderTeams() {
        val eventId = "event-3"
        val divisionId = buildEventDivisionId(eventId, "c_skill_open_age_u17")
        val divisionDetails = listOf(
            buildDivisionDetail(
                id = divisionId,
                token = "c_skill_open_age_u17",
                ageDivisionTypeId = "u17",
            ),
        )
        val event = Event(
            id = eventId,
            eventType = EventType.LEAGUE,
            teamSignup = true,
            singleDivision = false,
            teamIds = listOf("team-1", "team-2"),
            divisions = listOf(divisionId),
            divisionDetails = divisionDetails,
        )
        val teams = listOf(
            buildTeamWithPlayers(
                teamId = "team-1",
                division = divisionId,
                ageDivisionTypeId = "u17",
            ),
            buildTeamWithPlayers(
                teamId = "team-2",
                division = divisionId,
                ageDivisionTypeId = "u17",
                kind = "PLACEHOLDER",
                parentTeamId = null,
            ),
        )

        val summaries = buildDivisionCapacitySummaries(
            event = event,
            divisionDetails = divisionDetails,
            teams = teams,
        )

        assertEquals(1, summaries.single().filled)
    }

    @Test
    fun buildDivisionCapacitySummaries_tournamentPoolPlay_collapsesPoolsToBracketCapacity() {
        val eventId = "event-4"
        val bracketDivisionId = buildEventDivisionId(eventId, "c_skill_open_age_u17")
        val poolADivisionId = "${bracketDivisionId}_pool_a"
        val poolBDivisionId = "${bracketDivisionId}_pool_b"
        val divisionDetails = listOf(
            buildDivisionDetail(
                id = poolADivisionId,
                token = "c_skill_open_age_u17_pool_a",
                ageDivisionTypeId = "u17",
                name = "Coed Open U17 Pool A",
                maxParticipants = 4,
                playoffPlacementDivisionIds = listOf(bracketDivisionId, bracketDivisionId),
            ),
            buildDivisionDetail(
                id = poolBDivisionId,
                token = "c_skill_open_age_u17_pool_b",
                ageDivisionTypeId = "u17",
                name = "Coed Open U17 Pool B",
                maxParticipants = 4,
                playoffPlacementDivisionIds = listOf(bracketDivisionId, bracketDivisionId),
            ),
        )
        val event = Event(
            id = eventId,
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            teamSignup = true,
            singleDivision = false,
            teamIds = listOf("team-1", "team-2"),
            divisions = listOf(poolADivisionId, poolBDivisionId),
            divisionDetails = divisionDetails,
        )
        val teams = listOf(
            buildTeamWithPlayers(
                teamId = "team-1",
                division = poolADivisionId,
                ageDivisionTypeId = "u17",
            ),
            buildTeamWithPlayers(
                teamId = "team-2",
                division = poolBDivisionId,
                ageDivisionTypeId = "u17",
            ),
        )

        val summaries = buildDivisionCapacitySummaries(
            event = event,
            divisionDetails = divisionDetails,
            teams = teams,
        )

        assertEquals(1, summaries.size)
        assertEquals(bracketDivisionId, summaries.single().id)
        assertEquals("Coed Open U17", summaries.single().label)
        assertEquals(2, summaries.single().filled)
        assertEquals(8, summaries.single().capacity)
    }

    private fun buildDivisionDetail(
        id: String,
        token: String,
        ageDivisionTypeId: String,
        teamIds: List<String> = emptyList(),
        name: String = token,
        maxParticipants: Int? = 8,
        playoffPlacementDivisionIds: List<String> = emptyList(),
        kind: String? = null,
    ): DivisionDetail = DivisionDetail(
        id = id,
        key = token,
        name = name,
        kind = kind,
        divisionTypeId = buildCombinedDivisionTypeId(
            skillDivisionTypeId = "open",
            ageDivisionTypeId = ageDivisionTypeId,
        ),
        skillDivisionTypeId = "open",
        ageDivisionTypeId = ageDivisionTypeId,
        maxParticipants = maxParticipants,
        teamIds = teamIds,
        playoffPlacementDivisionIds = playoffPlacementDivisionIds,
    )

    private fun buildTeamWithPlayers(
        teamId: String,
        division: String = "open",
        divisionTypeId: String? = null,
        skillDivisionTypeId: String? = "open",
        ageDivisionTypeId: String? = null,
        divisionGender: String? = "C",
        kind: String? = null,
        parentTeamId: String? = "parent-$teamId",
    ): TeamWithPlayers = TeamWithPlayers(
        team = Team(
            division = division,
            name = teamId,
            kind = kind,
            captainId = "captain-$teamId",
            parentTeamId = parentTeamId,
            teamSize = 2,
            divisionTypeId = divisionTypeId,
            skillDivisionTypeId = skillDivisionTypeId,
            ageDivisionTypeId = ageDivisionTypeId,
            divisionGender = divisionGender,
            id = teamId,
        ),
        captain = UserData(),
        players = emptyList(),
        pendingPlayers = emptyList(),
    )
}
