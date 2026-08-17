package com.razumly.mvp.core.presentation.util

object MoneyInputUtils {

    fun moneyInputFilter(input: String): String {
        return input.filter(Char::isDigit).trimStart('0')
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

}
