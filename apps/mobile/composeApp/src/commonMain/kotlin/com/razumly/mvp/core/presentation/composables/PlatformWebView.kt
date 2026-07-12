package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.util.EmbeddedWebUrlPolicy

@Composable
expect fun PlatformWebView(
    url: String,
    urlPolicy: EmbeddedWebUrlPolicy = EmbeddedWebUrlPolicy.SIGNING,
    modifier: Modifier = Modifier,
)
