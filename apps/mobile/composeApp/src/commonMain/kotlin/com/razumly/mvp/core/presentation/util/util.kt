package com.razumly.mvp.core.presentation.util

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

fun instantToDateTimeString(instant: Instant): String {
    return instant.toLocalDateTime(timeZone = TimeZone.currentSystemDefault()).toString()
}

@Composable
expect fun getScreenWidth(): Int