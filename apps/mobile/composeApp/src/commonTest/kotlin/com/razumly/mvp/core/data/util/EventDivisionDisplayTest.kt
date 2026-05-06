package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals

class EventDivisionDisplayTest {
    @Test
    fun divisionDisplayLabels_tournamentPoolPlayShowsBracketDivisions() {
        val bracketId = "event-1__division__c_skill_open_age_18plus"
        val poolA = "${bracketId}_pool_a"
        val poolB = "${bracketId}_pool_b"
        val event = Event(
            id = "event-1",
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            divisions = listOf(poolA, poolB),
            divisionDetails = listOf(
                DivisionDetail(
                    id = poolA,
                    key = "c_skill_open_age_18plus_pool_a",
                    name = "CoEd Open 18+ Pool A",
                    playoffPlacementDivisionIds = listOf(bracketId),
                ),
                DivisionDetail(
                    id = poolB,
                    key = "c_skill_open_age_18plus_pool_b",
                    name = "CoEd Open 18+ Pool B",
                    playoffPlacementDivisionIds = listOf(bracketId),
                ),
                DivisionDetail(
                    id = bracketId,
                    key = "c_skill_open_age_18plus",
                    kind = "PLAYOFF",
                    name = "CoEd Open 18+",
                ),
            ),
        )

        assertEquals(listOf("CoEd Open 18+"), event.divisionDisplayLabels())
    }

    @Test
    fun divisionDisplayLabels_leaguePlayoffsShowLeagueDivisions() {
        val event = Event(
            id = "event-2",
            eventType = EventType.LEAGUE,
            includePlayoffs = true,
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
                    key = "playoff_gold",
                    kind = "PLAYOFF",
                    name = "Gold Playoff",
                ),
            ),
        )

        assertEquals(listOf("Open League"), event.divisionDisplayLabels())
    }
}
