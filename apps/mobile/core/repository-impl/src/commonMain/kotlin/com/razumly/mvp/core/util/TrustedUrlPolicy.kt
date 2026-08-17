package com.razumly.mvp.core.util

/**
 * URL trust is context-specific. A URL supplied by a server response must not
 * become an arbitrary native intent simply because it is syntactically valid.
 */
enum class EmbeddedWebUrlPolicy {
    SIGNING,
    DOCUMENT_VIEW,
}

enum class AppUpdatePlatform {
    ANDROID,
    IOS,
}

private const val BOLDSIGN_SIGNING_HOST = "app.boldsign.com"
private const val GOOGLE_PLAY_HOST = "play.google.com"
private const val GOOGLE_PLAY_PATH = "/store/apps/details"
private const val ANDROID_PACKAGE_NAME = "com.razumly.mvp"
private const val APPLE_APP_STORE_HOST = "apps.apple.com"
private const val IOS_APP_STORE_ID = "6746649739"

private val trustedHostPattern = Regex(
    pattern = "^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$",
    option = RegexOption.IGNORE_CASE,
)
private val androidGeoDirectionsPattern = Regex(
    pattern = "^geo:0,0\\?q=[^\\s#]+$",
    option = RegexOption.IGNORE_CASE,
)
private val iosGeoDirectionsPattern = Regex(
    pattern = "^geo-navigation:///directions\\?destination=[^\\s#]+$",
    option = RegexOption.IGNORE_CASE,
)

private data class TrustedHttpsUrl(
    val normalized: String,
    val host: String,
    val path: String,
    val query: String?,
    val hasFragment: Boolean,
)

/**
 * Generic remote links are allowed only as absolute HTTPS URLs without
 * credentials, non-standard ports, control characters, or ambiguous hosts.
 */
fun trustedExternalHttpsUrlOrNull(rawUrl: String?): String? =
    parseTrustedHttpsUrl(rawUrl)?.normalized

/**
 * Signing surfaces accept only the provider's HTTPS document-signing routes.
 */
fun trustedBoldSignSigningUrlOrNull(rawUrl: String?): String? {
    val parsed = parseTrustedHttpsUrl(rawUrl) ?: return null
    val isSigningPath = parsed.path.startsWith("/sign/") ||
        parsed.path.startsWith("/document/sign/")
    return parsed.normalized.takeIf {
        parsed.host == BOLDSIGN_SIGNING_HOST &&
            isSigningPath &&
            !parsed.hasFragment
    }
}

fun trustedEmbeddedWebUrlOrNull(
    rawUrl: String?,
    policy: EmbeddedWebUrlPolicy,
): String? = when (policy) {
    EmbeddedWebUrlPolicy.SIGNING -> trustedBoldSignSigningUrlOrNull(rawUrl)
    EmbeddedWebUrlPolicy.DOCUMENT_VIEW -> trustedExternalHttpsUrlOrNull(rawUrl)
}

/**
 * Update prompts may lead only to BracketIQ's platform-specific store record.
 */
fun trustedAppUpdateUrlOrNull(
    rawUrl: String?,
    platform: AppUpdatePlatform,
): String? {
    val parsed = parseTrustedHttpsUrl(rawUrl) ?: return null
    if (parsed.hasFragment) return null

    return when (platform) {
        AppUpdatePlatform.ANDROID -> parsed.normalized.takeIf {
            parsed.host == GOOGLE_PLAY_HOST &&
                parsed.path == GOOGLE_PLAY_PATH &&
                parsed.query.hasExactQueryValue("id", ANDROID_PACKAGE_NAME)
        }

        AppUpdatePlatform.IOS -> parsed.normalized.takeIf {
            parsed.host == APPLE_APP_STORE_HOST &&
                parsed.path
                    .split('/')
                    .lastOrNull(String::isNotBlank) == "id$IOS_APP_STORE_ID"
        }
    }
}

/**
 * Custom URL schemes are only permitted for the internally generated native
 * directions routes. Any other caller must use [trustedExternalHttpsUrlOrNull].
 */
fun trustedDirectionsUrlOrNull(rawUrl: String?): String? {
    val normalized = rawUrl?.trim()?.takeIf(String::isNotBlank) ?: return null
    if (normalized.hasUnsafeUrlCharacters()) return null
    if (trustedExternalHttpsUrlOrNull(normalized) != null) return normalized

    return normalized.takeIf { url ->
        androidGeoDirectionsPattern.matches(url) || iosGeoDirectionsPattern.matches(url)
    }
}

private fun parseTrustedHttpsUrl(rawUrl: String?): TrustedHttpsUrl? {
    val normalized = rawUrl?.trim()?.takeIf(String::isNotBlank) ?: return null
    if (normalized.length > 4_096 || normalized.hasUnsafeUrlCharacters()) return null
    if (!normalized.startsWith("https://", ignoreCase = true)) return null

    val afterScheme = normalized.substring("https://".length)
    val authorityEnd = afterScheme.indexOfFirst { character ->
        character == '/' || character == '?' || character == '#'
    }.let { index -> if (index == -1) afterScheme.length else index }
    val authority = afterScheme.substring(0, authorityEnd)
    if (authority.isBlank() || authority.contains('@') || authority.contains(':')) return null

    val host = authority.lowercase()
    if (!trustedHostPattern.matches(host)) return null

    val suffix = afterScheme.substring(authorityEnd)
    val fragmentIndex = suffix.indexOf('#')
    val pathAndQuery = if (fragmentIndex == -1) suffix else suffix.substring(0, fragmentIndex)
    val queryIndex = pathAndQuery.indexOf('?')
    val path = when {
        queryIndex == -1 -> pathAndQuery
        else -> pathAndQuery.substring(0, queryIndex)
    }
    val query = queryIndex
        .takeIf { it >= 0 }
        ?.let { index -> pathAndQuery.substring(index + 1) }

    if (path.isNotEmpty() && !path.startsWith('/')) return null
    return TrustedHttpsUrl(
        normalized = normalized,
        host = host,
        path = path,
        query = query,
        hasFragment = fragmentIndex >= 0,
    )
}

private fun String?.hasExactQueryValue(key: String, expectedValue: String): Boolean =
    this
        ?.split('&')
        ?.any { segment ->
            val delimiter = segment.indexOf('=')
            delimiter > 0 &&
                segment.substring(0, delimiter) == key &&
                segment.substring(delimiter + 1) == expectedValue
        }
        ?: false

private fun String.hasUnsafeUrlCharacters(): Boolean =
    any { character ->
        character.code <= 0x20 || character.code == 0x7f || character == '\\'
    }
