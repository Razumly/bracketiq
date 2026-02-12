package com.razumly.mvp.core.network

import com.razumly.mvp.BuildConfig
import io.github.aakira.napier.Napier
import java.net.URI

private const val EMULATOR_HOST_ALIAS = "10.0.2.2"
private const val LOOPBACK_HOST = "127.0.0.1"

private fun buildUrl(uri: URI, host: String, port: Int): String {
    return URI(
        uri.scheme,
        uri.userInfo,
        host,
        port,
        uri.path,
        uri.query,
        uri.fragment
    ).toString().trimEnd('/')
}

private fun resolveApiBaseUrl(baseUrl: String): String {
    val normalized = baseUrl.trim().trimEnd('/')
    val uri = runCatching { URI(normalized) }.getOrElse { return normalized }
    val host = uri.host ?: return normalized
    val configuredPort = uri.port.takeIf { it > 0 } ?: return normalized

    if (host == EMULATOR_HOST_ALIAS) {
        val rewritten = buildUrl(uri, LOOPBACK_HOST, configuredPort)
        Napier.i(
            "apiBaseUrl(android): rewriting emulator host alias from $normalized to $rewritten " +
                "(expects adb reverse tcp:$configuredPort tcp:$configuredPort)"
        )
        return rewritten
    }

    Napier.i("apiBaseUrl(android): using configured endpoint $normalized")
    return normalized
}

actual val apiBaseUrl: String = resolveApiBaseUrl(BuildConfig.MVP_API_BASE_URL)
