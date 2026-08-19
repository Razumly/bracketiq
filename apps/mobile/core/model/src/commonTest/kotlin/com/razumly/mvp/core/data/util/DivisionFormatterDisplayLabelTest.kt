package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import kotlin.test.Test
import kotlin.test.assertEquals

class DivisionFormatterDisplayLabelTest {
    @Test
    fun generatedPoolWithoutNameUsesPoolLabel() {
        val divisionId = "event-1__division__open_pool_a"

        val label = divisionId.toDivisionDisplayLabel(
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionId,
                    key = "open_pool_a",
                    name = "",
                    isSystemGenerated = true,
                ),
            ),
        )

        assertEquals("Pool A", label)
    }

    @Test
    fun organizerOwnedPoolShapedDivisionUsesNormalDivisionInference() {
        val divisionId = "event-1__division__open_pool_a"

        val label = divisionId.toDivisionDisplayLabel(
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionId,
                    key = "open_pool_a",
                    name = "",
                    isSystemGenerated = false,
                ),
            ),
        )

        assertEquals(divisionId.toDivisionDisplayLabel(), label)
    }

    @Test
    fun explicitOrganizerDivisionNameAlwaysWins() {
        val divisionId = "event-1__division__open_pool_a"

        val label = divisionId.toDivisionDisplayLabel(
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionId,
                    key = "open_pool_a",
                    name = "Beginner Pool",
                    isSystemGenerated = false,
                ),
            ),
        )

        assertEquals("Beginner Pool", label)
    }
}
