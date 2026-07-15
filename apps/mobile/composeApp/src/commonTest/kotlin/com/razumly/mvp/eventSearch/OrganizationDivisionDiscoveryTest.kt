package com.razumly.mvp.eventSearch

import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameterOption
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameters
import com.razumly.mvp.core.data.dataTypes.OrganizationDivisionSummary
import com.razumly.mvp.core.data.dataTypes.SportSkillDivisionTypes
import com.razumly.mvp.eventSearch.tabs.organizations.composables.formatOrganizationDivisionSummary
import kotlin.test.Test
import kotlin.test.assertEquals

class OrganizationDivisionDiscoveryTest {
    private val parameters = DivisionTypeParameters(
        sportSkills = listOf(
            SportSkillDivisionTypes(
                sportId = "soccer",
                sportName = "Soccer",
                skills = listOf(
                    DivisionTypeParameterOption(id = "premier", name = "Premier"),
                    DivisionTypeParameterOption(id = "recreational", name = "Recreational"),
                ),
            ),
            SportSkillDivisionTypes(
                sportId = "volleyball",
                sportName = "Volleyball",
                skills = listOf(
                    DivisionTypeParameterOption(id = "open", name = "Open"),
                    DivisionTypeParameterOption(id = "recreational", name = "Recreational"),
                ),
            ),
        ),
    )

    @Test
    fun skill_options_are_filtered_to_the_selected_sport() {
        val options = buildOrganizationSkillFilterOptions(
            parameters = parameters,
            sports = emptyList(),
            selectedSportIds = setOf("soccer"),
        )

        assertEquals(listOf("Premier", "Recreational"), options.map { option -> option.label })
    }

    @Test
    fun skill_options_label_and_sort_multiple_sports() {
        val options = buildOrganizationSkillFilterOptions(
            parameters = parameters,
            sports = emptyList(),
            selectedSportIds = setOf("soccer", "volleyball"),
        )

        assertEquals(
            listOf(
                "Soccer · Premier",
                "Soccer, Volleyball · Recreational",
                "Volleyball · Open",
            ),
            options.map { option -> option.label },
        )
    }

    @Test
    fun organization_summary_formats_division_count_and_price_range() {
        assertEquals(
            "4 divisions · \$125–\$175",
            formatOrganizationDivisionSummary(
                OrganizationDivisionSummary(count = 4, minPrice = 12_500, maxPrice = 17_500),
            ),
        )
        assertEquals(
            "1 division · Price not specified",
            formatOrganizationDivisionSummary(OrganizationDivisionSummary(count = 1)),
        )
    }
}
