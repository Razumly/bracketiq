package com.razumly.mvp.core.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.net.toUri

actual class UrlHandler(private val context: Context) {
    actual suspend fun openUrlInWebView(url: String): Result<String> {
        return try {
            val targetUri = url.toUri()
            val scheme = targetUri.scheme?.lowercase()
            if (scheme == "http" || scheme == "https") {
                val customTabsIntent = CustomTabsIntent.Builder().build()
                customTabsIntent.launchUrl(context, targetUri)
            } else {
                val intent = Intent(Intent.ACTION_VIEW, targetUri).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            }

            Result.success("opened")
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
