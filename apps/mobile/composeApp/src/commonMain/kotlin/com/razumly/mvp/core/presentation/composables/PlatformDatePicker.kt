@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Composable
expect fun PlatformDateTimePicker(
    onDateSelected: (Instant?) -> Unit,
    onDismissRequest: () -> Unit,
    showPicker: Boolean,
    getTime: Boolean,
    canSelectPast: Boolean,
    initialDate: Instant? = null,
)
