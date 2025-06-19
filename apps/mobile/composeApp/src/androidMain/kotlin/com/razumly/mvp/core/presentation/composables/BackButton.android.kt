package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

@Composable
actual fun PlatformBackButton(
    onBack: () -> Unit,
    modifier: Modifier,
    text: String,
    tintColor: Color,
    arrow: Boolean
) {
}