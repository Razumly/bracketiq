package com.razumly.mvp.core.util

expect class UrlHandler {
    suspend fun openUrlInWebView(url: String): Result<String>
}