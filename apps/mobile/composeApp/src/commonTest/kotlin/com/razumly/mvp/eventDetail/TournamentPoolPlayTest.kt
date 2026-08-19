package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.buildEventDivisionId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
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
                    isSystemGenerated = true,
                ),
            ),
        )

        assertTrue(event.isTournamentPoolPlayEnabled())
        assertEquals(setOf(bracketDivisionId), event.inferredTournamentBracketDivisionIds())
    }

    @Test
    fun isTournamentPoolPlayEnabled_usesExplicitPlacementWhenPoolNameIsSimple() {
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
                    name = "Pool A",
                    isSystemGenerated = true,
                    playoffPlacementDivisionIds = listOf(bracketDivisionId),
                ),
            ),
        )

        assertTrue(event.isTournamentPoolPlayEnabled())
        assertEquals(setOf(bracketDivisionId), event.inferredTournamentBracketDivisionIds())
    }

    @Test
    fun organizerOwnedPoolShapedDivision_isNotGeneratedPool() {
        val bracketDivisionId = "event-1__division__open"
        val organizerDetail = DivisionDetail(
            id = "${bracketDivisionId}_pool_beginner",
            key = "open_pool_beginner",
            name = "Beginner Pool",
            playoffPlacementDivisionIds = listOf(bracketDivisionId),
        )
        val event = Event(
            id = "event-1",
            eventType = EventType.TOURNAMENT,
            includePlayoffs = false,
            divisions = listOf(organizerDetail.id),
            divisionDetails = listOf(organizerDetail),
        )

        assertFalse(organizerDetail.isGeneratedTournamentPoolDivision())
        assertFalse(event.isTournamentPoolPlayEnabled())
    }

    @Test
    fun divisionDetailsForEventSettings_keepsOrganizerOwnedPoolShapedDivision() {
        val bracketDivisionId = "event-1__division__open"
        val organizerDetail = DivisionDetail(
            id = "${bracketDivisionId}_pool_beginner",
            key = "open_pool_beginner",
            name = "Beginner Pool",
            isSystemGenerated = false,
            playoffPlacementDivisionIds = listOf(bracketDivisionId),
        )
        val bracketDetail = DivisionDetail(
            id = bracketDivisionId,
            key = "open",
            name = "Open",
            kind = "PLAYOFF",
            isSystemGenerated = false,
        )
        val event = Event(
            id = "event-1",
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            divisions = listOf(organizerDetail.id, bracketDetail.id),
            divisionDetails = listOf(organizerDetail, bracketDetail),
        )

        assertEquals(
            listOf("Open", "Beginner Pool"),
            event.divisionDetailsForEventSettings().map(DivisionDetail::name),
        )
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

    @Test
    fun divisionDetailsForEventSettings_prefers_tournament_pool_bracket_details() {
        val eventId = "event-2"
        val bracketDivisionId = buildEventDivisionId(eventId, "c_skill_open_age_18plus")
        val poolDivisionId = "${bracketDivisionId}_pool_a"
        val event = Event(
            id = eventId,
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            singleDivision = false,
            divisions = listOf(poolDivisionId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = poolDivisionId,
                    key = "c_skill_open_age_18plus_pool_a",
                    name = "Pool A",
                    maxParticipants = 8,
                    playoffTeamCount = 4,
                    isSystemGenerated = true,
                    playoffPlacementDivisionIds = listOf(bracketDivisionId),
                ),
                DivisionDetail(
                    id = bracketDivisionId,
                    key = "c_skill_open_age_18plus",
                    name = "CoEd Open 18+",
                    kind = "PLAYOFF",
                    maxParticipants = 16,
                    playoffTeamCount = 8,
                    poolCount = 2,
                ),
            ),
        )

        val details = event.divisionDetailsForEventSettings()

        assertEquals(listOf(bracketDivisionId), details.map(DivisionDetail::id))
        assertEquals(2, details.single().poolCount)
        assertTrue(isTournamentPoolDivisionValid(details.single()))
    }
}
