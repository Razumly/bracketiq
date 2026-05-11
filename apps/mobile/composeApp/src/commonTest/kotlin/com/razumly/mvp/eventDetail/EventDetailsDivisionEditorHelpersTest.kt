package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.util.buildEventDivisionId
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameterOption
import com.razumly.mvp.core.presentation.composables.DropdownOption
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class EventDetailsDivisionEditorHelpersTest {

    @Test
    fun build_division_token_formats_components() {
        val token = buildDivisionToken(
            gender = "F",
            skillDivisionTypeId = "A",
            ageDivisionTypeId = "U18",
        )

        assertEquals("f_skill_a_age_u18", token)
    }

    @Test
    fun parse_division_token_uses_detail_key_when_present() {
        val parsed = parseDivisionToken(
            DivisionDetail(
                id = "event-1__division__f_skill_a_age_u18",
                key = "f_skill_a_age_u18",
                skillDivisionTypeId = "a",
                ageDivisionTypeId = "u18",
                gender = "F",
            ),
        )

        assertEquals("F", parsed.gender)
        assertEquals("a", parsed.skillDivisionTypeId)
        assertEquals("u18", parsed.ageDivisionTypeId)
    }

    @Test
    fun parse_division_token_falls_back_to_detail_fields_when_key_missing() {
        val parsed = parseDivisionToken(
            DivisionDetail(
                id = "event-1__division__open",
                key = "",
                gender = "C",
                skillDivisionTypeId = "b",
                ageDivisionTypeId = "u16",
            ),
        )

        assertEquals("C", parsed.gender)
        assertEquals("b", parsed.skillDivisionTypeId)
        assertEquals("u16", parsed.ageDivisionTypeId)
    }

    @Test
    fun build_division_type_options_use_sport_catalog_and_existing_values() {
        val existingDetails = listOf(
            DivisionDetail(
                id = "event-1__division__c_skill_b_age_u14",
                key = "c_skill_b_age_u14",
                skillDivisionTypeId = "b",
                skillDivisionTypeName = "B",
                ageDivisionTypeId = "u14",
                ageDivisionTypeName = "U14",
                gender = "C",
            ),
        )
        val skillDivisionTypes = listOf(
            DivisionTypeParameterOption(
                id = "open",
                name = "Open",
            ),
        )
        val ageDivisionTypes = listOf(
            DivisionTypeParameterOption(
                id = "u18",
                name = "U18",
            ),
        )

        val skillOptions = buildSkillDivisionTypeOptions(existingDetails, skillDivisionTypes)
        val ageOptions = buildAgeDivisionTypeOptions(existingDetails, ageDivisionTypes)

        val skillValues = skillOptions.map { option -> option.value }.toSet()
        val ageValues = ageOptions.map { option -> option.value }.toSet()

        assertTrue(skillValues.contains("open"))
        assertTrue(skillValues.contains("b"))
        assertTrue(ageValues.contains("u18"))
        assertTrue(ageValues.contains("u14"))
    }

    @Test
    fun build_division_type_options_do_not_emit_hardcoded_fallback_values() {
        val skillOptions = buildSkillDivisionTypeOptions(existingDetails = emptyList())
        val ageOptions = buildAgeDivisionTypeOptions(existingDetails = emptyList())
        val genderOptions = buildGenderOptions(existingDetails = emptyList())

        assertEquals(emptyList(), skillOptions)
        assertEquals(emptyList(), ageOptions)
        assertEquals(emptyList(), genderOptions)
    }

    @Test
    fun build_division_type_options_do_not_use_full_division_names_as_component_labels() {
        val existingDetails = listOf(
            DivisionDetail(
                id = "event-1__division__c_skill_bb_age_18plus",
                key = "c_skill_bb_age_18plus",
                skillDivisionTypeId = "bb",
                skillDivisionTypeName = "CoEd BB 18+",
                ageDivisionTypeId = "18plus",
                ageDivisionTypeName = "CoEd BB 18+",
                gender = "C",
            ),
        )

        val skillOption = buildSkillDivisionTypeOptions(existingDetails).first { option -> option.value == "bb" }
        val ageOption = buildAgeDivisionTypeOptions(existingDetails).first { option -> option.value == "18plus" }

        assertEquals("BB", skillOption.label)
        assertEquals("18+", ageOption.label)
    }

    @Test
    fun resolve_division_type_name_prefers_existing_detail_name_then_fallback_options() {
        val existingDetails = listOf(
            DivisionDetail(
                id = "event-1__division__m_skill_a_age_u18",
                key = "m_skill_a_age_u18",
                skillDivisionTypeId = "a",
                skillDivisionTypeName = "Advanced",
                ageDivisionTypeId = "u18",
                ageDivisionTypeName = "U18",
                gender = "M",
            ),
        )

        val fromExisting = resolveDivisionTypeName(
            divisionTypeId = "a",
            existingDetails = existingDetails,
            fallbackOptions = emptyList(),
        )
        val fromFallback = resolveDivisionTypeName(
            divisionTypeId = "u16",
            existingDetails = existingDetails,
            fallbackOptions = listOf(
                DropdownOption(value = "u16", label = "U16"),
            ),
        )

        assertEquals("Advanced", fromExisting)
        assertEquals("U16", fromFallback)
    }

    @Test
    fun resolve_division_type_name_ignores_full_division_name_component_values() {
        val existingDetails = listOf(
            DivisionDetail(
                id = "event-1__division__c_skill_bb_age_18plus",
                key = "c_skill_bb_age_18plus",
                skillDivisionTypeId = "bb",
                skillDivisionTypeName = "CoEd BB 18+",
                ageDivisionTypeId = "18plus",
                ageDivisionTypeName = "CoEd BB 18+",
                gender = "C",
            ),
        )

        val skillName = resolveDivisionTypeName(
            divisionTypeId = "bb",
            existingDetails = existingDetails,
            fallbackOptions = emptyList(),
        )
        val ageName = resolveDivisionTypeName(
            divisionTypeId = "18plus",
            existingDetails = existingDetails,
            fallbackOptions = emptyList(),
        )

        assertEquals("BB", skillName)
        assertEquals("18+", ageName)
    }

    @Test
    fun default_division_editor_state_keeps_missing_default_max_empty() {
        val state = defaultDivisionEditorState(
            defaultPriceCents = -1,
            defaultMaxParticipants = 0,
            defaultPlayoffTeamCount = 1,
            defaultAllowPaymentPlans = true,
            defaultInstallmentCount = 2,
            defaultInstallmentDueDates = listOf("  ", "2026-02-01T00:00:00Z"),
            defaultInstallmentAmounts = listOf(-50, 100),
        )

        assertEquals(0, state.priceCents)
        assertEquals(null, state.maxParticipants)
        assertEquals(2, state.playoffTeamCount)
        assertEquals("", state.gender)
        assertEquals("", state.skillDivisionTypeId)
        assertEquals("", state.ageDivisionTypeId)
        assertEquals("", state.name)
        assertEquals(false, state.allowPaymentPlans)
        assertEquals(0, state.installmentCount)
    }

    @Test
    fun build_division_dropdown_options_deduplicates_detail_id_and_key() {
        val detail = DivisionDetail(
            id = "event-1__division__f_skill_bb_age_u11",
            key = "f_skill_bb_age_u11",
            name = "Women's BB U11",
            skillDivisionTypeId = "bb",
            skillDivisionTypeName = "BB",
            ageDivisionTypeId = "u11",
            ageDivisionTypeName = "U11",
            gender = "F",
        )

        val options = buildDivisionDropdownOptions(
            existingDetails = listOf(detail),
            selectedDivisionIds = listOf(detail.id, detail.key),
        )

        assertEquals(1, options.size)
        assertEquals(detail.id, options.single().value)
        assertEquals("Women's BB U11", options.single().label)
    }

    @Test
    fun build_division_name_uses_gender_prefix() {
        assertEquals("Men's Open U18", buildDivisionName("M", "Open", "U18"))
        assertEquals("Women's Open U18", buildDivisionName("F", "Open", "U18"))
        assertEquals("Coed Open U18", buildDivisionName("C", "Open", "U18"))
    }

    @Test
    fun resolve_division_type_name_formats_trailing_u_tokens_consistently() {
        val label = resolveDivisionTypeName(
            divisionTypeId = "12u",
            existingDetails = emptyList(),
            fallbackOptions = emptyList(),
        )

        assertEquals("U12", label)
    }

    @Test
    fun build_unique_division_id_for_token_scopes_suffix_to_event_segment() {
        val token = "c_skill_open_age_u18"
        val existingIds = listOf(
            buildEventDivisionId("event-1", token),
            buildEventDivisionId("event-1_2", token),
        )

        val nextId = buildUniqueDivisionIdForToken(
            eventId = "event-1",
            divisionToken = token,
            existingDivisionIds = existingIds,
        )

        assertEquals(buildEventDivisionId("event-1_3", token), nextId)
    }

    @Test
    fun normalize_division_name_key_is_case_and_whitespace_insensitive() {
        assertEquals("group alpha", "  Group   Alpha ".normalizeDivisionNameKey())
        assertEquals("group alpha", "group alpha".normalizeDivisionNameKey())
    }

    @Test
    fun default_division_editor_state_keeps_default_pool_count() {
        val state = defaultDivisionEditorState(
            defaultPriceCents = 0,
            defaultMaxParticipants = 12,
            defaultPlayoffTeamCount = 6,
            defaultPoolCount = 3,
            defaultAllowPaymentPlans = false,
            defaultInstallmentCount = null,
            defaultInstallmentDueDates = emptyList(),
            defaultInstallmentAmounts = emptyList(),
        )

        assertEquals(3, state.poolCount)
    }
}
