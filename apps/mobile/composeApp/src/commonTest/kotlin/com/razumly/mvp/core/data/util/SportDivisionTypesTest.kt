package com.razumly.mvp.core.data.util

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class SportDivisionTypesTest {

    @Test
    fun given_indoor_volleyball_when_loading_division_type_options_then_volleyball_specific_skill_levels_are_returned() {
        val skillOptions = getDivisionTypeOptionsForSport("Indoor Volleyball")
            .filter { option -> option.ratingType == DivisionRatingType.SKILL }

        assertEquals(listOf("open", "aa", "a", "bb", "b", "c"), skillOptions.map { option -> option.id })
        assertFalse(skillOptions.any { option -> option.id == "beginner" })
    }

    @Test
    fun given_indoor_soccer_when_resolving_division_types_then_soccer_alias_catalog_is_used() {
        val defaults = getDefaultDivisionTypeSelectionsForSport("Indoor Soccer")
        val recreational = getDivisionTypeById("Indoor Soccer", "rec", DivisionRatingType.SKILL)

        assertEquals("open", defaults.skillDivisionTypeId)
        assertEquals("18plus", defaults.ageDivisionTypeId)
        assertNotNull(recreational)
        assertEquals("Recreational", recreational.name)
    }

    @Test
    fun given_unknown_sport_when_loading_division_type_options_then_generic_fallbacks_are_available() {
        val options = getDivisionTypeOptionsForSport("Kickball")

        assertTrue(options.any { option ->
            option.ratingType == DivisionRatingType.SKILL && option.id == "beginner"
        })
        assertTrue(options.any { option ->
            option.ratingType == DivisionRatingType.AGE && option.id == "18plus"
        })
    }
}
