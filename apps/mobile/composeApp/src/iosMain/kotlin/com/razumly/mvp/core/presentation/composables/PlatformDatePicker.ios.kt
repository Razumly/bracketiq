package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.UIKitViewController
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.zIndex
import com.razumly.mvp.LocalNativeViewFactory
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.time.Duration.Companion.days

@Composable
actual fun PlatformDateTimePicker(
    onDateSelected: (Instant?) -> Unit,
    onDismissRequest: () -> Unit,
    showPicker: Boolean
) {
    // Get the current time and calculate min/max dates
    val now = Clock.System.now()
    val minDate = now
    val maxDate = now + (2 * 365).days

    val factory = LocalNativeViewFactory.current

    if (showPicker) {
        factory.createNativePlatformDatePicker(
            initialDate = now,
            minDate = minDate,
            maxDate = maxDate,
            onDateSelected = onDateSelected,
            onDismissRequest = onDismissRequest
        )
    }
}