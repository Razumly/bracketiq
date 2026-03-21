package com.razumly.mvp.core.network

import com.razumly.mvp.core.util.AppSecrets
import io.github.aakira.napier.Napier
import platform.Foundation.NSProcessInfo
import platform.Foundation.NSURL

private const val DEFAULT_IOS_API_BASE_URL = "http://localhost:3000"
private const val SIMULATOR_ENV_KEY = "SIMULATOR_DEVICE_NAME"
private const val NGROK_HOST_TOKEN = "ngrok"
private const val UNSET_WEB_BASE_URL = "__MVP_WEB_BASE_URL_UNSET__"
private const val LOCALHOST_HOST = "localhost"
private const val LOOPBACK_HOST = "127.0.0.1"
private const val EMULATOR_HOST_ALIAS = "10.0.2.2"

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

private fun isIosSimulator(): Boolean {
    val env = NSProcessInfo.processInfo.environment
    return env[SIMULATOR_ENV_KEY] != null
}

private fun resolveIosApiBaseUrl(): String {
    val configured = AppSecrets.mvpApiBaseUrl.trim().trimEnd('/')
    val remoteConfigured = AppSecrets.mvpApiBaseUrlRemote.trim().trimEnd('/')
    val runningOnSimulator = isIosSimulator()

    if (!runningOnSimulator && remoteConfigured.isNotBlank()) {
        Napier.i("apiBaseUrl(iOS): using remote endpoint $remoteConfigured")
        return remoteConfigured
    }

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

private fun isLikelyNgrokUrl(url: String): Boolean = url.contains(NGROK_HOST_TOKEN, ignoreCase = true)

private fun isLocalHostUrl(url: String): Boolean {
    if (url.isBlank()) return false
    val host = NSURL(string = url)?.host?.lowercase() ?: return false
    return host == LOCALHOST_HOST || host == LOOPBACK_HOST || host == EMULATOR_HOST_ALIAS
}

private fun resolveStripeRedirectBaseUrl(resolvedApiBaseUrl: String): String {
    val normalizedApi = resolvedApiBaseUrl.trim().trimEnd('/')
    val remoteConfigured = AppSecrets.mvpApiBaseUrlRemote.trim().trimEnd('/')
    val webConfigured = AppSecrets.mvpWebBaseUrl.trim().trimEnd()
        .takeUnless { it.equals(UNSET_WEB_BASE_URL, ignoreCase = true) }
        .orEmpty()

    if (webConfigured.isNotBlank()) {
        Napier.i("stripeRedirectBaseUrl(iOS): using mvpWebBaseUrl=$webConfigured")
        return webConfigured
    }

    if (isLikelyNgrokUrl(remoteConfigured) && isLocalHostUrl(normalizedApi)) {
        Napier.i("stripeRedirectBaseUrl(iOS): using ngrok remote endpoint $remoteConfigured")
        return remoteConfigured
    }

    if (normalizedApi.isNotBlank()) {
        Napier.i("stripeRedirectBaseUrl(iOS): using api endpoint $normalizedApi")
        return normalizedApi
    }

    Napier.w("stripeRedirectBaseUrl(iOS): mvpApiBaseUrl missing; defaulting to $DEFAULT_IOS_API_BASE_URL")
    return DEFAULT_IOS_API_BASE_URL
}

actual val stripeRedirectBaseUrl: String = resolveStripeRedirectBaseUrl(apiBaseUrl)
