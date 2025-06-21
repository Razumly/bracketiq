package com.razumly.mvp.core.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.net.toUri

actual class UrlHandler(private val context: Context) {
    actual suspend fun openUrlInWebView(url: String): Result<String> {
        return try {
            val customTabsIntent = CustomTabsIntent.Builder().build()
            customTabsIntent.launchUrl(context, url.toUri())

            Result.success("opened")
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
