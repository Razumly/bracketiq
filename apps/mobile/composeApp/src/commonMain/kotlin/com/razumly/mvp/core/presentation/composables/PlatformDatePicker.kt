package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import kotlinx.datetime.Instant

@Composable
expect fun PlatformDateTimePicker(
    onDateSelected: (Instant?) -> Unit,
    onDismissRequest: () -> Unit,
    showPicker: Boolean,
    getTime: Boolean,
    canSelectPast: Boolean,
)