package com.razumly.mvp.core.presentation.util

import kotlin.math.round

object MoneyInputUtils {

    fun moneyInputFilter(input: String): String {
        return input.filter(Char::isDigit).trimStart('0')
    }

    /**
     * Converts display value to cents (for backend storage)
     */
    fun displayValueToCents(displayValue: String): Int {
        val cleanValue = displayValue.replace(Regex("[^\\d.]"), "")
        return try {
            (cleanValue.toDouble() * 100).toInt()
        } catch (e: NumberFormatException) {
            0
        }
    }

    /**
     * Converts cents to display value with proper formatting
     * Cross-platform compatible formatting
     */
    fun centsToDisplayValue(cents: Int): String {
        val sign = if (cents < 0) "-" else ""
        val absoluteCents = if (cents < 0) -cents.toLong() else cents.toLong()
        val wholePart = absoluteCents / 100
        val fractionalPart = absoluteCents % 100
        return "$sign$wholePart.${fractionalPart.toString().padStart(2, '0')}"
    }

    /**
     * Cross-platform compatible currency formatting
     * Formats a double to string with exactly 2 decimal places
     */
    private fun formatDoubleToCurrency(value: Double): String {
        return centsToDisplayValue(round(value * 100).toInt())
    }

    /**
     * Alternative formatting method using string manipulation
     * More reliable across all platforms
     */
    fun formatCurrency(value: Double): String {
        return formatDoubleToCurrency(value)
    }
}
