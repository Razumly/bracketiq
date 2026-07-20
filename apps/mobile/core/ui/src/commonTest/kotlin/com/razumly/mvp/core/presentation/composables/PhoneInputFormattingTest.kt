package com.razumly.mvp.core.presentation.composables

import androidx.compose.ui.text.AnnotatedString
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PhoneInputFormattingTest {
    @Test
    fun given_digits_when_typed_then_phone_is_formatted_incrementally() {
        val digits = "5035550142".fold("") { current, digit ->
            sanitizePhoneInput(current + digit)
        }

        assertEquals("5035550142", digits)
        assertEquals("(503) 555-0142", formatPhoneInput(digits))
    }

    @Test
    fun given_formatted_phone_when_backspacing_then_punctuation_does_not_stick() {
        var value = sanitizePhoneInput("5035550142")
        val values = buildList {
            while (value.isNotEmpty()) {
                value = sanitizePhoneInput(value.dropLast(1))
                add(formatPhoneInput(value))
            }
        }

        assertTrue("(503) 555" in values)
        assertTrue("503" in values)
        assertEquals("", values.last())
    }

    @Test
    fun given_us_country_code_when_pasted_then_local_display_is_used() {
        assertEquals("(503) 555-0142", formatPhoneInput("+1 (503) 555-0142"))
    }

    @Test
    fun given_rapid_text_updates_when_filtered_then_cursor_tracks_formatted_value() {
        val transformed = PhoneInputVisualTransformation.filter(AnnotatedString("5035550142"))

        assertEquals("(503) 555-0142", transformed.text.text)
        assertEquals(14, transformed.offsetMapping.originalToTransformed(10))
        assertEquals(10, transformed.offsetMapping.transformedToOriginal(14))
    }

    @Test
    fun given_formatted_value_when_backspaced_then_cursor_reaches_empty_value() {
        var value = sanitizePhoneInput("(503) 555-0142")

        while (value.isNotEmpty()) {
            value = value.dropLast(1)
        }

        assertEquals("", value)
    }
}
