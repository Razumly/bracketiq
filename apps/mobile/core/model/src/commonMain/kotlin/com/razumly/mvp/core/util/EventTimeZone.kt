package com.razumly.mvp.core.util

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import kotlinx.datetime.TimeZone

fun String?.toTimeZoneOrUtc(fallback: TimeZone = TimeZone.UTC): TimeZone {
    val candidate = this?.trim()?.takeIf(String::isNotBlank) ?: return fallback
    return runCatching { TimeZone.of(candidate) }.getOrDefault(fallback)
}

fun Event.resolvedTimeZone(): TimeZone = timeZone.toTimeZoneOrUtc()

fun TimeSlot.resolvedTimeZone(fallback: TimeZone = TimeZone.UTC): TimeZone = timeZone.toTimeZoneOrUtc(fallback)
