package com.razumly.mvp.android

import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

fun instantToDateTimeString(instant: Instant): String {
    return instant.toLocalDateTime(timeZone = TimeZone.currentSystemDefault()).toString()
}