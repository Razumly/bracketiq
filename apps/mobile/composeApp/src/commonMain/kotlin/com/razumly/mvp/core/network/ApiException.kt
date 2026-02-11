package com.razumly.mvp.core.network

class ApiException(
    val statusCode: Int,
    val url: String,
    val responseBody: String?,
) : Exception("HTTP $statusCode for $url${responseBody?.let { ": $it" } ?: ""}")
