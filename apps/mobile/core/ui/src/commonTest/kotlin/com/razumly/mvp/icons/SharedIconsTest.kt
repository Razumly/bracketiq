package com.razumly.mvp.icons

import kotlin.test.Test
import kotlin.test.assertEquals

class SharedIconsTest {
    @Test
    fun productIconNamesMatchTheSharedCatalog() {
        assertEquals(
            listOf("ProductTrophy", "ProductTournamentBracket", "ProductGroups"),
            listOf(
                SharedIcons.Trophy.name,
                SharedIcons.TournamentBracket.name,
                SharedIcons.Groups.name,
            ),
        )
    }
}
