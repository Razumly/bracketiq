@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import kotlin.time.Duration.Companion.days
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Composable
expect fun PlatformDateTimePicker(
    onDateSelected: (Instant?) -> Unit,
    onDismissRequest: () -> Unit,
    showPicker: Boolean,
    getTime: Boolean,
    showDate: Boolean = true,
    canSelectPast: Boolean,
    canSelectFuture: Boolean = true,
    initialDate: Instant? = null,
)

/**
 * The native pickers use different date APIs, so keep the inclusive calendar-day
 * policy here and apply it from the platform implementations.
 */
internal fun isPlatformDateSelectable(
    selectedEpochDay: Long,
    todayEpochDay: Long,
    canSelectPast: Boolean,
    canSelectFuture: Boolean,
): Boolean =
    (canSelectPast || selectedEpochDay >= todayEpochDay) &&
        (canSelectFuture || selectedEpochDay <= todayEpochDay)

internal fun platformDatePickerMaximumDate(
    now: Instant,
    canSelectFuture: Boolean,
): Instant = if (canSelectFuture) now + (2 * 365).days else now
