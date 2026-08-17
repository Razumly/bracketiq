package com.razumly.mvp.core.presentation.composables

import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
actual fun PlatformLoadingIndicator(
    modifier: Modifier,
) {
    CircularProgressIndicator(modifier = modifier)
}
