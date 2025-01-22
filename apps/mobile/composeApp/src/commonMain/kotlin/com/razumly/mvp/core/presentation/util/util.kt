package com.razumly.mvp.core.presentation.util

import androidx.compose.runtime.Composable
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format.char
import kotlinx.datetime.toLocalDateTime

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