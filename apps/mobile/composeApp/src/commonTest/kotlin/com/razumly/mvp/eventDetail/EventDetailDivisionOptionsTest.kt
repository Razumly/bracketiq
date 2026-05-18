package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class EventDetailDivisionOptionsTest {
    @Test
    fun buildRegistrationDivisionOptions_tournamentPoolPlay_listsBracketDivisions() {
        val bracketId = "event-1__division__c_skill_open_age_18plus"
        val event = Event(
            id = "event-1",
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            singleDivision = false,
            divisions = listOf(
                "${bracketId}_pool_a",
                "${bracketId}_pool_b",
            ),
            divisionDetails = listOf(
                DivisionDetail(
                    id = bracketId,
                    kind = "PLAYOFF",
                    key = "c_skill_open_age_18plus",
                    name = "CoEd Open 18+",
                ),
                DivisionDetail(
                    id = "${bracketId}_pool_a",
                    key = "c_skill_open_age_18plus_pool_a",
                    name = "CoEd Open 18+ Pool A",
                    playoffPlacementDivisionIds = listOf(bracketId),
                ),
                DivisionDetail(
                    id = "${bracketId}_pool_b",
                    key = "c_skill_open_age_18plus_pool_b",
                    name = "CoEd Open 18+ Pool B",
                    playoffPlacementDivisionIds = listOf(bracketId),
                ),
            ),
        )

        val options = buildRegistrationDivisionOptions(event)

        assertEquals(listOf(bracketId), options.map { option -> option.id })
        assertEquals("CoEd Open 18+", options.single().label)
    }

    @Test
    fun buildRegistrationDivisionOptions_tournamentPoolPlay_synthesizesBracketFromPoolNames() {
        val bracketId = "event-1__division__c_skill_open_age_18plus"
        val event = Event(
            id = "event-1",
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            singleDivision = false,
            divisions = listOf("${bracketId}_pool_a"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "${bracketId}_pool_a",
                    key = "c_skill_open_age_18plus_pool_a",
                    name = "CoEd Open 18+ Pool A",
                    playoffPlacementDivisionIds = listOf(bracketId),
                ),
            ),
        )

        val options = buildRegistrationDivisionOptions(event)

        assertEquals(listOf(bracketId), options.map { option -> option.id })
        assertEquals("CoEd Open 18+", options.single().label)
    }

    @Test
    fun buildRegistrationDivisionOptions_tournamentPoolPlay_synthesizesBracketFromSimplePoolNames() {
        val bracketId = "event-1__division__c_skill_open_age_18plus"
        val event = Event(
            id = "event-1",
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            singleDivision = false,
            divisions = listOf("${bracketId}_pool_a"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "${bracketId}_pool_a",
                    key = "c_skill_open_age_18plus_pool_a",
                    name = "Pool A",
                    playoffPlacementDivisionIds = listOf(bracketId),
                ),
            ),
        )

        val options = buildRegistrationDivisionOptions(event)

        assertEquals(listOf(bracketId), options.map { option -> option.id })
        assertEquals("CoEd Open 18+", options.single().label)
    }

    @Test
    fun buildRegistrationDivisionOptions_leagueWithPlayoffs_keepsLeagueDivisions() {
        val event = Event(
            id = "event-2",
            eventType = EventType.LEAGUE,
            includePlayoffs = true,
            singleDivision = false,
            divisions = listOf("league_open", "playoff_gold"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "league_open",
                    key = "league_open",
                    name = "Open League",
                    playoffPlacementDivisionIds = listOf("playoff_gold"),
                ),
                DivisionDetail(
                    id = "playoff_gold",
                    kind = "PLAYOFF",
                    key = "playoff_gold",
                    name = "Gold Playoff",
                ),
            ),
        )

        val options = buildRegistrationDivisionOptions(event)

        assertEquals(listOf("league_open"), options.map { option -> option.id })
    }

    @Test
    fun buildRegistrationDivisionOptions_keeps_duplicate_type_divisions_separate() {
        val firstDivisionId = "event-dup__division__m_skill_open_age_18plus"
        val secondDivisionId = "event-dup_2__division__m_skill_open_age_18plus"
        val event = Event(
            id = "event-dup",
            eventType = EventType.LEAGUE,
            singleDivision = false,
            divisions = listOf(firstDivisionId, secondDivisionId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = firstDivisionId,
                    key = "m_skill_open_age_18plus",
                    name = "Mens Open 18+ - A",
                    divisionTypeId = "skill_open_age_18plus",
                ),
                DivisionDetail(
                    id = secondDivisionId,
                    key = "m_skill_open_age_18plus",
                    name = "Mens Open 18+ - B",
                    divisionTypeId = "skill_open_age_18plus",
                ),
            ),
        )

        val options = buildRegistrationDivisionOptions(event)

        assertEquals(listOf(firstDivisionId, secondDivisionId), options.map { option -> option.id })
        assertEquals(listOf("Mens Open 18+ - A", "Mens Open 18+ - B"), options.map { option -> option.label })
        assertEquals(secondDivisionId, options.resolveSelectedEventDivisionId(secondDivisionId))
        assertNull(options.findEventDivisionOption("skill_open_age_18plus"))
        assertNull(options.findEventDivisionOption("m_skill_open_age_18plus"))
    }
}
