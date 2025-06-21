package com.razumly.mvp.core.util

import platform.Foundation.NSURL
import platform.UIKit.UIApplication

actual class UrlHandler {
    actual suspend fun openUrlInWebView(url: String): Result<String> {
        return try {
            val nsUrl =
                NSURL.URLWithString(url) ?: return Result.failure(Exception("Invalid URL"))

            UIApplication.sharedApplication.openURL(nsUrl)

            Result.success("opened")
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
