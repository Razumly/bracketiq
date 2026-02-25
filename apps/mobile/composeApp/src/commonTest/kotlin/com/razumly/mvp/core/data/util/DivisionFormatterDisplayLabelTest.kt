package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import kotlin.test.Test
import kotlin.test.assertEquals

class DivisionFormatterDisplayLabelTest {

    @Test
    fun to_division_display_label_prefers_clean_explicit_division_name() {
        val divisionId = buildEventDivisionId("event-1", "c_skill_open_age_u14")
        val label = divisionId.toDivisionDisplayLabel(
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionId,
                    key = "c_skill_open_age_u14",
                    name = "Champions",
                    divisionTypeName = "Open / U14",
                ),
            ),
        )

        assertEquals("Champions", label)
    }

    @Test
    fun to_division_display_label_ignores_legacy_skill_age_metadata_names() {
        val divisionId = buildEventDivisionId("event-1", "c_skill_open_age_u14")
        val label = divisionId.toDivisionDisplayLabel(
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionId,
                    key = "c_skill_open_age_u14",
                    name = "C - Skill: Open - Age: U14",
                    divisionTypeName = "Open / U14",
                ),
            ),
        )

        assertEquals("Open / U14", label)
    }

    @Test
    fun to_division_display_label_falls_back_to_inferred_name_when_type_name_is_blank() {
        val divisionId = buildEventDivisionId("event-1", "c_skill_open_age_u14")
        val label = divisionId.toDivisionDisplayLabel(
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionId,
                    key = "c_skill_open_age_u14",
                    name = "C - Skill: Open - Age: U14",
                    divisionTypeName = "",
                ),
            ),
        )

        assertEquals("Coed Open U14", label)
    }
}
