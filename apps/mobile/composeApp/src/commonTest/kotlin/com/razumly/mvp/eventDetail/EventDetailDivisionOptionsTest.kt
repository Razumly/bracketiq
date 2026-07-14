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
    fun stageDivisionOptions_splitLeaguePlayoffs_separatesLeagueAndBracketDivisions() {
        val event = Event(
            id = "event-split",
            eventType = EventType.LEAGUE,
            includePlayoffs = true,
            splitLeaguePlayoffDivisions = true,
            singleDivision = false,
            divisions = listOf("league_a", "league_b", "playoff_gold", "playoff_silver"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "league_a",
                    key = "league_a",
                    name = "League A",
                    playoffPlacementDivisionIds = listOf("playoff_gold"),
                ),
                DivisionDetail(
                    id = "league_b",
                    key = "league_b",
                    name = "League B",
                    playoffPlacementDivisionIds = listOf("playoff_silver"),
                ),
                DivisionDetail(
                    id = "playoff_gold",
                    kind = "PLAYOFF",
                    key = "playoff_gold",
                    name = "Gold Bracket",
                ),
                DivisionDetail(
                    id = "playoff_silver",
                    kind = "PLAYOFF",
                    key = "playoff_silver",
                    name = "Silver Bracket",
                ),
            ),
        )
        val fallbackOptions = listOf(
            BracketDivisionOption("league_a", "League A"),
            BracketDivisionOption("league_b", "League B"),
            BracketDivisionOption("playoff_gold", "Gold Bracket"),
            BracketDivisionOption("playoff_silver", "Silver Bracket"),
        )

        val leagueOptions = event.leagueDivisionOptionsForStandings(fallbackOptions, emptyList())
        val playoffOptions = event.playoffDivisionOptionsForBracket(fallbackOptions, emptyList())

        assertEquals(listOf("league_a", "league_b"), leagueOptions.map { option -> option.id })
        assertEquals(listOf("playoff_gold", "playoff_silver"), playoffOptions.map { option -> option.id })
        assertEquals(
            listOf("playoff_gold", "playoff_silver"),
            event.detailBracketDivisionOptions(
                tournamentPoolPlayEnabled = false,
                tournamentBracketDivisionOptions = emptyList(),
                joinDivisionOptions = fallbackOptions,
                leagueDivisionOptions = leagueOptions,
                playoffDivisionOptions = playoffOptions,
            ).map { option -> option.id },
        )
        assertEquals(
            "playoff_silver",
            event.preferredBracketStageDivisionId(
                tournamentPoolPlayEnabled = false,
                playoffDivisionOptions = playoffOptions,
                selectedDivisionId = "league_b",
            ),
        )
        assertEquals(
            "league_a",
            event.preferredStandingsStageDivisionId(
                tournamentPoolPlayEnabled = false,
                selectedDivisionId = "playoff_gold",
            ),
        )
    }

    @Test
    fun stageDivisionOptions_nonSplitLeaguePlayoffs_usesLeagueDivisionsForBracket() {
        val event = Event(
            id = "event-unified",
            eventType = EventType.LEAGUE,
            includePlayoffs = true,
            splitLeaguePlayoffDivisions = false,
            singleDivision = false,
            divisions = listOf("league_open", "league_advanced"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "league_open",
                    key = "league_open",
                    name = "Open League",
                    playoffTeamCount = 4,
                ),
                DivisionDetail(
                    id = "league_advanced",
                    key = "league_advanced",
                    name = "Advanced League",
                    playoffTeamCount = 4,
                ),
            ),
        )
        val fallbackOptions = listOf(
            BracketDivisionOption("league_open", "Open League"),
            BracketDivisionOption("league_advanced", "Advanced League"),
        )

        val leagueOptions = event.leagueDivisionOptionsForStandings(fallbackOptions, emptyList())
        val playoffOptions = event.playoffDivisionOptionsForBracket(fallbackOptions, emptyList())

        assertEquals(listOf("league_advanced", "league_open"), leagueOptions.map { option -> option.id })
        assertEquals(emptyList(), playoffOptions)
        assertEquals(
            listOf("league_advanced", "league_open"),
            event.detailBracketDivisionOptions(
                tournamentPoolPlayEnabled = false,
                tournamentBracketDivisionOptions = emptyList(),
                joinDivisionOptions = fallbackOptions,
                leagueDivisionOptions = leagueOptions,
                playoffDivisionOptions = playoffOptions,
            ).map { option -> option.id },
        )
        assertEquals(
            "league_advanced",
            event.preferredBracketStageDivisionId(
                tournamentPoolPlayEnabled = false,
                playoffDivisionOptions = playoffOptions,
                selectedDivisionId = "league_advanced",
            ),
        )
    }

    @Test
    fun stageDivisionOptions_tournamentPoolPlay_mapsPoolsToBrackets() {
        val bracketId = "event-pool__division__open"
        val poolAId = "${bracketId}_pool_a"
        val poolBId = "${bracketId}_pool_b"
        val event = Event(
            id = "event-pool",
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            singleDivision = false,
            divisions = listOf(poolAId, poolBId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = bracketId,
                    kind = "PLAYOFF",
                    key = "open",
                    name = "Open Bracket",
                ),
                DivisionDetail(
                    id = poolAId,
                    key = "open_pool_a",
                    name = "Open Pool A",
                    playoffPlacementDivisionIds = listOf(bracketId),
                ),
                DivisionDetail(
                    id = poolBId,
                    key = "open_pool_b",
                    name = "Open Pool B",
                    playoffPlacementDivisionIds = listOf(bracketId),
                ),
            ),
        )
        val bracketOptions = listOf(BracketDivisionOption(bracketId, "Open Bracket"))
        val joinOptions = listOf(
            BracketDivisionOption(poolAId, "Open Pool A"),
            BracketDivisionOption(poolBId, "Open Pool B"),
            BracketDivisionOption(bracketId, "Open Bracket"),
        )

        assertEquals(
            listOf(bracketId),
            event.detailBracketDivisionOptions(
                tournamentPoolPlayEnabled = true,
                tournamentBracketDivisionOptions = bracketOptions,
                joinDivisionOptions = joinOptions,
                leagueDivisionOptions = emptyList(),
                playoffDivisionOptions = emptyList(),
            ).map { option -> option.id },
        )
        assertEquals(
            bracketId,
            event.preferredBracketStageDivisionId(
                tournamentPoolPlayEnabled = true,
                playoffDivisionOptions = emptyList(),
                selectedDivisionId = poolBId,
            ),
        )
        assertEquals(
            bracketId,
            event.preferredStandingsStageDivisionId(
                tournamentPoolPlayEnabled = true,
                selectedDivisionId = poolAId,
            ),
        )
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

    @Test
    fun playoffDivisionIdsForSelection_collectsExplicitAndPlacementDivisions() {
        val event = Event(
            id = "event-playoff-selection",
            eventType = EventType.LEAGUE,
            includePlayoffs = true,
            splitLeaguePlayoffDivisions = true,
            divisions = listOf("league_open", "playoff_gold"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "league_open",
                    key = "league_open",
                    name = "Open League",
                    playoffPlacementDivisionIds = listOf(" playoff_gold "),
                ),
                DivisionDetail(
                    id = "PLAYOFF_GOLD",
                    kind = "playoff",
                    key = "playoff_gold",
                    name = "Gold Playoff",
                ),
            ),
        )

        assertEquals(setOf("playoff_gold"), event.playoffDivisionIdsForSelection())
    }
}
