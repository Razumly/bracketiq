package com.razumly.mvp.core.presentation.util

import kotlin.test.Test
import kotlin.test.assertEquals

class MoneyInputUtilsTest {
    @Test
    fun centsToDisplayValue_preservesExactCents() {
        assertEquals("12.79", MoneyInputUtils.centsToDisplayValue(1279))
    }

    @Test
    fun centsToDisplayValue_formatsNegativeCents() {
        assertEquals("-12.79", MoneyInputUtils.centsToDisplayValue(-1279))
    }
}
