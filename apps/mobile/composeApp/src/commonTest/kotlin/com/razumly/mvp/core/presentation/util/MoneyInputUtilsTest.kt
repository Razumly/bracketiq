package com.razumly.mvp.core.presentation.util

import androidx.compose.ui.text.AnnotatedString
import com.razumly.mvp.core.util.CurrencyAmountInputVisualTransformation
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

    @Test
    fun centBackedMoneyInput_rendersCurrencyInsteadOfRawCents() {
        val transformation = CurrencyAmountInputVisualTransformation()

        assertEquals("\$0.10", transformation.filter(AnnotatedString("10")).text.text)
        assertEquals("\$10.00", transformation.filter(AnnotatedString("1000")).text.text)
        assertEquals("\$1,234.56", transformation.filter(AnnotatedString("123456")).text.text)
    }
}
