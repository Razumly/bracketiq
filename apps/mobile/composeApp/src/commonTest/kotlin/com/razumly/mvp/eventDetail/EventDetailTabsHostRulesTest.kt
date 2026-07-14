package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.presentation.EventDetailInitialTab
import kotlin.test.Test
import kotlin.test.assertEquals

class EventDetailTabsHostRulesTest {
    @Test
    fun givenAvailableViews_whenBuildingTabs_thenParticipantsRemainFirstAndOptionalTabsFollow() {
        assertEquals(
            listOf(
                DetailTab.PARTICIPANTS,
                DetailTab.SCHEDULE,
                DetailTab.LEAGUES,
                DetailTab.BRACKET,
            ),
            availableEventDetailTabs(
                hasBracketView = true,
                hasScheduleView = true,
                hasStandingsView = true,
            ),
        )
        assertEquals(
            listOf(DetailTab.PARTICIPANTS),
            availableEventDetailTabs(
                hasBracketView = false,
                hasScheduleView = false,
                hasStandingsView = false,
            ),
        )
    }

    @Test
    fun givenScheduleInitialTab_whenScheduleIsUnavailable_thenParticipantsIsSelected() {
        assertEquals(
            DetailTab.PARTICIPANTS,
            resolveInitialEventDetailTab(
                initialTab = EventDetailInitialTab.SCHEDULE,
                availableTabs = listOf(DetailTab.PARTICIPANTS, DetailTab.BRACKET),
            ),
        )
        assertEquals(
            DetailTab.SCHEDULE,
            resolveInitialEventDetailTab(
                initialTab = EventDetailInitialTab.SCHEDULE,
                availableTabs = listOf(DetailTab.PARTICIPANTS, DetailTab.SCHEDULE),
            ),
        )
    }

    @Test
    fun givenSelectedTournamentPool_whenFilteringSchedule_thenOnlyThatPoolRemains() {
        val matches = listOf(
            match(id = "pool-a", division = "Pool A"),
            match(id = "pool-b", division = "pool-b"),
            match(id = "bracket", division = "gold"),
        )

        assertEquals(
            listOf("pool-a"),
            filterScheduleMatchesForDivision(
                matches = matches,
                tournamentPoolPlayEnabled = true,
                selectedSchedulePoolDivisionId = "pool-a",
                selectedScheduleDivisionId = "gold",
                schedulePoolDivisionOptions = listOf(
                    BracketDivisionOption(id = "pool-a", label = "Pool A"),
                    BracketDivisionOption(id = "pool-b", label = "Pool B"),
                ),
                singleDivision = false,
                selectedDivisionId = "gold",
            ).map { it.match.id },
        )
    }

    @Test
    fun givenTournamentBracketSelection_whenFilteringSchedule_thenBracketAndItsPoolsRemain() {
        val matches = listOf(
            match(id = "pool-a", division = "pool-a"),
            match(id = "pool-b", division = "pool-b"),
            match(id = "bracket", division = "gold"),
            match(id = "other", division = "silver"),
        )

        assertEquals(
            listOf("pool-a", "pool-b", "bracket"),
            filterScheduleMatchesForDivision(
                matches = matches,
                tournamentPoolPlayEnabled = true,
                selectedSchedulePoolDivisionId = null,
                selectedScheduleDivisionId = "gold",
                schedulePoolDivisionOptions = listOf(
                    BracketDivisionOption(id = "pool-a", label = "Pool A"),
                    BracketDivisionOption(id = "pool-b", label = "Pool B"),
                ),
                singleDivision = false,
                selectedDivisionId = "silver",
            ).map { it.match.id },
        )
    }

    @Test
    fun givenOrdinaryDivisionSelection_whenFilteringSchedule_thenOnlyThatDivisionRemains() {
        val matches = listOf(
            match(id = "open", division = "Open"),
            match(id = "advanced", division = "advanced"),
        )

        assertEquals(
            listOf("open"),
            filterScheduleMatchesForDivision(
                matches = matches,
                tournamentPoolPlayEnabled = false,
                selectedSchedulePoolDivisionId = null,
                selectedScheduleDivisionId = null,
                schedulePoolDivisionOptions = emptyList(),
                singleDivision = false,
                selectedDivisionId = "open",
            ).map { it.match.id },
        )
    }

    @Test
    fun givenSingleDivisionEvent_whenFilteringSchedule_thenAllMatchesRemain() {
        val matches = listOf(
            match(id = "open", division = "open"),
            match(id = "advanced", division = "advanced"),
        )

        assertEquals(
            matches,
            filterScheduleMatchesForDivision(
                matches = matches,
                tournamentPoolPlayEnabled = false,
                selectedSchedulePoolDivisionId = null,
                selectedScheduleDivisionId = null,
                schedulePoolDivisionOptions = emptyList(),
                singleDivision = true,
                selectedDivisionId = "open",
            ),
        )
    }

    private fun match(
        id: String,
        division: String,
    ): MatchWithRelations = MatchWithRelations(
        match = MatchMVP(
            matchId = id.hashCode(),
            eventId = "event-1",
            id = id,
            division = division,
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
}
