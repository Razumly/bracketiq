package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.presentation.composables.DropdownOption
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class EventDetailsDivisionEditorHelpersTest {

    @Test
    fun build_division_token_formats_components() {
        val token = buildDivisionToken(
            gender = "F",
            ratingType = "SKILL",
            divisionTypeId = "A",
        )

        assertEquals("f_skill_a", token)
    }

    @Test
    fun parse_division_token_uses_detail_key_when_present() {
        val parsed = parseDivisionToken(
            DivisionDetail(
                id = "event-1__division__f_skill_a",
                key = "f_skill_a",
                divisionTypeId = "a",
                ratingType = "SKILL",
                gender = "F",
            ),
        )

        assertEquals("F", parsed.gender)
        assertEquals("SKILL", parsed.ratingType)
        assertEquals("a", parsed.divisionTypeId)
    }

    @Test
    fun parse_division_token_falls_back_to_detail_fields_when_key_missing() {
        val parsed = parseDivisionToken(
            DivisionDetail(
                id = "event-1__division__open",
                key = "",
                divisionTypeId = "open",
                ratingType = "AGE",
                gender = "C",
            ),
        )

        assertEquals("C", parsed.gender)
        assertEquals("AGE", parsed.ratingType)
        assertEquals("open", parsed.divisionTypeId)
    }

    @Test
    fun build_division_type_options_filters_by_rating_type_and_includes_existing_values() {
        val options = buildDivisionTypeOptions(
            selectedRatingType = "AGE",
            existingDetails = listOf(
                DivisionDetail(
                    id = "event-1__division__c_age_u14",
                    key = "c_age_u14",
                    divisionTypeId = "u14",
                    divisionTypeName = "U14",
                    ratingType = "AGE",
                    gender = "C",
                ),
                DivisionDetail(
                    id = "event-1__division__m_skill_b",
                    key = "m_skill_b",
                    divisionTypeId = "b",
                    divisionTypeName = "B",
                    ratingType = "SKILL",
                    gender = "M",
                ),
            ),
        )

        val values = options.map { option -> option.value }.toSet()
        assertTrue(values.contains("u14"))
        assertTrue(values.contains("u18"))
        assertTrue(!values.contains("open"))
    }

    @Test
    fun resolve_division_type_name_prefers_existing_detail_name_then_fallback_options() {
        val existingDetails = listOf(
            DivisionDetail(
                id = "event-1__division__m_skill_a",
                key = "m_skill_a",
                divisionTypeId = "a",
                divisionTypeName = "Advanced",
                ratingType = "SKILL",
                gender = "M",
            ),
        )

        val fromExisting = resolveDivisionTypeName(
            divisionTypeId = "a",
            ratingType = "SKILL",
            existingDetails = existingDetails,
            fallbackOptions = emptyList(),
        )
        val fromFallback = resolveDivisionTypeName(
            divisionTypeId = "u16",
            ratingType = "AGE",
            existingDetails = existingDetails,
            fallbackOptions = listOf(
                DropdownOption(value = "u16", label = "U16"),
            ),
        )

        assertEquals("Advanced", fromExisting)
        assertEquals("U16", fromFallback)
    }

    @Test
    fun default_division_editor_state_applies_minimum_values() {
        val state = defaultDivisionEditorState(
            defaultPriceCents = -1,
            defaultMaxParticipants = 0,
            defaultPlayoffTeamCount = 1,
        )

        assertEquals(0, state.priceCents)
        assertEquals(2, state.maxParticipants)
        assertEquals(2, state.playoffTeamCount)
    }

    @Test
    fun build_division_name_uses_gender_prefix() {
        assertEquals("Men's Open", buildDivisionName("M", "Open"))
        assertEquals("Women's Open", buildDivisionName("F", "Open"))
        assertEquals("Coed Open", buildDivisionName("C", "Open"))
    }
}
