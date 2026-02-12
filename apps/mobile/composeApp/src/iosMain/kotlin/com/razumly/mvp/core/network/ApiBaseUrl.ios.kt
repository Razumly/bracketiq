package com.razumly.mvp.core.network

import com.razumly.mvp.core.util.AppSecrets
import io.github.aakira.napier.Napier

private const val DEFAULT_IOS_API_BASE_URL = "http://localhost:3000"

private fun rewriteLegacyLocalhost3001To3010(baseUrl: String): String {
    val localhostPrefixes = listOf(
        "http://localhost:3001",
        "https://localhost:3001",
        "http://127.0.0.1:3001",
        "https://127.0.0.1:3001",
    )
    val matchingPrefix = localhostPrefixes.firstOrNull { baseUrl.startsWith(it) } ?: return baseUrl
    return baseUrl.replaceFirst(matchingPrefix, matchingPrefix.replace(":3001", ":3010"))
}

private fun resolveIosApiBaseUrl(): String {
    val configured = AppSecrets.mvpApiBaseUrl.trim().trimEnd('/')
    if (configured.isBlank()) {
        Napier.w("apiBaseUrl(iOS): mvpApiBaseUrl missing; defaulting to $DEFAULT_IOS_API_BASE_URL")
        return DEFAULT_IOS_API_BASE_URL
    }

    val rewritten = rewriteLegacyLocalhost3001To3010(configured)
    if (rewritten != configured) {
        Napier.i("apiBaseUrl(iOS): rewriting localhost endpoint from $configured to $rewritten")
        return rewritten
    }

    Napier.i("apiBaseUrl(iOS): using configured endpoint $configured")
    return configured
}

actual val apiBaseUrl: String = resolveIosApiBaseUrl()
