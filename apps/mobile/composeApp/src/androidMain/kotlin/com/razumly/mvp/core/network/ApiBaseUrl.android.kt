package com.razumly.mvp.core.network

import android.os.Build
import com.razumly.mvp.BuildConfig
import io.github.aakira.napier.Napier
import java.net.URI

private const val EMULATOR_HOST_ALIAS = "10.0.2.2"
private const val LOOPBACK_HOST = "127.0.0.1"
private const val LOCALHOST_HOST = "localhost"
private const val NGROK_HOST_TOKEN = "ngrok"
private const val UNSET_WEB_BASE_URL = "__MVP_WEB_BASE_URL_UNSET__"

private fun isEmulator(): Boolean {
    val fingerprint = Build.FINGERPRINT.lowercase()
    return fingerprint.startsWith("generic") ||
        fingerprint.startsWith("unknown") ||
        Build.MODEL.contains("google_sdk", ignoreCase = true) ||
        Build.MODEL.contains("emulator", ignoreCase = true) ||
        Build.MODEL.contains("sdk_gphone", ignoreCase = true) ||
        Build.BRAND.startsWith("generic") ||
        Build.DEVICE.startsWith("generic") ||
        Build.MANUFACTURER.contains("genymotion", ignoreCase = true) ||
        Build.PRODUCT.contains("sdk", ignoreCase = true)
}

private fun resolveApiBaseUrl(baseUrl: String, remoteBaseUrl: String): String {
    val normalized = baseUrl.trim().trimEnd('/')
    val normalizedRemote = remoteBaseUrl.trim().trimEnd('/')
    val runningOnEmulator = isEmulator()

    if (!runningOnEmulator) {
        if (normalizedRemote.isNotBlank()) {
            Napier.i("apiBaseUrl(android): using remote endpoint $normalizedRemote")
            return normalizedRemote
        }

        val uri = runCatching { URI(normalized) }.getOrElse { return normalized }
        val host = uri.host ?: return normalized
        if (host == EMULATOR_HOST_ALIAS || host == LOOPBACK_HOST || host == LOCALHOST_HOST) {
            Napier.w(
                "apiBaseUrl(android): remote endpoint missing; configured local host $normalized " +
                    "will not be reachable on a physical device."
            )
        } else {
            Napier.i("apiBaseUrl(android): using configured endpoint $normalized")
        }
        return normalized
    }

    Napier.i("apiBaseUrl(android): using configured endpoint $normalized")
    return normalized
}

private fun isLikelyNgrokUrl(url: String): Boolean {
    if (url.isBlank()) return false
    return runCatching { URI(url).host?.contains(NGROK_HOST_TOKEN, ignoreCase = true) == true }
        .getOrDefault(false)
}

private fun isLocalHostUrl(url: String): Boolean {
    if (url.isBlank()) return false
    val host = runCatching { URI(url).host?.lowercase() }.getOrNull() ?: return false
    return host == EMULATOR_HOST_ALIAS || host == LOOPBACK_HOST || host == LOCALHOST_HOST
}

private fun resolveStripeRedirectBaseUrl(
    resolvedApiBaseUrl: String,
    remoteBaseUrl: String,
    webBaseUrl: String,
): String {
    val runningOnEmulator = isEmulator()
    val normalizedApi = resolvedApiBaseUrl.trim().trimEnd('/')
    val normalizedRemote = remoteBaseUrl.trim().trimEnd('/')
    val normalizedWeb = webBaseUrl.trim().trimEnd('/')
        .takeUnless { it.equals(UNSET_WEB_BASE_URL, ignoreCase = true) }
        .orEmpty()

    if (normalizedWeb.isNotBlank()) {
        val webIsNgrok = isLikelyNgrokUrl(normalizedWeb)
        if (runningOnEmulator || !webIsNgrok) {
            Napier.i("stripeRedirectBaseUrl(android): using MVP_WEB_BASE_URL=$normalizedWeb")
            return normalizedWeb
        }
        Napier.i(
            "stripeRedirectBaseUrl(android): ignoring ngrok MVP_WEB_BASE_URL on physical device; " +
                "using live API origin instead."
        )
    }

    if (isLikelyNgrokUrl(normalizedRemote) && isLocalHostUrl(normalizedApi)) {
        Napier.i("stripeRedirectBaseUrl(android): using ngrok remote endpoint $normalizedRemote")
        return normalizedRemote
    }

    Napier.i("stripeRedirectBaseUrl(android): using api endpoint $normalizedApi")
    return normalizedApi
}

private val resolvedAndroidApiBaseUrl = resolveApiBaseUrl(
    BuildConfig.MVP_API_BASE_URL,
    BuildConfig.MVP_API_BASE_URL_REMOTE,
)

actual val apiBaseUrl: String = resolvedAndroidApiBaseUrl

actual val stripeRedirectBaseUrl: String = resolveStripeRedirectBaseUrl(
    resolvedAndroidApiBaseUrl,
    BuildConfig.MVP_API_BASE_URL_REMOTE,
    BuildConfig.MVP_WEB_BASE_URL,
)
