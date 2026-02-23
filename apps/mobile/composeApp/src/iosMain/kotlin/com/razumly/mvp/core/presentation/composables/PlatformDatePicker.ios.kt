package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import com.razumly.mvp.LocalNativeViewFactory
import kotlin.time.Clock
import kotlin.time.Duration.Companion.days
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Composable
@OptIn(ExperimentalTime::class)
actual fun PlatformDateTimePicker(
    onDateSelected: (Instant?) -> Unit,
    onDismissRequest: () -> Unit,
    showPicker: Boolean,
    getTime: Boolean,
    canSelectPast: Boolean,
    initialDate: Instant?,
) {
    // Get the current time and calculate min/max dates
    val now = Clock.System.now()
    val minDate = if (canSelectPast) now - (120 * 365).days else now
    val maxDate = now + (2 * 365).days
    val requestedInitialDate = initialDate ?: now
    val clampedInitialDate = when {
        requestedInitialDate < minDate -> minDate
        requestedInitialDate > maxDate -> maxDate
        else -> requestedInitialDate
    }

    val factory = LocalNativeViewFactory.current

    val latestOnDateSelected by rememberUpdatedState(onDateSelected)
    val latestOnDismissRequest by rememberUpdatedState(onDismissRequest)

    LaunchedEffect(showPicker, getTime, canSelectPast, clampedInitialDate) {
        if (!showPicker) return@LaunchedEffect
        factory.createNativePlatformDatePicker(
            initialDate = clampedInitialDate,
            minDate = minDate,
            maxDate = maxDate,
            getTime = getTime,
            onDateSelected = latestOnDateSelected,
            onDismissRequest = latestOnDismissRequest,
        )
    }
}
