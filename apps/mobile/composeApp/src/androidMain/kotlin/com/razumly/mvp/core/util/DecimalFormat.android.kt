package com.razumly.mvp.core.util


actual class DecimalFormat {
    private val df = java.text.DecimalFormat()
    actual fun format(double: Double): String {
        df.isGroupingUsed = false
        df.isDecimalSeparatorAlwaysShown = false
        return df.format(double)
    }
}