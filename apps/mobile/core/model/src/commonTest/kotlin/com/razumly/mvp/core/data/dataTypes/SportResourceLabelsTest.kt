package com.razumly.mvp.core.data.dataTypes

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class SportResourceLabelsTest {
    private val volleyball = SportDTO(
        name = "Volleyball",
        resourceLabelSingular = "Court",
        resourceLabelPlural = "Courts",
    ).toSport("volleyball")

    private val soccer = SportDTO(
        name = "Soccer",
        resourceLabelSingular = "Field",
        resourceLabelPlural = "Fields",
    ).toSport("soccer")

    @Test
    fun single_sport_and_scoped_multi_sport_views_use_sport_labels() {
        assertEquals(
            SportResourceLabels(singular = "Court", plural = "Courts"),
            resolveEventResourceLabels(listOf("volleyball"), listOf(volleyball, soccer)),
        )
        assertEquals(
            SportResourceLabels(singular = "Field", plural = "Fields"),
            resolveEventResourceLabels(
                sportIds = listOf("volleyball", "soccer"),
                sports = listOf(volleyball, soccer),
                resourceSportIds = listOf("soccer"),
            ),
        )
    }

    @Test
    fun unscoped_multi_sport_views_use_generic_labels() {
        assertEquals(
            GENERIC_SPORT_RESOURCE_LABELS,
            resolveEventResourceLabels(
                sportIds = listOf("volleyball", "soccer"),
                sports = listOf(volleyball, soccer),
            ),
        )
    }
    @Test
    fun canonical_resource_diagnostics_are_localized_for_the_presented_sport() {
        assertEquals(
            "Court court-a overlaps another Court.",
            SportResourceLabels("Court", "Courts")
                .inDiagnostic("Resource court-a overlaps another Resource."),
        )
    }


    @Test
    fun sport_rejects_blank_resource_labels() {
        assertFailsWith<IllegalArgumentException> {
            SportDTO(
                name = "Invalid",
                resourceLabelSingular = "",
                resourceLabelPlural = "Resources",
            ).toSport("invalid")
        }
    }
}
