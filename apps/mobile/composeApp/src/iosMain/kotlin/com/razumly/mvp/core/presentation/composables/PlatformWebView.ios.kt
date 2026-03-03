@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.UIKitView
import platform.CoreGraphics.CGRectMake
import platform.Foundation.NSURL
import platform.Foundation.NSURLRequest
import platform.WebKit.WKWebView
import platform.WebKit.WKWebViewConfiguration

@Composable
actual fun PlatformWebView(
    url: String,
    modifier: Modifier,
) {
    UIKitView(
        modifier = modifier,
        factory = {
            val configuration = WKWebViewConfiguration()
            WKWebView(
                frame = CGRectMake(0.0, 0.0, 0.0, 0.0),
                configuration = configuration,
            ).apply {
                allowsBackForwardNavigationGestures = true
                loadUrlIfNeeded(url)
            }
        },
        update = { webView ->
            webView.loadUrlIfNeeded(url)
        },
    )
}

private fun WKWebView.loadUrlIfNeeded(url: String) {
    if (url.isBlank()) return

    val normalizedTarget = url.trim()
    val current = URL?.absoluteString?.trim()
    if (current == normalizedTarget) return

    val nsUrl = NSURL.URLWithString(normalizedTarget) ?: return
    loadRequest(NSURLRequest.requestWithURL(nsUrl))
}
