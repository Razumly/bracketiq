package com.razumly.mvp.eventDetail.composables

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
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
    ): MatchMVP = MatchMVP(
        matchId = 1,
        team1Id = "team_a",
        team2Id = "team_b",
        eventId = "event_1",
        segments = segments,
        team1Points = team1Points,
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
