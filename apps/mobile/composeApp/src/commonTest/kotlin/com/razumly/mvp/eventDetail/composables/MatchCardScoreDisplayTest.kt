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
    fun set_match_uses_persisted_score_count_before_event_count() {
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

        assertEquals(MatchCardScoreDisplay(scoringModel = "SETS", displaySetCount = 1), scoreDisplay)
        assertEquals(listOf(12), points)
    }

    @Test
    fun loser_bracket_set_match_uses_persisted_score_count_before_loser_event_count() {
        val event = Event(
            id = "event_1",
            usesSets = true,
            loserSetCount = 3,
            winnerSetCount = 3,
        )
        val match = match(
            losersBracket = true,
            segments = listOf(
                segment(sequence = 1, scores = mapOf("team_a" to 15, "team_b" to 10)),
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

        assertEquals(MatchCardScoreDisplay(scoringModel = "SETS", displaySetCount = 1), scoreDisplay)
        assertEquals(listOf(15), points)
    }

    @Test
    fun loser_bracket_set_match_uses_persisted_score_count_before_rule_segment_count() {
        val event = Event(
            id = "event_1",
            usesSets = true,
            loserSetCount = 1,
            winnerSetCount = 3,
        )
        val match = match(
            losersBracket = true,
            team1Points = listOf(15),
            team2Points = listOf(10),
            setResults = listOf(1),
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "SETS",
                segmentCount = 3,
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

        assertEquals(MatchCardScoreDisplay(scoringModel = "SETS", displaySetCount = 1), scoreDisplay)
        assertEquals(listOf(15), points)
    }

    @Test
    fun set_match_without_scores_uses_configured_display_count() {
        val event = Event(
            id = "event_1",
            eventType = EventType.LEAGUE,
            usesSets = true,
            setsPerMatch = 3,
            winnerSetCount = 2,
        )
        val match = match()

        val scoreDisplay = resolveMatchCardScoreDisplay(
            event = event,
            sport = null,
            match = match,
        )

        assertEquals(MatchCardScoreDisplay(scoringModel = "SETS", displaySetCount = 3), scoreDisplay)
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
        team2Points: List<Int> = emptyList(),
        setResults: List<Int> = emptyList(),
        resolvedMatchRules: ResolvedMatchRulesMVP? = null,
        losersBracket: Boolean = false,
    ): MatchMVP = MatchMVP(
        matchId = 1,
        team1Id = "team_a",
        team2Id = "team_b",
        eventId = "event_1",
        segments = segments,
        team1Points = team1Points,
        team2Points = team2Points,
        setResults = setResults,
        resolvedMatchRules = resolvedMatchRules,
        losersBracket = losersBracket,
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
