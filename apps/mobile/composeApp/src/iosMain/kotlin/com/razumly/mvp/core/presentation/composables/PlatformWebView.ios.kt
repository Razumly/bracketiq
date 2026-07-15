@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.UIKitView
import com.razumly.mvp.core.util.EmbeddedWebUrlPolicy
import com.razumly.mvp.core.util.trustedEmbeddedWebUrlOrNull
import platform.CoreGraphics.CGRectMake
import platform.Foundation.NSURL
import platform.Foundation.NSURLRequest
import platform.WebKit.WKWebView
import platform.WebKit.WKWebViewConfiguration

@Composable
actual fun PlatformWebView(
    url: String,
    urlPolicy: EmbeddedWebUrlPolicy,
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
                loadUrlIfNeeded(url, urlPolicy)
            }
        },
        update = { webView ->
            webView.loadUrlIfNeeded(url, urlPolicy)
        },
    )
}

private fun WKWebView.loadUrlIfNeeded(
    url: String,
    urlPolicy: EmbeddedWebUrlPolicy,
) {
    val trustedTarget = trustedEmbeddedWebUrlOrNull(url, urlPolicy) ?: return
    val current = URL?.absoluteString?.trim()
    if (current == trustedTarget) return

    val nsUrl = NSURL.URLWithString(trustedTarget) ?: return
    loadRequest(NSURLRequest.requestWithURL(nsUrl))
}
