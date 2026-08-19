package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

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
                    divisionTypeName = "Open U14",
                ),
            ),
        )

        assertEquals("Champions", label)
    }

    @Test
    fun to_division_display_label_preserves_name_that_normalizes_to_identifier() {
        val label = "division_open".toDivisionDisplayLabel(
            divisionDetails = listOf(
                DivisionDetail(
                    id = "division_open",
                    key = "open",
                    name = "DIVISION  OPEN",
                    divisionTypeName = "Open",
                ),
            ),
        )

        assertEquals("DIVISION  OPEN", label)
    }

    @Test
    fun to_division_display_label_preserves_explicit_metadata_like_name() {
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

        assertEquals("C - Skill: Open - Age: U14", label)
    }

    @Test
    fun to_division_display_label_preserves_explicit_name_when_type_name_is_blank() {
        val divisionId = buildEventDivisionId("event-1", "c_skill_open_age_u14")
        val label = divisionId.toDivisionDisplayLabel(
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionId,
                    key = "c_skill_open_age_u14",
                    name = "Open /  U14",
                    divisionTypeName = "",
                ),
            ),
        )

        assertEquals("Open /  U14", label)
    }

    @Test
    fun to_division_display_label_preserves_generated_pool_name() {
        val bracketId = buildEventDivisionId("event-1", "c_skill_open_age_18plus")
        val poolId = "${bracketId}_pool_a"
        val label = poolId.toDivisionDisplayLabel(
            divisionDetails = listOf(
                DivisionDetail(
                    id = poolId,
                    key = "c_skill_open_age_18plus_pool_a",
                    name = "Pool A",
                    playoffPlacementDivisionIds = listOf(bracketId),
                ),
            ),
        )

        assertEquals("Pool A", label)
    }

    @Test
    fun to_division_display_label_derives_clean_composite_label_without_details() {
        val divisionId = buildEventDivisionId("event-1", "c_skill_open_age_18plus")

        assertEquals("CoEd Open 18+", divisionId.toDivisionDisplayLabel())
    }

    @Test
    fun divisions_equivalent_does_not_merge_distinct_event_division_ids_with_same_type_token() {
        val firstDivisionId = "event-dup__division__m_skill_open_age_18plus"
        val secondDivisionId = "event-dup_2__division__m_skill_open_age_18plus"

        assertFalse(divisionsEquivalent(firstDivisionId, secondDivisionId))
        assertTrue(divisionsEquivalent(firstDivisionId, "m_skill_open_age_18plus"))
    }
}
