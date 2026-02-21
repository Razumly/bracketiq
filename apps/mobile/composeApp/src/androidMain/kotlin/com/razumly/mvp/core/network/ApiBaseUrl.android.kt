package com.razumly.mvp.core.network

import android.os.Build
import com.razumly.mvp.BuildConfig
import io.github.aakira.napier.Napier
import java.net.URI

private const val EMULATOR_HOST_ALIAS = "10.0.2.2"
private const val LOOPBACK_HOST = "127.0.0.1"
private const val LOCALHOST_HOST = "localhost"

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

actual val apiBaseUrl: String = resolveApiBaseUrl(
    BuildConfig.MVP_API_BASE_URL,
    BuildConfig.MVP_API_BASE_URL_REMOTE,
)
