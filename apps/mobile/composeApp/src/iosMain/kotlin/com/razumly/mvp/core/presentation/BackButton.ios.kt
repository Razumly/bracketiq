package com.razumly.mvp.core.presentation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
actual fun PlatformBackButton(
    onBack: () -> Unit,
    modifier: Modifier
) {
    BackButton(
        onBack = onBack,
        modifier = modifier
    )
}