package com.razumly.mvp.eventDetail.composables

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.enums.EventType
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
    fun build_playoff_placeholder_assignments_for_non_split_multi_division_league_uses_implicit_self_mappings() {
        val eventId = "event_1"
        val openDivision = DivisionDetail(
            id = "${eventId}__division__open",
            key = "open",
            name = "Open",
            playoffTeamCount = 12,
        )
        val mensDivision = DivisionDetail(
            id = "${eventId}__division__m_skill_bb_age_u10",
            key = "m_skill_bb_age_u10",
            name = "Men's BB U10",
            playoffTeamCount = 12,
        )
        val match = matchWithRelations(
            id = "match_135",
            division = openDivision.id,
            team1Seed = 6,
            team2Seed = 11,
            previousLeftId = null,
            previousRightId = null,
        )

        val assignments = buildPlayoffPlaceholderAssignmentsForEvent(
            eventType = EventType.LEAGUE,
            includePlayoffs = true,
            singleDivision = false,
            splitLeaguePlayoffDivisions = false,
            eventDivisions = listOf(openDivision.id, mensDivision.id),
            divisionDetails = listOf(openDivision, mensDivision),
            eventPlayoffTeamCount = 12,
            matches = listOf(match).associateBy { it.match.id },
        )
        val splitAssignments = buildPlayoffPlaceholderAssignmentsForEvent(
            eventType = EventType.LEAGUE,
            includePlayoffs = true,
            singleDivision = false,
            splitLeaguePlayoffDivisions = true,
            eventDivisions = listOf(openDivision.id, mensDivision.id),
            divisionDetails = listOf(openDivision, mensDivision),
            eventPlayoffTeamCount = 12,
            matches = listOf(match).associateBy { it.match.id },
        )

        assertEquals(
            "6th place (Open)",
            assignments[BracketSlotKey("match_135", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "11th place (Open)",
            assignments[BracketSlotKey("match_135", BracketTeamSlot.TEAM2)],
        )
        assertNull(splitAssignments[BracketSlotKey("match_135", BracketTeamSlot.TEAM1)])
        assertNull(splitAssignments[BracketSlotKey("match_135", BracketTeamSlot.TEAM2)])
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
    fun build_playoff_placeholder_assignments_for_event_uses_tournament_pool_mappings() {
        val bracketDivision = DivisionDetail(
            id = "bracket_open",
            kind = "PLAYOFF",
            key = "bracket_open",
            name = "Open Bracket",
        )
        val poolA = DivisionDetail(
            id = "pool_a",
            key = "pool_a",
            name = "Open Pool A",
            playoffTeamCount = 2,
            playoffPlacementDivisionIds = listOf(bracketDivision.id, bracketDivision.id),
        )
        val poolB = DivisionDetail(
            id = "pool_b",
            key = "pool_b",
            name = "Open Pool B",
            playoffTeamCount = 2,
            playoffPlacementDivisionIds = listOf(bracketDivision.id, bracketDivision.id),
        )
        val match1 = matchWithRelations(
            id = "match_1",
            division = bracketDivision.id,
            team1Seed = 1,
            team2Seed = 4,
            previousLeftId = null,
            previousRightId = null,
        )
        val match2 = matchWithRelations(
            id = "match_2",
            division = bracketDivision.id,
            team1Seed = 2,
            team2Seed = 3,
            previousLeftId = null,
            previousRightId = null,
        )

        val assignments = buildPlayoffPlaceholderAssignmentsForEvent(
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            singleDivision = false,
            eventDivisions = listOf(poolA.id, poolB.id),
            divisionDetails = listOf(poolA, poolB, bracketDivision),
            eventPlayoffTeamCount = null,
            matches = listOf(match1, match2).associateBy { it.match.id },
        )

        assertEquals(
            "1st place (Open Pool A)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "2nd place (Open Pool B)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM2)],
        )
        assertEquals(
            "1st place (Open Pool B)",
            assignments[BracketSlotKey("match_2", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "2nd place (Open Pool A)",
            assignments[BracketSlotKey("match_2", BracketTeamSlot.TEAM2)],
        )
    }

    @Test
    fun build_playoff_placeholder_assignments_for_tournament_infers_pool_play_from_mappings() {
        val bracketDivision = DivisionDetail(
            id = "bracket_open",
            kind = "PLAYOFF",
            key = "bracket_open",
            name = "Open Bracket",
        )
        val poolA = tournamentPoolDetail("pool_a", "Open Pool A", bracketDivision.id)
        val poolB = tournamentPoolDetail("pool_b", "Open Pool B", bracketDivision.id)
        val match = matchWithRelations(
            id = "match_1",
            division = bracketDivision.id,
            team1Seed = 1,
            team2Seed = 4,
            previousLeftId = null,
            previousRightId = null,
        )

        val assignments = buildPlayoffPlaceholderAssignmentsForEvent(
            eventType = EventType.TOURNAMENT,
            includePlayoffs = false,
            singleDivision = false,
            eventDivisions = listOf(poolA.id, poolB.id),
            divisionDetails = listOf(poolA, poolB, bracketDivision),
            eventPlayoffTeamCount = null,
            matches = listOf(match).associateBy { it.match.id },
        )

        assertEquals(
            "1st place (Open Pool A)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "2nd place (Open Pool B)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM2)],
        )
    }

    @Test
    fun build_playoff_placeholder_assignments_for_tournament_uses_division_name_verbatim() {
        val eventId = "event_1"
        val bracketDivisionId = "${eventId}__division__c_skill_skill_open_age_18plus"
        val poolA = DivisionDetail(
            id = "${bracketDivisionId}_pool_a",
            key = "c_skill_skill_open_age_18plus_pool_a",
            name = "Open 18+",
            playoffTeamCount = 2,
            playoffPlacementDivisionIds = listOf(bracketDivisionId, bracketDivisionId),
        )
        val poolB = DivisionDetail(
            id = "${bracketDivisionId}_pool_b",
            key = "c_skill_skill_open_age_18plus_pool_b",
            name = "Open 18+",
            playoffTeamCount = 2,
            playoffPlacementDivisionIds = listOf(bracketDivisionId, bracketDivisionId),
        )
        val match = matchWithRelations(
            id = "match_1",
            division = bracketDivisionId,
            team1Seed = 1,
            team2Seed = 4,
            previousLeftId = null,
            previousRightId = null,
        )

        val assignments = buildPlayoffPlaceholderAssignmentsForEvent(
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            singleDivision = false,
            eventDivisions = listOf(poolA.id, poolB.id),
            divisionDetails = listOf(poolA, poolB),
            eventPlayoffTeamCount = null,
            matches = listOf(match).associateBy { it.match.id },
        )

        assertEquals(
            "1st place (Open 18+)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "2nd place (Open 18+)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM2)],
        )
    }

    @Test
    fun build_playoff_placeholder_assignments_for_tournament_uses_pool_division_detail_name() {
        val eventId = "event_1"
        val bracketDivisionId = "${eventId}__division__c_skill_skill_open_age_18plus"
        val poolA = DivisionDetail(
            id = "${bracketDivisionId}_pool_a",
            key = "c_skill_skill_open_age_18plus_pool_a",
            name = "Pool A",
            gender = "C",
            skillDivisionTypeName = "Open",
            ageDivisionTypeName = "18+",
            playoffTeamCount = 2,
            playoffPlacementDivisionIds = listOf(bracketDivisionId, bracketDivisionId),
        )
        val poolB = DivisionDetail(
            id = "${bracketDivisionId}_pool_b",
            key = "c_skill_skill_open_age_18plus_pool_b",
            name = "Pool B",
            gender = "C",
            skillDivisionTypeName = "Open",
            ageDivisionTypeName = "18+",
            playoffTeamCount = 2,
            playoffPlacementDivisionIds = listOf(bracketDivisionId, bracketDivisionId),
        )
        val bracketDivision = DivisionDetail(
            id = bracketDivisionId,
            key = "c_skill_skill_open_age_18plus",
            kind = "PLAYOFF",
            name = "Open Bracket",
        )
        val match = matchWithRelations(
            id = "match_1",
            division = bracketDivisionId,
            team1Seed = 1,
            team2Seed = 4,
            previousLeftId = null,
            previousRightId = null,
        )

        val assignments = buildPlayoffPlaceholderAssignmentsForEvent(
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            singleDivision = false,
            eventDivisions = listOf(poolA.id, poolB.id),
            divisionDetails = listOf(poolA, poolB, bracketDivision),
            eventPlayoffTeamCount = null,
            matches = listOf(match).associateBy { it.match.id },
        )

        assertEquals(
            "1st place (Pool A)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "2nd place (Pool B)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM2)],
        )
    }

    @Test
    fun build_playoff_placeholder_assignments_for_tournament_infers_missing_pool_mappings_from_ids() {
        val eventId = "event_1"
        val bracketDivisionId = "${eventId}__division__c_skill_skill_open_age_18plus"
        val poolA = tournamentPoolDetailWithoutMappings(
            id = "${bracketDivisionId}_pool_a",
            name = "Pool A",
            divisionTypeName = "Open Pool A",
        )
        val poolB = tournamentPoolDetailWithoutMappings(
            id = "${bracketDivisionId}_pool_b",
            name = "Pool B",
            divisionTypeName = "Open Pool B",
        )
        val poolC = tournamentPoolDetailWithoutMappings(
            id = "${bracketDivisionId}_pool_c",
            name = "Pool C",
            divisionTypeName = "Open Pool C",
        )
        val poolD = tournamentPoolDetailWithoutMappings(
            id = "${bracketDivisionId}_pool_d",
            name = "Pool D",
            divisionTypeName = "Open Pool D",
        )
        val matches = listOf(
            matchWithRelations(
                id = "match_1",
                division = bracketDivisionId,
                team1Seed = 1,
                team2Seed = 8,
                previousLeftId = null,
                previousRightId = null,
            ),
            matchWithRelations(
                id = "match_2",
                division = bracketDivisionId,
                team1Seed = 4,
                team2Seed = 5,
                previousLeftId = null,
                previousRightId = null,
            ),
        )

        val assignments = buildPlayoffPlaceholderAssignmentsForEvent(
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            singleDivision = false,
            eventDivisions = listOf(poolA.id, poolB.id, poolC.id, poolD.id),
            divisionDetails = listOf(poolA, poolB, poolC, poolD),
            eventPlayoffTeamCount = null,
            matches = matches.associateBy { it.match.id },
        )

        assertEquals(
            "1st place (Pool A)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "2nd place (Pool D)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM2)],
        )
        assertEquals(
            "1st place (Pool D)",
            assignments[BracketSlotKey("match_2", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "2nd place (Pool A)",
            assignments[BracketSlotKey("match_2", BracketTeamSlot.TEAM2)],
        )
    }

    @Test
    fun build_playoff_placeholder_assignments_for_tournament_pool_play_maps_global_seeds_to_pool_advancers() {
        val bracketDivision = DivisionDetail(
            id = "bracket_open",
            kind = "PLAYOFF",
            key = "bracket_open",
            name = "Open Bracket",
        )
        val poolA = tournamentPoolDetail("pool_a", "Open Pool A", bracketDivision.id)
        val poolB = tournamentPoolDetail("pool_b", "Open Pool B", bracketDivision.id)
        val poolC = tournamentPoolDetail("pool_c", "Open Pool C", bracketDivision.id)
        val poolD = tournamentPoolDetail("pool_d", "Open Pool D", bracketDivision.id)

        val matches = listOf(
            matchWithRelations(
                id = "match_1",
                division = bracketDivision.id,
                team1Seed = 1,
                team2Seed = 8,
                previousLeftId = null,
                previousRightId = null,
            ),
            matchWithRelations(
                id = "match_2",
                division = bracketDivision.id,
                team1Seed = 4,
                team2Seed = 5,
                previousLeftId = null,
                previousRightId = null,
            ),
            matchWithRelations(
                id = "match_3",
                division = bracketDivision.id,
                team1Seed = 2,
                team2Seed = 7,
                previousLeftId = null,
                previousRightId = null,
            ),
            matchWithRelations(
                id = "match_4",
                division = bracketDivision.id,
                team1Seed = 3,
                team2Seed = 6,
                previousLeftId = null,
                previousRightId = null,
            ),
        )

        val assignments = buildPlayoffPlaceholderAssignmentsForEvent(
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            singleDivision = false,
            eventDivisions = listOf(poolA.id, poolB.id, poolC.id, poolD.id),
            divisionDetails = listOf(poolA, poolB, poolC, poolD, bracketDivision),
            eventPlayoffTeamCount = null,
            matches = matches.associateBy { it.match.id },
        )

        assertEquals(
            "1st place (Open Pool A)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "2nd place (Open Pool D)",
            assignments[BracketSlotKey("match_1", BracketTeamSlot.TEAM2)],
        )
        assertEquals(
            "1st place (Open Pool D)",
            assignments[BracketSlotKey("match_2", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "2nd place (Open Pool A)",
            assignments[BracketSlotKey("match_2", BracketTeamSlot.TEAM2)],
        )
        assertEquals(
            "1st place (Open Pool B)",
            assignments[BracketSlotKey("match_3", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "2nd place (Open Pool C)",
            assignments[BracketSlotKey("match_3", BracketTeamSlot.TEAM2)],
        )
        assertEquals(
            "1st place (Open Pool C)",
            assignments[BracketSlotKey("match_4", BracketTeamSlot.TEAM1)],
        )
        assertEquals(
            "2nd place (Open Pool B)",
            assignments[BracketSlotKey("match_4", BracketTeamSlot.TEAM2)],
        )
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

private fun tournamentPoolDetail(
    id: String,
    name: String,
    bracketDivisionId: String,
): DivisionDetail = DivisionDetail(
    id = id,
    key = id,
    name = name,
    playoffTeamCount = 2,
    playoffPlacementDivisionIds = listOf(bracketDivisionId, bracketDivisionId),
)

private fun tournamentPoolDetailWithoutMappings(
    id: String,
    name: String,
    divisionTypeName: String,
): DivisionDetail = DivisionDetail(
    id = id,
    key = id.substringAfter("__division__", id),
    name = name,
    divisionTypeName = divisionTypeName,
)

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
    teamOfficial = null,
    winnerNextMatch = null,
    loserNextMatch = null,
    previousLeftMatch = null,
    previousRightMatch = null,
)
