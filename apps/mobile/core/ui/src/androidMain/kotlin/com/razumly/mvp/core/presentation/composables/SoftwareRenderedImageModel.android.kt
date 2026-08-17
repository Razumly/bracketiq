package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import coil3.request.ImageRequest
import coil3.request.allowHardware

@Composable
actual fun rememberSoftwareRenderedImageModel(data: String?): Any? {
    val context = LocalContext.current
    val normalizedData = data?.trim()?.takeIf { it.isNotBlank() }
    return remember(context, normalizedData) {
        normalizedData?.let { imageData ->
            ImageRequest.Builder(context)
                .data(imageData)
                .allowHardware(false)
                .build()
        }
    }
}
