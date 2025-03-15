package com.razumly.mvp.core.presentation.util

import androidx.compose.animation.core.Easing
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.runtime.snapshotFlow
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format.MonthNames
import kotlinx.datetime.format.char
import kotlinx.datetime.toLocalDateTime
import kotlin.math.abs
import kotlin.math.roundToInt

fun instantToDateTimeString(instant: Instant): String {
    return instant.toLocalDateTime(timeZone = TimeZone.currentSystemDefault()).toString()
}

@Composable
expect fun getScreenWidth(): Int

val timeFormat = LocalTime.Format {
    amPmHour()
    char(':')
    minute()
    char(':')
    second()
    char(' ')
    amPmMarker("AM", "PM")
}

val dateFormat = LocalDate.Format {
    dayOfMonth()
    char(' ')
    monthName(MonthNames.ENGLISH_ABBREVIATED)
}

val dateTimeFormat = LocalDateTime.Format {
    dayOfMonth()
    char(' ')
    monthName(MonthNames.ENGLISH_ABBREVIATED)
    char(',')
    char(' ')
    year()
    char('-')
    amPmHour()
    char(':')
    minute()
    char(' ')
    amPmMarker("AM", "PM")

}

@Composable
fun LazyListState.isScrollingUp(): State<Boolean> {
    return produceState(initialValue = true) {
        var lastIndex = 0
        var lastScroll = Int.MAX_VALUE
        snapshotFlow {
            firstVisibleItemIndex to firstVisibleItemScrollOffset
        }.collect { (currentIndex, currentScroll) ->
            if (currentIndex != lastIndex || currentScroll != lastScroll) {
                value = currentIndex < lastIndex ||
                        (currentIndex == lastIndex && currentScroll < lastScroll)
                lastIndex = currentIndex
                lastScroll = currentScroll
            }
        }
    }
}

fun String.toTitleCase(): String {
    return this
        .lowercase()
        .split(" ")
        .joinToString(" ") { word ->
            word.replaceFirstChar { char ->
                char.uppercase()
            }
        }
}

fun cleanup(input: String): String {
    val number = input.toDoubleOrNull() ?: return "0.00"
    // Multiply by 100 and round to get the nearest hundredth as an integer.
    val rounded = (number * 100).roundToInt()
    val whole = rounded / 100
    // Use absolute value for the fractional part to handle negatives properly.
    val fraction = abs(rounded % 100)
    // Format the fractional part to always have two digits.
    return "$whole.${if (fraction < 10) "0" else ""}$fraction"
}