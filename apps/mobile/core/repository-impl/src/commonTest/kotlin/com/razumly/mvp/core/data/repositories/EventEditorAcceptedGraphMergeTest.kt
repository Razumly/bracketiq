package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
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

    @Test
    fun given_collapsedEditorSnapshot_when_cachedGraphSourceWasRemoved_then_stalePhaseIsDroppedAndValidPhaseIsKept() {
        val incomingCanonical = DivisionDetail(
            id = " Division-Valid ",
            kind = "LEAGUE",
            key = "valid",
            name = "Still valid",
        )
        val removedCanonical = DivisionDetail(
            id = "division-removed",
            kind = "LEAGUE",
            key = "removed",
            name = "Removed",
        )
        val validPhase = DivisionDetail(
            id = "division-valid__phase__pool",
            sourceDivisionId = "division-valid",
            kind = "POOL",
            key = "valid-pool",
            name = "Valid pool",
        )
        val stalePhase = DivisionDetail(
            id = "division-removed__phase__pool",
            sourceDivisionId = "division-removed",
            kind = "POOL",
            key = "removed-pool",
            name = "Stale pool",
        )
        val cached = Event(
            id = "event-1",
            eventType = EventType.TOURNAMENT,
            divisions = listOf(
                "division-valid",
                "division-removed",
                validPhase.id,
                stalePhase.id,
            ),
            divisionDetails = listOf(
                incomingCanonical,
                removedCanonical,
                validPhase,
                stalePhase,
            ),
        )
        val incoming = Event(
            id = cached.id,
            eventType = EventType.TOURNAMENT,
            divisions = listOf(incomingCanonical.id),
            divisionDetails = listOf(incomingCanonical),
        )

        val merged = incoming.withCachedEditorDivisionState(cached)

        assertEquals(
            listOf(incomingCanonical.id, validPhase.id),
            merged.divisions,
        )
        assertEquals(
            listOf(incomingCanonical, validPhase),
            merged.divisionDetails,
        )
    }

    @Test
    fun given_collapsedEditorSnapshot_when_cachedGraphPhaseUsesEncodedDivisionId_then_phaseIsKept() {
        val eventId = "event-1"
        val canonical = DivisionDetail(
            id = "open",
            kind = "LEAGUE",
            key = "open",
            name = "Open",
        )
        val generatedPool = DivisionDetail(
            id = "${eventId}__division__open_pool_a__phase__pool",
            sourceDivisionId = null,
            kind = "LEAGUE",
            key = "open-pool-a",
            name = "Open Pool A",
            isSystemGenerated = true,
        )
        val cached = Event(
            id = eventId,
            eventType = EventType.TOURNAMENT,
            divisions = listOf(canonical.id, generatedPool.id),
            divisionDetails = listOf(canonical, generatedPool),
        )
        val incoming = Event(
            id = eventId,
            eventType = EventType.TOURNAMENT,
            divisions = listOf(canonical.id),
            divisionDetails = listOf(canonical),
        )

        val merged = incoming.withCachedEditorDivisionState(cached)

        assertEquals(
            listOf(canonical.id, generatedPool.id),
            merged.divisions,
        )
        assertEquals(
            listOf(canonical, generatedPool),
            merged.divisionDetails,
        )
    }
}
