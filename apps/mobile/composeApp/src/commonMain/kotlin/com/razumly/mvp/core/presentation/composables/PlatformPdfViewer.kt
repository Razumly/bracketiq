package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
expect fun PlatformPdfViewer(
    bytes: ByteArray,
    modifier: Modifier = Modifier,
)
