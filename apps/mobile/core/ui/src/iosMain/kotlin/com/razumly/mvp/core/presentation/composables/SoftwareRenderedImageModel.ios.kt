package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember

@Composable
actual fun rememberSoftwareRenderedImageModel(data: String?): Any? {
    val normalizedData = data?.trim()?.takeIf { it.isNotBlank() }
    return remember(normalizedData) { normalizedData }
}
