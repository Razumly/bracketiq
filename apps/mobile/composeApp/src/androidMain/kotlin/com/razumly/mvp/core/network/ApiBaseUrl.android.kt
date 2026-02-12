package com.razumly.mvp.core.network

import com.razumly.mvp.BuildConfig
import io.github.aakira.napier.Napier
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URI

private const val DEFAULT_LOCAL_API_PORT = 3000
private const val FALLBACK_LOCAL_API_PORT = 3001
private const val PORT_CHECK_TIMEOUT_MS = 150

private val localHosts = setOf("localhost", "127.0.0.1", "10.0.2.2")

private fun isPortOpen(host: String, port: Int): Boolean {
    return runCatching {
        Socket().use { socket ->
            socket.connect(InetSocketAddress(host, port), PORT_CHECK_TIMEOUT_MS)
        }
        true
    }.getOrDefault(false)
}

private fun resolveApiBaseUrl(baseUrl: String): String {
    val normalized = baseUrl.trim().trimEnd('/')
    val uri = runCatching { URI(normalized) }.getOrElse { return normalized }
    val host = uri.host ?: return normalized
    val configuredPort = uri.port.takeIf { it > 0 } ?: return normalized

    if (configuredPort != DEFAULT_LOCAL_API_PORT || host.lowercase() !in localHosts) {
        return normalized
    }

    if (isPortOpen(host, DEFAULT_LOCAL_API_PORT)) {
        return normalized
    }

    if (!isPortOpen(host, FALLBACK_LOCAL_API_PORT)) {
        return normalized
    }

    val fallback = URI(
        uri.scheme,
        uri.userInfo,
        host,
        FALLBACK_LOCAL_API_PORT,
        uri.path,
        uri.query,
        uri.fragment
    ).toString().trimEnd('/')

    Napier.i("apiBaseUrl: using fallback endpoint $fallback (configured $normalized is down)")
    return fallback
}

actual val apiBaseUrl: String = resolveApiBaseUrl(BuildConfig.MVP_API_BASE_URL)
