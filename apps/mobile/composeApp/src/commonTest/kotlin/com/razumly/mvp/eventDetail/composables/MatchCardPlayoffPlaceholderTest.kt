package com.razumly.mvp.eventDetail.composables

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class MatchCardPlayoffPlaceholderTest {

    @Test
    fun build_league_playoff_placeholder_assignments_orders_by_placement_then_division() {
        val divisionA = DivisionDetail(
            id = "division_a",
            key = "division_a",
            name = "Division A",
            playoffTeamCount = 2,
            playoffPlacementDivisionIds = listOf("playoff_gold", "playoff_gold"),
        )
        val divisionB = DivisionDetail(
            id = "division_b",
            key = "division_b",
            name = "Division B",
            playoffTeamCount = 2,
            playoffPlacementDivisionIds = listOf("playoff_gold", "playoff_gold"),
        )
        val playoffGold = DivisionDetail(
            id = "playoff_gold",
            key = "playoff_gold",
            name = "Gold Playoff",
        )

        val assignments = buildLeaguePlayoffPlaceholderAssignments(
            eventDivisions = listOf("division_a", "division_b", "playoff_gold"),
            divisionDetails = listOf(divisionA, divisionB, playoffGold),
            eventPlayoffTeamCount = null,
            slots = listOf(
                PlayoffBracketSlot("match_1", "playoff_gold", 1, BracketTeamSlot.TEAM1),
                PlayoffBracketSlot("match_1", "playoff_gold", 1, BracketTeamSlot.TEAM2),
                PlayoffBracketSlot("match_2", "playoff_gold", 2, BracketTeamSlot.TEAM1),
                PlayoffBracketSlot("match_2", "playoff_gold", 2, BracketTeamSlot.TEAM2),
            ),
        )

        assertEquals(
            "1st place (Division A)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "1st place (Division B)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM2)],
        )
        assertEquals(
            "2nd place (Division A)",
            assignments[BracketSlotKey("match_2", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "2nd place (Division B)",
            assignments[BracketSlotKey("match_2", BracketTeamSlot.TEAM2)],
        )
    }

    @Test
    fun build_league_playoff_placeholder_assignments_ignores_unmapped_slots() {
        val divisionA = DivisionDetail(
            id = "division_a",
            key = "division_a",
            name = "Division A",
            playoffTeamCount = 2,
            playoffPlacementDivisionIds = listOf("playoff_gold", "playoff_gold"),
        )

        val assignments = buildLeaguePlayoffPlaceholderAssignments(
            eventDivisions = listOf("division_a", "playoff_gold"),
            divisionDetails = listOf(divisionA),
            eventPlayoffTeamCount = null,
            slots = listOf(
                PlayoffBracketSlot("match_1", "playoff_silver", 1, BracketTeamSlot.TEAM1),
            ),
        )

        assertNull(assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM1)])
    }

    @Test
    fun format_ordinal_placement_handles_suffix_exceptions() {
        assertEquals("1st", formatOrdinalPlacement(1))
        assertEquals("2nd", formatOrdinalPlacement(2))
        assertEquals("3rd", formatOrdinalPlacement(3))
        assertEquals("4th", formatOrdinalPlacement(4))
        assertEquals("11th", formatOrdinalPlacement(11))
        assertEquals("12th", formatOrdinalPlacement(12))
        assertEquals("13th", formatOrdinalPlacement(13))
        assertEquals("21st", formatOrdinalPlacement(21))
    }
}
