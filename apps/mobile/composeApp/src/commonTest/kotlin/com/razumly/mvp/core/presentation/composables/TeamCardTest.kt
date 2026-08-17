package com.razumly.mvp.core.presentation.composables

import kotlin.test.Test
import kotlin.test.assertEquals

class TeamCardTest {
    @Test
    fun givenPlayerCountHidden_whenBuildingTeamSubtitle_thenOnlyManagerIsShown() {
        val subtitle = teamCardSubtitle(
            managerName = "Jayden Lapatskiy",
            rosterSlotCount = 2,
            teamSize = 5,
            showPlayerCount = false,
        )

        assertEquals("Manager: Jayden Lapatskiy", subtitle)
    }

    @Test
    fun givenPlayerCountVisible_whenBuildingTeamSubtitle_thenRosterCountIsShown() {
        val subtitle = teamCardSubtitle(
            managerName = "Jayden Lapatskiy",
            rosterSlotCount = 2,
            teamSize = 5,
            showPlayerCount = true,
        )

        assertEquals("Manager: Jayden Lapatskiy | 2/5 players", subtitle)
    }
}
