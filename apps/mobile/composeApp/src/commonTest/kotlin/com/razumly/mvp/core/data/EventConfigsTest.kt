package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.LeagueConfig
import com.razumly.mvp.core.data.dataTypes.withLeagueConfig
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventConfigsTest {

    @Test
    fun withLeagueConfig_timed_mode_normalizes_playoff_set_config_to_single_set() {
        val initial = Event(
            usesSets = true,
            winnerSetCount = 5,
            loserSetCount = 3,
            winnerBracketPointsToVictory = listOf(25, 21, 21),
            loserBracketPointsToVictory = listOf(15, 15, 15),
        )

        val updated = initial.withLeagueConfig(
            LeagueConfig(
                usesSets = false,
                matchDurationMinutes = 50,
                setsPerMatch = 5,
                pointsToVictory = listOf(21, 21, 21, 21, 21),
            )
        )

        assertFalse(updated.usesSets)
        assertEquals(1, updated.winnerSetCount)
        assertEquals(1, updated.loserSetCount)
        assertEquals(listOf(25), updated.winnerBracketPointsToVictory)
        assertEquals(listOf(15), updated.loserBracketPointsToVictory)
    }

    @Test
    fun withLeagueConfig_set_mode_keeps_existing_playoff_set_config() {
        val initial = Event(
            usesSets = false,
            winnerSetCount = 3,
            loserSetCount = 1,
            winnerBracketPointsToVictory = listOf(21, 19, 15),
            loserBracketPointsToVictory = listOf(15),
        )

        val updated = initial.withLeagueConfig(
            LeagueConfig(
                usesSets = true,
                setsPerMatch = 3,
                setDurationMinutes = 20,
                pointsToVictory = listOf(21, 21, 15),
            )
        )

        assertTrue(updated.usesSets)
        assertEquals(3, updated.winnerSetCount)
        assertEquals(1, updated.loserSetCount)
        assertEquals(listOf(21, 19, 15), updated.winnerBracketPointsToVictory)
        assertEquals(listOf(15), updated.loserBracketPointsToVictory)
    }

    @Test
    fun withLeagueConfig_disabling_team_refs_clears_team_ref_swap_flag() {
        val initial = Event(
            doTeamsRef = true,
            teamRefsMaySwap = true,
        )

        val updated = initial.withLeagueConfig(
            LeagueConfig(
                doTeamsRef = false,
            )
        )

        assertEquals(false, updated.doTeamsRef)
        assertEquals(false, updated.teamRefsMaySwap)
    }
}
