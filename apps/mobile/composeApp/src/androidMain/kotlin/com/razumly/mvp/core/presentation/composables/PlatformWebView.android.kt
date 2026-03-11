package com.razumly.mvp.core.presentation.composables

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
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
import io.github.aakira.napier.Napier

@SuppressLint("SetJavaScriptEnabled")
@Composable
actual fun PlatformWebView(
    url: String,
    modifier: Modifier,
) {
    val context = LocalContext.current
    val webView = remember {
        WebView(context).apply {
            val parentWebView = this
            settings.javaScriptEnabled = true
            settings.javaScriptCanOpenWindowsAutomatically = true
            settings.setSupportMultipleWindows(true)
            settings.domStorageEnabled = true
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            settings.setSupportZoom(true)
            settings.builtInZoomControls = true
            settings.displayZoomControls = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            settings.mediaPlaybackRequiresUserGesture = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                settings.safeBrowsingEnabled = true
            }
            // Some providers block in-app webviews when user-agent contains "; wv".
            settings.userAgentString = settings.userAgentString
                ?.replace("; wv", "")
                ?: settings.userAgentString
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    return handleNonHttpScheme(context, request?.url?.toString())
                }

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?,
                ) {
                    if (request?.isForMainFrame == true) {
                        Napier.e(
                            "WebView main frame load error: code=${error?.errorCode}, " +
                                "description=${error?.description}, url=${request.url}",
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
                                "reason=${errorResponse?.reasonPhrase}, url=${request.url}",
                        )
                    }
                }

                override fun onReceivedSslError(
                    view: WebView?,
                    handler: SslErrorHandler?,
                    error: SslError?,
                ) {
                    Napier.e("WebView SSL error: primaryError=${error?.primaryError}, url=${error?.url}")
                    handler?.cancel()
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onCreateWindow(
                    view: WebView?,
                    isDialog: Boolean,
                    isUserGesture: Boolean,
                    resultMsg: android.os.Message?,
                ): Boolean {
                    val transport = resultMsg?.obj as? WebView.WebViewTransport ?: return false
                    val popupWebView = WebView(context).apply {
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(
                                view: WebView?,
                                request: WebResourceRequest?,
                            ): Boolean {
                                val popupUrl = request?.url?.toString()
                                if (!popupUrl.isNullOrBlank()) {
                                    parentWebView.post {
                                        if (!handleNonHttpScheme(context, popupUrl)) {
                                            parentWebView.loadUrl(popupUrl)
                                        }
                                    }
                                }
                                view?.destroy()
                                return true
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                if (!url.isNullOrBlank()) {
                                    parentWebView.post {
                                        if (!handleNonHttpScheme(context, url)) {
                                            parentWebView.loadUrl(url)
                                        }
                                    }
                                }
                                view?.destroy()
                            }
                        }
                    }
                    transport.webView = popupWebView
                    resultMsg.sendToTarget()
                    return true
                }
            }
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
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
            val normalizedUrl = url.trim()
            if (normalizedUrl.isNotBlank() && view.url != normalizedUrl) {
                view.loadUrl(normalizedUrl)
            }
        },
    )
}

private fun handleNonHttpScheme(context: Context, rawUrl: String?): Boolean {
    val targetUrl = rawUrl?.trim().orEmpty()
    if (targetUrl.isBlank()) return false

    val uri = runCatching { Uri.parse(targetUrl) }.getOrNull() ?: return false
    val scheme = uri.scheme?.lowercase().orEmpty()
    if (scheme == "http" || scheme == "https") return false

    return try {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            },
        )
        true
    } catch (_: ActivityNotFoundException) {
        false
    }
}
