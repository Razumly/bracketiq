package com.razumly.mvp.core.presentation.composables

import android.annotation.SuppressLint
import android.net.http.SslError
import android.os.Build
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.razumly.mvp.core.util.EmbeddedWebUrlPolicy
import com.razumly.mvp.core.util.trustedEmbeddedWebUrlOrNull
import io.github.aakira.napier.Napier

@SuppressLint("SetJavaScriptEnabled")
@Composable
actual fun PlatformWebView(
    url: String,
    urlPolicy: EmbeddedWebUrlPolicy,
    modifier: Modifier,
) {
    val context = LocalContext.current
    val trustedUrl = remember(url, urlPolicy) {
        trustedEmbeddedWebUrlOrNull(url, urlPolicy)
    }
    val webView = remember(urlPolicy) {
        WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.domStorageEnabled = true
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            settings.setSupportZoom(true)
            settings.builtInZoomControls = true
            settings.displayZoomControls = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.mediaPlaybackRequiresUserGesture = true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                settings.safeBrowsingEnabled = true
            }
            // Some providers block in-app webviews when user-agent contains "; wv".
            settings.userAgentString = settings.userAgentString
                ?.replace("; wv", "")
                ?: settings.userAgentString
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean =
                    trustedEmbeddedWebUrlOrNull(request?.url?.toString(), urlPolicy) == null

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?,
                ) {
                    if (request?.isForMainFrame == true) {
                        Napier.e(
                            "WebView main frame load error: code=${error?.errorCode}, " +
                                "description=${error?.description}",
                        )
                    }
                }

                override fun onReceivedHttpError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    errorResponse: WebResourceResponse?,
                ) {
                    if (request?.isForMainFrame == true) {
                        Napier.w(
                            "WebView main frame HTTP error: status=${errorResponse?.statusCode}, " +
                                "reason=${errorResponse?.reasonPhrase}",
                        )
                    }
                }

                override fun onReceivedSslError(
                    view: WebView?,
                    handler: SslErrorHandler?,
                    error: SslError?,
                ) {
                    Napier.e("WebView SSL error: primaryError=${error?.primaryError}")
                    handler?.cancel()
                }
            }
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
        }
    }

    DisposableEffect(webView) {
        onDispose {
            webView.stopLoading()
            webView.destroy()
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { webView },
        update = { view ->
            if (trustedUrl != null && view.url != trustedUrl) {
                view.loadUrl(trustedUrl)
            }
        },
    )
}
