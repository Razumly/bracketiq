package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class LeagueSportRulesTest : MainDispatcherTest() {
    private val setBasedSport = createSport(
        id = "sport-sets",
        usePointsPerSetWin = true,
    )
    private val timedSport = createSport(
        id = "sport-timed",
        usePointsPerSetWin = false,
    )

    @Test
    fun given_set_based_league_when_updating_match_structure_then_sets_are_normalized() = runTest(testDispatcher) {
        val harness = CreateEventHarness(sports = listOf(setBasedSport, timedSport))
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()

        harness.component.updateEventField {
            copy(
                sportId = setBasedSport.id,
                setsPerMatch = 3,
                setDurationMinutes = null,
                matchDurationMinutes = null,
                pointsToVictory = listOf(25),
            )
        }
        advance()

        val updated = harness.component.newEventState.value
        assertTrue(updated.usesSets)
        assertEquals(3, updated.setsPerMatch)
        assertEquals(20, updated.setDurationMinutes)
        assertEquals(60, updated.matchDurationMinutes)
        assertEquals(listOf(25, 21, 21), updated.pointsToVictory)
    }

    @Test
    fun given_timed_league_when_updating_match_structure_then_set_fields_are_cleared() = runTest(testDispatcher) {
        val harness = CreateEventHarness(sports = listOf(setBasedSport, timedSport))
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()

        harness.component.updateEventField {
            copy(
                sportId = timedSport.id,
                usesSets = true,
                setsPerMatch = 5,
                setDurationMinutes = 25,
                matchDurationMinutes = 45,
                pointsToVictory = listOf(21, 21, 21, 21, 21),
                winnerSetCount = 5,
                loserSetCount = 3,
                winnerBracketPointsToVictory = listOf(25, 21, 21),
                loserBracketPointsToVictory = listOf(15, 15, 15),
            )
        }
        advance()

        val updated = harness.component.newEventState.value
        assertFalse(updated.usesSets)
        assertEquals(null, updated.setsPerMatch)
        assertEquals(null, updated.setDurationMinutes)
        assertEquals(45, updated.matchDurationMinutes)
        assertEquals(emptyList(), updated.pointsToVictory)
        assertEquals(1, updated.winnerSetCount)
        assertEquals(1, updated.loserSetCount)
        assertEquals(listOf(25), updated.winnerBracketPointsToVictory)
        assertEquals(listOf(15), updated.loserBracketPointsToVictory)
    }

    @Test
    fun given_timed_tournament_when_updating_playoff_sets_then_tournament_defaults_to_single_set() = runTest(testDispatcher) {
        val harness = CreateEventHarness(sports = listOf(setBasedSport, timedSport))
        advance()

        harness.component.onTypeSelected(EventType.TOURNAMENT)
        advance()

        harness.component.updateTournamentField {
            copy(
                sportId = timedSport.id,
                winnerSetCount = 5,
                loserSetCount = 3,
                winnerBracketPointsToVictory = listOf(30, 30),
                loserBracketPointsToVictory = emptyList(),
            )
        }
        advance()

        val updated = harness.component.newEventState.value
        assertFalse(updated.usesSets)
        assertEquals(null, updated.setDurationMinutes)
        assertEquals(60, updated.matchDurationMinutes)
        assertEquals(1, updated.winnerSetCount)
        assertEquals(1, updated.loserSetCount)
        assertEquals(listOf(30), updated.winnerBracketPointsToVictory)
        assertEquals(listOf(21), updated.loserBracketPointsToVictory)
    }

    @Test
    fun given_set_based_tournament_when_invalid_set_counts_then_counts_and_points_are_constrained() = runTest(testDispatcher) {
        val harness = CreateEventHarness(sports = listOf(setBasedSport, timedSport))
        advance()

        harness.component.onTypeSelected(EventType.TOURNAMENT)
        advance()

        harness.component.updateTournamentField {
            copy(
                sportId = setBasedSport.id,
                winnerSetCount = 4,
                loserSetCount = 5,
                winnerBracketPointsToVictory = listOf(25),
                loserBracketPointsToVictory = listOf(15, 15),
            )
        }
        advance()

        val updated = harness.component.newEventState.value
        assertTrue(updated.usesSets)
        assertEquals(20, updated.setDurationMinutes)
        assertEquals(60, updated.matchDurationMinutes)
        assertEquals(1, updated.winnerSetCount)
        assertEquals(5, updated.loserSetCount)
        assertEquals(listOf(25), updated.winnerBracketPointsToVictory)
        assertEquals(listOf(15, 15, 21, 21, 21), updated.loserBracketPointsToVictory)
    }
}
