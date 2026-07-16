package com.razumly.mvp.eventDetail.composables

import kotlin.test.Test
import kotlin.test.assertEquals

class MatchCardTypographyTest {

    @Test
    fun fixed_bracket_font_size_offsets_accessibility_font_scaling() {
        assertEquals(14f, fixedBracketFontSizeSp(baseSizeSp = 14f, fontScale = 1f))
        assertEquals(9.333333f, fixedBracketFontSizeSp(baseSizeSp = 14f, fontScale = 1.5f))
        assertEquals(7f, fixedBracketFontSizeSp(baseSizeSp = 14f, fontScale = 2f))
    }

    @Test
    fun fixed_bracket_font_size_handles_an_invalid_scale() {
        assertEquals(14f, fixedBracketFontSizeSp(baseSizeSp = 14f, fontScale = 0f))
    }
}
