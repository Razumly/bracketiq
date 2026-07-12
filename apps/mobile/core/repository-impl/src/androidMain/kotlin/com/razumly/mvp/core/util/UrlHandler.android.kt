package com.razumly.mvp.core.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.net.toUri
import io.github.aakira.napier.Napier

actual class UrlHandler(private val context: Context) {
    actual suspend fun openUrlInWebView(url: String): Result<String> {
        val trustedUrl = trustedExternalHttpsUrlOrNull(url)
            ?: return Result.failure(IllegalArgumentException("Only secure HTTPS links can be opened."))

        return try {
            Napier.i("Opening trusted external URL on Android.", tag = "ExternalLink")
            launchCustomTab(trustedUrl.toUri())
            Result.success("opened")
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    actual suspend fun openDirectionsUrl(url: String): Result<String> {
        val trustedUrl = trustedDirectionsUrlOrNull(url)
            ?: return Result.failure(IllegalArgumentException("Invalid directions URL."))

        return try {
            val targetUri = trustedUrl.toUri()
            if (targetUri.scheme.equals("https", ignoreCase = true)) {
                launchCustomTab(targetUri)
            } else {
                context.startActivity(
                    Intent(Intent.ACTION_VIEW, targetUri).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    },
                )
            }
            Result.success("opened")
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun launchCustomTab(targetUri: Uri) {
        val customTabsIntent = CustomTabsIntent.Builder().build()
        customTabsIntent.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        customTabsIntent.launchUrl(context, targetUri)
    }
}
