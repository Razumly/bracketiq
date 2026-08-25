package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import kotlin.test.Test
import kotlin.test.assertEquals

class EventEditorAcceptedGraphMergeTest {
    @Test
    fun given_canonicalAndGraphDetails_when_mergingAcceptedGraphDivisionDetails_then_preservesCanonicalDetailsAndAddsGraphOnlyPhases() {
        val canonical = DivisionDetail(
            id = "division-league",
            key = "league",
            name = "League",
        )
        val graphDuplicate = canonical.copy(name = "Graph replacement")
        val graphOnlyPhase = DivisionDetail(
            id = "division-phase-pool",
            kind = "POOL",
            key = "pool",
            name = "Pool phase",
        )

        assertEquals(
            listOf(canonical, graphOnlyPhase),
            mergeAcceptedGraphDivisionDetails(
                canonical = listOf(canonical),
                graph = listOf(graphDuplicate, graphOnlyPhase),
            ),
        )
    }

    @Test
    fun given_canonicalAndGraphIds_when_mergingAcceptedGraphDivisionIds_then_preservesOrderAndDeduplicatesGraphIds() {
        assertEquals(
            listOf("division-league", "division-phase-pool", "division-bracket"),
            mergeAcceptedGraphDivisionIds(
                canonical = listOf("division-league", "division-phase-pool"),
                graph = listOf("division-league", "division-bracket"),
            ),
        )
    }
}
