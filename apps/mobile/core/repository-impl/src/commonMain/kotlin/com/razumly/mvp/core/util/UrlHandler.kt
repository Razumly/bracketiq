package com.razumly.mvp.core.util

expect class UrlHandler {
    suspend fun openUrlInWebView(url: String): Result<String>
    suspend fun openDirectionsUrl(url: String): Result<String>
}
