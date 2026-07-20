package com.razumly.mvp.core.presentation.composables

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PhoneInputFormattingTest {
    @Test
    fun given_digits_when_typed_then_phone_is_formatted_incrementally() {
        val formatted = "5035550142".fold("") { current, digit ->
            formatPhoneInput(current + digit)
        }

        assertEquals("(503) 555-0142", formatted)
    }

    @Test
    fun given_formatted_phone_when_backspacing_then_punctuation_does_not_stick() {
        var value = formatPhoneInput("5035550142")
        val values = buildList {
            while (value.isNotEmpty()) {
                value = formatPhoneInput(value.dropLast(1))
                add(value)
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
}
