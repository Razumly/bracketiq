package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import com.razumly.mvp.LocalNativeViewFactory
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.time.Duration.Companion.days

@Composable
actual fun PlatformDateTimePicker(
    onDateSelected: (Instant?) -> Unit,
    onDismissRequest: () -> Unit,
    showPicker: Boolean,
    getTime: Boolean,
    canSelectPast: Boolean
) {
    // Get the current time and calculate min/max dates
    val now = Clock.System.now()
    val minDate = if (canSelectPast) now - (2 * 365).days else now
    val maxDate = now + (2 * 365).days

    val factory = LocalNativeViewFactory.current

    if (showPicker) {
        factory.createNativePlatformDatePicker(
            initialDate = now,
            minDate = minDate,
            maxDate = maxDate,
            getTime = getTime,
            onDateSelected = onDateSelected,
            onDismissRequest = onDismissRequest
        )
    }
}