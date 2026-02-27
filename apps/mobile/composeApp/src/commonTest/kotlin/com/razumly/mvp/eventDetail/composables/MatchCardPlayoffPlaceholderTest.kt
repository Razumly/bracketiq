package com.razumly.mvp.eventDetail.composables

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class MatchCardPlayoffPlaceholderTest {

    @Test
    fun build_league_playoff_entrant_slots_treats_blank_and_unresolved_previous_ids_as_entrant_slots() {
        val semi1 = matchWithRelations(
            id = "semi_1",
            division = "open",
            team1Seed = 1,
            team2Seed = 4,
            previousLeftId = "",
            previousRightId = "missing_match",
        )
        val final = matchWithRelations(
            id = "final",
            division = "open",
            team1Seed = 1,
            team2Seed = 2,
            previousLeftId = "semi_1",
            previousRightId = "semi_2",
        )

        val slots = buildLeaguePlayoffEntrantSlots(
            matches = listOf(semi1, final).associateBy { it.match.id },
        )

        val slotKeys = slots
            .map { slot -> BracketSlotKey(slot.matchId, slot.slot) }
            .toSet()
        assertEquals(
            setOf(
                BracketSlotKey("semi_1", BracketTeamSlot.TEAM1),
                BracketSlotKey("semi_1", BracketTeamSlot.TEAM2),
                BracketSlotKey("final", BracketTeamSlot.TEAM2),
            ),
            slotKeys,
        )
    }

    @Test
    fun build_single_division_playoff_placeholder_assignments_matches_phone_league_shape() {
        val match11 = matchWithRelations(
            id = "match_11",
            division = "open",
            team1Seed = 4,
            team2Seed = 5,
            previousLeftId = null,
            previousRightId = null,
        )
        val match12 = matchWithRelations(
            id = "match_12",
            division = "open",
            team1Seed = 1,
            team2Seed = null,
            previousLeftId = null,
            previousRightId = "match_11",
        )
        val match13 = matchWithRelations(
            id = "match_13",
            division = "open",
            team1Seed = 2,
            team2Seed = 3,
            previousLeftId = null,
            previousRightId = null,
        )
        val match14 = matchWithRelations(
            id = "match_14",
            division = "open",
            team1Seed = null,
            team2Seed = null,
            previousLeftId = "match_12",
            previousRightId = "match_13",
        )

        val slots = buildLeaguePlayoffEntrantSlots(
            matches = listOf(match11, match12, match13, match14).associateBy { it.match.id },
        )
        val assignments = buildSingleDivisionPlayoffPlaceholderAssignments(
            slots = slots,
            playoffTeamCount = 5,
        )

        assertEquals("4th place", assignments[BracketSlotKey("match_11", BracketTeamSlot.TEAM1)])
        assertEquals("5th place", assignments[BracketSlotKey("match_11", BracketTeamSlot.TEAM2)])
        assertEquals("1st place", assignments[BracketSlotKey("match_12", BracketTeamSlot.TEAM1)])
        assertEquals("2nd place", assignments[BracketSlotKey("match_13", BracketTeamSlot.TEAM1)])
        assertEquals("3rd place", assignments[BracketSlotKey("match_13", BracketTeamSlot.TEAM2)])
        assertNull(assignments[BracketSlotKey("match_12", BracketTeamSlot.TEAM2)])
        assertNull(assignments[BracketSlotKey("match_14", BracketTeamSlot.TEAM1)])
        assertNull(assignments[BracketSlotKey("match_14", BracketTeamSlot.TEAM2)])
    }

    @Test
    fun build_single_division_playoff_placeholder_assignments_maps_seed_to_place() {
        val assignments = buildSingleDivisionPlayoffPlaceholderAssignments(
            slots = listOf(
                PlayoffBracketSlot("match_1", "open", 1, BracketTeamSlot.TEAM1),
                PlayoffBracketSlot("match_1", "open", 4, BracketTeamSlot.TEAM2),
                PlayoffBracketSlot("match_2", "open", 2, BracketTeamSlot.TEAM1),
                PlayoffBracketSlot("match_2", "open", 3, BracketTeamSlot.TEAM2),
            ),
            playoffTeamCount = 4,
        )

        assertEquals(
            "1st place",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "4th place",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM2)],
        )
        assertEquals(
            "2nd place",
            assignments[BracketSlotKey("match_2", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "3rd place",
            assignments[BracketSlotKey("match_2", BracketTeamSlot.TEAM2)],
        )
    }

    @Test
    fun build_single_division_playoff_placeholder_assignments_ignores_invalid_or_out_of_range_seeds() {
        val assignments = buildSingleDivisionPlayoffPlaceholderAssignments(
            slots = listOf(
                PlayoffBracketSlot("match_1", "open", 0, BracketTeamSlot.TEAM1),
                PlayoffBracketSlot("match_1", "open", 5, BracketTeamSlot.TEAM2),
                PlayoffBracketSlot("match_2", "open", null, BracketTeamSlot.TEAM1),
            ),
            playoffTeamCount = 4,
        )

        assertNull(assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM1)])
        assertNull(assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM2)])
        assertNull(assignments[BracketSlotKey("match_2", BracketTeamSlot.TEAM1)])
    }

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
    fun build_league_playoff_placeholder_assignments_backfills_when_seed_numbers_are_global() {
        val divisionA = DivisionDetail(
            id = "division_a",
            key = "division_a",
            name = "Open",
            playoffTeamCount = 2,
            playoffPlacementDivisionIds = listOf("playoff_gold", "playoff_gold"),
        )
        val divisionB = DivisionDetail(
            id = "division_b",
            key = "division_b",
            name = "Rec",
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
                PlayoffBracketSlot("match_1", "playoff_gold", 2, BracketTeamSlot.TEAM2),
                PlayoffBracketSlot("match_2", "playoff_gold", 3, BracketTeamSlot.TEAM1),
                PlayoffBracketSlot("match_2", "playoff_gold", 4, BracketTeamSlot.TEAM2),
            ),
        )

        assertEquals(
            "1st place (Open)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "2nd place (Open)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM2)],
        )
        assertEquals(
            "1st place (Rec)",
            assignments[BracketSlotKey("match_2", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "2nd place (Rec)",
            assignments[BracketSlotKey("match_2", BracketTeamSlot.TEAM2)],
        )
    }

    @Test
    fun build_league_playoff_placeholder_assignments_handles_split_playoff_seed_pattern() {
        val eventId = "event_1"
        val playoff1 = "${eventId}__division__playoff_1"
        val playoff2 = "${eventId}__division__playoff_2"
        val openDivision = DivisionDetail(
            id = "${eventId}__division__open",
            key = "open",
            name = "Open",
            playoffTeamCount = 8,
            playoffPlacementDivisionIds = listOf(
                playoff1, playoff1, playoff1, playoff1,
                playoff2, playoff2, playoff2, playoff2,
            ),
        )
        val recDivision = DivisionDetail(
            id = "${eventId}__division__rec",
            key = "rec",
            name = "Rec",
            playoffTeamCount = 8,
            playoffPlacementDivisionIds = listOf(
                playoff1, playoff1, playoff1, playoff1,
                playoff2, playoff2, playoff2, playoff2,
            ),
        )

        val assignments = buildLeaguePlayoffPlaceholderAssignments(
            eventDivisions = listOf(openDivision.id, recDivision.id),
            divisionDetails = listOf(openDivision, recDivision),
            eventPlayoffTeamCount = null,
            slots = listOf(
                PlayoffBracketSlot("m1", playoff1, 2, BracketTeamSlot.TEAM1),
                PlayoffBracketSlot("m1", playoff1, 7, BracketTeamSlot.TEAM2),
                PlayoffBracketSlot("m2", playoff1, 1, BracketTeamSlot.TEAM1),
                PlayoffBracketSlot("m2", playoff1, 8, BracketTeamSlot.TEAM2),
                PlayoffBracketSlot("m3", playoff1, 4, BracketTeamSlot.TEAM1),
                PlayoffBracketSlot("m3", playoff1, 5, BracketTeamSlot.TEAM2),
                PlayoffBracketSlot("m4", playoff1, 3, BracketTeamSlot.TEAM1),
                PlayoffBracketSlot("m4", playoff1, 6, BracketTeamSlot.TEAM2),
            ),
        )

        val labels = listOf(
            assignments[BracketSlotKey("m1", BracketTeamSlot.TEAM1)],
            assignments[BracketSlotKey("m1", BracketTeamSlot.TEAM2)],
            assignments[BracketSlotKey("m2", BracketTeamSlot.TEAM1)],
            assignments[BracketSlotKey("m2", BracketTeamSlot.TEAM2)],
            assignments[BracketSlotKey("m3", BracketTeamSlot.TEAM1)],
            assignments[BracketSlotKey("m3", BracketTeamSlot.TEAM2)],
            assignments[BracketSlotKey("m4", BracketTeamSlot.TEAM1)],
            assignments[BracketSlotKey("m4", BracketTeamSlot.TEAM2)],
        )
        val openCount = labels.count { it?.contains("(Open)") == true }
        val recCount = labels.count { it?.contains("(Rec)") == true }

        assertEquals(4, openCount)
        assertEquals(4, recCount)
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

private fun matchWithRelations(
    id: String,
    division: String,
    team1Seed: Int?,
    team2Seed: Int?,
    previousLeftId: String?,
    previousRightId: String?,
): MatchWithRelations = MatchWithRelations(
    match = MatchMVP(
        matchId = 1,
        team1Seed = team1Seed,
        team2Seed = team2Seed,
        eventId = "event_1",
        division = division,
        previousLeftId = previousLeftId,
        previousRightId = previousRightId,
        id = id,
    ),
    field = null,
    team1 = null,
    team2 = null,
    teamReferee = null,
    winnerNextMatch = null,
    loserNextMatch = null,
    previousLeftMatch = null,
    previousRightMatch = null,
)
