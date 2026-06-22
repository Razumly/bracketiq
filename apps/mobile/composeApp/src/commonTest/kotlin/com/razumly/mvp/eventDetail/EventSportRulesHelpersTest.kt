package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.SportDTO
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class EventSportRulesHelpersTest {

    @Test
    fun event_and_weekly_events_are_not_changed_by_sport_rules() {
        val event = Event(eventType = EventType.EVENT, sportId = "sets-sport", usesSets = true)
        val weeklyEvent = event.copy(eventType = EventType.WEEKLY_EVENT)
        val sports = listOf(sport("sets-sport", useSetScoring = true))

        assertSame(event, event.withSportRules(sports))
        assertSame(weeklyEvent, weeklyEvent.withSportRules(sports))
    }

    @Test
    fun league_set_scoring_normalizes_event_and_division_set_rules() {
        val event = Event(
            eventType = EventType.LEAGUE,
            sportId = "sets-sport",
            usesSets = false,
            setsPerMatch = 4,
            pointsToVictory = listOf(25, 15),
            matchDurationMinutes = 45,
            divisionDetails = listOf(
                DivisionDetail(
                    id = "division-1",
                    usesSets = false,
                    setsPerMatch = 3,
                    pointsToVictory = listOf(11),
                    matchDurationMinutes = 30,
                    playoffConfig = TournamentConfig(
                        usesSets = false,
                        winnerSetCount = 3,
                        loserSetCount = 5,
                        winnerBracketPointsToVictory = listOf(25),
                        loserBracketPointsToVictory = listOf(15, 15),
                        matchDurationMinutes = 20,
                    ),
                ),
            ),
        )

        val normalized = event.withSportRules(listOf(sport("sets-sport", useSetScoring = true)))
        val division = normalized.divisionDetails.single()
        val playoffConfig = division.playoffConfig ?: error("Expected playoff config")

        assertTrue(normalized.usesSets)
        assertEquals(1, normalized.setsPerMatch)
        assertEquals(listOf(25), normalized.pointsToVictory)
        assertNull(normalized.matchDurationMinutes)
        assertTrue(division.usesSets == true)
        assertEquals(3, division.setsPerMatch)
        assertEquals(listOf(11, 21, 21), division.pointsToVictory)
        assertNull(division.matchDurationMinutes)
        assertTrue(playoffConfig.usesSets)
        assertEquals(listOf(25, 21, 21), playoffConfig.winnerBracketPointsToVictory)
        assertEquals(listOf(15, 15, 21, 21, 21), playoffConfig.loserBracketPointsToVictory)
        assertNull(playoffConfig.matchDurationMinutes)
    }

    @Test
    fun league_timed_scoring_clears_set_rules_and_limits_bracket_points() {
        val event = Event(
            eventType = EventType.LEAGUE,
            sportId = "timed-sport",
            usesSets = true,
            setsPerMatch = 3,
            pointsToVictory = listOf(25, 15, 15),
            matchDurationMinutes = 50,
            winnerSetCount = 3,
            loserSetCount = 5,
            winnerBracketPointsToVictory = listOf(25, 21, 15),
            loserBracketPointsToVictory = listOf(15, 15, 11),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "division-1",
                    usesSets = true,
                    setsPerMatch = 3,
                    pointsToVictory = listOf(21, 15, 15),
                    matchDurationMinutes = 40,
                    playoffConfig = TournamentConfig(
                        usesSets = true,
                        winnerSetCount = 3,
                        loserSetCount = 3,
                        winnerBracketPointsToVictory = listOf(25, 21, 15),
                        loserBracketPointsToVictory = listOf(15, 15, 11),
                        matchDurationMinutes = 30,
                    ),
                ),
            ),
        )

        val normalized = event.withSportRules(listOf(sport("timed-sport", useSetScoring = false)))
        val division = normalized.divisionDetails.single()
        val playoffConfig = division.playoffConfig ?: error("Expected playoff config")

        assertFalse(normalized.usesSets)
        assertNull(normalized.setsPerMatch)
        assertEquals(emptyList(), normalized.pointsToVictory)
        assertEquals(50, normalized.matchDurationMinutes)
        assertEquals(1, normalized.winnerSetCount)
        assertEquals(1, normalized.loserSetCount)
        assertEquals(listOf(25), normalized.winnerBracketPointsToVictory)
        assertEquals(listOf(15), normalized.loserBracketPointsToVictory)
        assertFalse(division.usesSets == true)
        assertNull(division.setsPerMatch)
        assertEquals(emptyList(), division.pointsToVictory)
        assertEquals(40, division.matchDurationMinutes)
        assertFalse(playoffConfig.usesSets)
        assertEquals(1, playoffConfig.winnerSetCount)
        assertEquals(1, playoffConfig.loserSetCount)
        assertEquals(listOf(25), playoffConfig.winnerBracketPointsToVictory)
        assertEquals(listOf(15), playoffConfig.loserBracketPointsToVictory)
        assertEquals(30, playoffConfig.matchDurationMinutes)
    }

    @Test
    fun tournament_set_scoring_normalizes_bracket_set_counts_and_points() {
        val event = Event(
            eventType = EventType.TOURNAMENT,
            sportId = "sets-sport",
            usesSets = false,
            winnerSetCount = 2,
            loserSetCount = 5,
            winnerBracketPointsToVictory = listOf(25),
            loserBracketPointsToVictory = listOf(15, 15, 11, 11, 7, 7),
            matchDurationMinutes = 60,
            divisionDetails = listOf(
                DivisionDetail(
                    id = "division-1",
                    playoffConfig = TournamentConfig(
                        usesSets = false,
                        winnerSetCount = 4,
                        loserSetCount = 3,
                        winnerBracketPointsToVictory = listOf(25, 21),
                        loserBracketPointsToVictory = emptyList(),
                        matchDurationMinutes = 45,
                    ),
                ),
            ),
        )

        val normalized = event.withSportRules(listOf(sport("sets-sport", useSetScoring = true)))
        val playoffConfig = normalized.divisionDetails.single().playoffConfig ?: error("Expected playoff config")

        assertTrue(normalized.usesSets)
        assertEquals(1, normalized.winnerSetCount)
        assertEquals(5, normalized.loserSetCount)
        assertEquals(listOf(25), normalized.winnerBracketPointsToVictory)
        assertEquals(listOf(15, 15, 11, 11, 7), normalized.loserBracketPointsToVictory)
        assertNull(normalized.matchDurationMinutes)
        assertTrue(playoffConfig.usesSets)
        assertEquals(1, playoffConfig.winnerSetCount)
        assertEquals(3, playoffConfig.loserSetCount)
        assertEquals(listOf(25), playoffConfig.winnerBracketPointsToVictory)
        assertEquals(listOf(21, 21, 21), playoffConfig.loserBracketPointsToVictory)
        assertNull(playoffConfig.matchDurationMinutes)
    }

    private fun sport(
        id: String,
        useSetScoring: Boolean,
    ): Sport {
        return SportDTO(
            name = id,
            usePointsPerSetWin = useSetScoring,
        ).toSport(id)
    }
}
