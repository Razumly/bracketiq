package com.razumly.mvp.core.presentation.util

import kotlin.math.round

object MoneyInputUtils {

    /**
     * Filters input to allow only valid money format
     * - Only digits and single decimal point
     * - Maximum 2 decimal places
     * - No leading zeros (except 0.xx)
     */
    fun moneyInputFilter(input: String): String {
        // Remove any non-digit and non-decimal characters
        val filtered = input.filter { it.isDigit() || it == '.' }

        // Handle empty input
        if (filtered.isEmpty()) return ""

        // Handle single decimal point
        if (filtered == ".") return "0."

        // Split by decimal point
        val parts = filtered.split(".")

        return when {
            // No decimal point
            parts.size == 1 -> {
                val integerPart = parts[0].trimStart('0').takeIf { it.isNotEmpty() } ?: "0"
                integerPart
            }
            // One decimal point
            parts.size == 2 -> {
                val integerPart = parts[0].trimStart('0').takeIf { it.isNotEmpty() } ?: "0"
                val decimalPart = parts[1].take(2) // Limit to 2 decimal places
                "$integerPart.$decimalPart"
            }
            // Multiple decimal points - take only first two parts
            else -> {
                val integerPart = parts[0].trimStart('0').takeIf { it.isNotEmpty() } ?: "0"
                val decimalPart = parts[1].take(2)
                "$integerPart.$decimalPart"
            }
        }
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
        val dollars = cents / 100.0
        return formatDoubleToCurrency(dollars)
    }

    /**
     * Cross-platform compatible currency formatting
     * Formats a double to string with exactly 2 decimal places
     */
    private fun formatDoubleToCurrency(value: Double): String {
        // Round to 2 decimal places
        val roundedValue = round(value * 100) / 100

        // Convert to string and handle decimal places manually
        val integerPart = roundedValue.toInt()
        val decimalPart = ((roundedValue - integerPart) * 100).toInt()

        return if (decimalPart == 0) {
            "$integerPart.00"
        } else if (decimalPart < 10) {
            "$integerPart.0$decimalPart"
        } else {
            "$integerPart.$decimalPart"
        }
    }

    /**
     * Alternative formatting method using string manipulation
     * More reliable across all platforms
     */
    fun formatCurrency(value: Double): String {
        val rounded = round(value * 100) / 100
        val wholePart = rounded.toInt()
        val fractionalPart = round((rounded - wholePart) * 100).toInt()

        return "$wholePart.${fractionalPart.toString().padStart(2, '0')}"
    }
}
