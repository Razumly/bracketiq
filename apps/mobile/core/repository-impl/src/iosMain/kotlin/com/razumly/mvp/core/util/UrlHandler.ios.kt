package com.razumly.mvp.core.util

import io.github.aakira.napier.Napier
import platform.Foundation.NSURL
import platform.UIKit.UIApplication
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

private fun sanitizeUrlForIosOpen(url: String): String {
    // Stripe OAuth URLs include nested query keys like stripe_user[email].
    // iOS URL parsing is stricter than Android/browser paste, so escape raw brackets
    // before creating NSURL to preserve the original query semantics.
    return url
        .replace("[", "%5B")
        .replace("]", "%5D")
}

actual class UrlHandler {
    actual suspend fun openUrlInWebView(url: String): Result<String> {
        return suspendCoroutine { continuation ->
            try {
                Napier.i("Opening URL on iOS: $url", tag = "Stripe")
                val sanitizedUrl = sanitizeUrlForIosOpen(url)
                if (sanitizedUrl != url) {
                    Napier.i("Sanitized URL for iOS open: $sanitizedUrl", tag = "Stripe")
                }
                val nsUrl = NSURL.URLWithString(sanitizedUrl)
                if (nsUrl == null) {
                    continuation.resume(Result.failure(Exception("Invalid URL")))
                    return@suspendCoroutine
                }
                Napier.i("NSURL absoluteString on iOS: ${nsUrl.absoluteString ?: "<null>"}", tag = "Stripe")

                UIApplication.sharedApplication.openURL(
                    url = nsUrl,
                    options = emptyMap<Any?, Any?>(),
                    completionHandler = { opened ->
                        if (opened) {
                            continuation.resume(Result.success("opened"))
                        } else {
                            continuation.resume(Result.failure(Exception("Unable to open URL")))
                        }
                    },
                )
            } catch (e: Exception) {
                continuation.resume(Result.failure(e))
            }
        }
    }
}
