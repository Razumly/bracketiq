package com.razumly.mvp.eventDetail.data

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BracketGraphValidatorTest {

    @Test
    fun filterValidNextMatchCandidates_allows_leaf_candidate_when_unrelated_unknown_reference_exists() {
        val nodes = listOf(
            BracketNode(id = "source"),
            BracketNode(id = "leaf"),
            BracketNode(id = "other", winnerNextMatchId = "missing"),
        )

        val candidates = filterValidNextMatchCandidates(
            sourceId = "source",
            nodes = nodes,
            lane = BracketLane.WINNER,
        )

        assertTrue(candidates.contains("leaf"))
    }

    @Test
    fun filterValidNextMatchCandidates_excludes_target_with_two_existing_incoming_matches() {
        val nodes = listOf(
            BracketNode(id = "source"),
            BracketNode(id = "target", previousLeftId = "left", previousRightId = "right"),
            BracketNode(id = "left"),
            BracketNode(id = "right"),
        )

        val candidates = filterValidNextMatchCandidates(
            sourceId = "source",
            nodes = nodes,
            lane = BracketLane.WINNER,
        )

        assertFalse(candidates.contains("target"))
    }

    @Test
    fun filterValidNextMatchCandidates_excludes_opposite_lane_target() {
        val nodes = listOf(
            BracketNode(id = "source", loserNextMatchId = "target"),
            BracketNode(id = "target"),
            BracketNode(id = "leaf"),
        )

        val candidates = filterValidNextMatchCandidates(
            sourceId = "source",
            nodes = nodes,
            lane = BracketLane.WINNER,
        )

        assertFalse(candidates.contains("target"))
        assertTrue(candidates.contains("leaf"))
    }

    @Test
    fun filterValidNextMatchCandidates_normalizes_source_id_input() {
        val nodes = listOf(
            BracketNode(id = "source"),
            BracketNode(id = "leaf"),
        )

        val candidates = filterValidNextMatchCandidates(
            sourceId = " source ",
            nodes = nodes,
            lane = BracketLane.WINNER,
        )

        assertTrue(candidates.contains("leaf"))
    }
}
