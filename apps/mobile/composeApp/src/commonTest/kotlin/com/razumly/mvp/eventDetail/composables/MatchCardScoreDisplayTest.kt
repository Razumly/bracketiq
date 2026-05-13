package com.razumly.mvp.eventDetail.composables

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals

class MatchCardScoreDisplayTest {

    @Test
    fun non_set_match_totals_segment_scores() {
        val event = Event(id = "event_1", usesSets = false)
        val match = match(
            segments = listOf(
                segment(sequence = 2, scores = mapOf("team_a" to 1, "team_b" to 0)),
                segment(sequence = 1, scores = mapOf("team_a" to 1, "team_b" to 0)),
            ),
            team1Points = listOf(1),
        )

        val points = displayPointsForTeam(
            event = event,
            match = match,
            teamId = "team_a",
            legacyPoints = match.team1Points,
            displaySetCount = 1,
        )

        assertEquals(listOf(2), points)
    }

    @Test
    fun non_set_match_falls_back_to_legacy_total() {
        val event = Event(id = "event_1", usesSets = false)
        val match = match(team1Points = listOf(1, 2))

        val points = displayPointsForTeam(
            event = event,
            match = match,
            teamId = "team_a",
            legacyPoints = match.team1Points,
            displaySetCount = 1,
        )

        assertEquals(listOf(3), points)
    }

    @Test
    fun set_match_keeps_segment_scores_per_set() {
        val event = Event(
            id = "event_1",
            usesSets = true,
            setsPerMatch = 2,
            winnerSetCount = 2,
        )
        val match = match(
            segments = listOf(
                segment(sequence = 1, scores = mapOf("team_a" to 21, "team_b" to 19)),
                segment(sequence = 2, scores = mapOf("team_a" to 18, "team_b" to 21)),
            ),
        )

        val points = displayPointsForTeam(
            event = event,
            match = match,
            teamId = "team_a",
            legacyPoints = match.team1Points,
            displaySetCount = 2,
        )

        assertEquals(listOf(21, 18), points)
    }

    @Test
    fun set_match_uses_resolved_scoring_model_when_event_flag_is_stale() {
        val event = Event(id = "event_1", usesSets = false)
        val match = match(
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "SETS",
                segmentCount = 2,
            ),
            segments = listOf(
                segment(sequence = 1, scores = mapOf("team_a" to 21, "team_b" to 19)),
                segment(sequence = 2, scores = mapOf("team_a" to 18, "team_b" to 21)),
            ),
        )

        val points = displayPointsForTeam(
            event = event,
            match = match,
            teamId = "team_a",
            legacyPoints = match.team1Points,
            displaySetCount = 2,
        )

        assertEquals(listOf(21, 18), points)
    }

    @Test
    fun set_match_pads_missing_set_scores_to_display_count() {
        val event = Event(
            id = "event_1",
            eventType = EventType.LEAGUE,
            usesSets = true,
            setsPerMatch = 3,
            winnerSetCount = 2,
        )
        val match = match(
            segments = listOf(
                segment(sequence = 1, scores = mapOf("team_a" to 12, "team_b" to 21)),
            ),
        )
        val scoreDisplay = resolveMatchCardScoreDisplay(
            event = event,
            sport = null,
            match = match,
        )

        val points = displayPointsForTeam(
            event = event,
            match = match,
            teamId = "team_a",
            legacyPoints = match.team1Points,
            displaySetCount = scoreDisplay.displaySetCount,
            scoringModel = scoreDisplay.scoringModel,
        )

        assertEquals(MatchCardScoreDisplay(scoringModel = "SETS", displaySetCount = 3), scoreDisplay)
        assertEquals(listOf(12, 0, 0), points)
    }

    @Test
    fun period_match_totals_segment_scores_from_resolved_scoring_model() {
        val event = Event(id = "event_1", usesSets = true)
        val match = match(
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "PERIODS",
                segmentCount = 4,
            ),
            segments = listOf(
                segment(sequence = 1, scores = mapOf("team_a" to 14, "team_b" to 10)),
                segment(sequence = 2, scores = mapOf("team_a" to 7, "team_b" to 3)),
            ),
        )

        val points = displayPointsForTeam(
            event = event,
            match = match,
            teamId = "team_a",
            legacyPoints = match.team1Points,
            displaySetCount = 4,
        )

        assertEquals(listOf(21), points)
    }

    @Test
    fun set_match_falls_back_to_legacy_scores() {
        val event = Event(id = "event_1", usesSets = true, winnerSetCount = 2)
        val match = match(team1Points = listOf(21, 18))

        val points = displayPointsForTeam(
            event = event,
            match = match,
            teamId = "team_a",
            legacyPoints = match.team1Points,
            displaySetCount = 2,
        )

        assertEquals(listOf(21, 18), points)
    }

    private fun match(
        segments: List<MatchSegmentMVP> = emptyList(),
        team1Points: List<Int> = emptyList(),
        resolvedMatchRules: ResolvedMatchRulesMVP? = null,
    ): MatchMVP = MatchMVP(
        matchId = 1,
        team1Id = "team_a",
        team2Id = "team_b",
        eventId = "event_1",
        segments = segments,
        team1Points = team1Points,
        resolvedMatchRules = resolvedMatchRules,
        id = "match_1",
    )

    private fun segment(
        sequence: Int,
        scores: Map<String, Int>,
    ): MatchSegmentMVP = MatchSegmentMVP(
        id = "segment_$sequence",
        matchId = "match_1",
        sequence = sequence,
        scores = scores,
    )
}
