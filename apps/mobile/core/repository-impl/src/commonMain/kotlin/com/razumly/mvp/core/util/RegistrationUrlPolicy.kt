package com.razumly.mvp.core.util

import io.ktor.http.Url

/** Registration links open in the platform browser and accept HTTP or HTTPS. */
fun registrationUrlOrNull(value: String?): String? {
    val candidate = value?.trim().orEmpty()
    if (candidate.isEmpty() || candidate.length > 2048 || candidate.any { it.isWhitespace() || it.code < 32 } || '\\' in candidate) return null
    if (!candidate.startsWith("http://", true) && !candidate.startsWith("https://", true)) return null
    val authority = candidate.substringAfter("://").takeWhile { it != '/' && it != '?' && it != '#' }
    if (authority.isBlank() || authority.startsWith(":")) return null
    val url = runCatching { Url(candidate) }.getOrNull() ?: return null
    return candidate.takeIf { url.host.isNotBlank() && url.user.isNullOrEmpty() && url.password.isNullOrEmpty() }
}
