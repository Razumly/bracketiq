package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.buildEventDivisionId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TournamentPoolPlayTest {
    @Test
    fun isTournamentPoolPlayEnabled_detectsGeneratedPoolDivisionsWithoutExplicitMappings() {
        val eventId = "event-1"
        val bracketDivisionId = buildEventDivisionId(eventId, "c_skill_open_age_18plus")
        val poolDivisionId = "${bracketDivisionId}_pool_a"
        val event = Event(
            id = eventId,
            eventType = EventType.TOURNAMENT,
            includePlayoffs = false,
            singleDivision = false,
            divisions = listOf(poolDivisionId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = poolDivisionId,
                    key = "c_skill_open_age_18plus_pool_a",
                    name = "CoEd Open 18+ Pool A",
                ),
            ),
        )

        assertTrue(event.isTournamentPoolPlayEnabled())
        assertEquals(setOf(bracketDivisionId), event.inferredTournamentBracketDivisionIds())
    }

    @Test
    fun tournamentBracketDivisionId_prefersExplicitPlacementMapping() {
        val detail = DivisionDetail(
            id = "event-1__division__open_pool_a",
            key = "open_pool_a",
            playoffPlacementDivisionIds = listOf("event-1__division__championship"),
        )

        assertEquals("event-1__division__championship", detail.tournamentBracketDivisionId())
    }
}
