@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.UIKitView
import platform.UIKit.UIActivityIndicatorView
import platform.UIKit.UIActivityIndicatorViewStyleMedium

@Composable
actual fun PlatformLoadingIndicator(
    modifier: Modifier,
) {
    UIKitView(
        modifier = modifier,
        factory = {
            UIActivityIndicatorView(activityIndicatorStyle = UIActivityIndicatorViewStyleMedium).apply {
                hidesWhenStopped = false
                startAnimating()
            }
        },
        update = { indicator ->
            indicator.startAnimating()
        },
    )
}
