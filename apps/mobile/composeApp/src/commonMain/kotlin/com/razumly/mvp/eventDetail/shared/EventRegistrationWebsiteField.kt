package com.razumly.mvp.eventDetail.shared

import androidx.compose.runtime.Composable
import com.razumly.mvp.eventDetail.composables.TextInputField
import io.ktor.http.Url

internal fun externalRegistrationUrlError(value: String?): String? {
    val candidate = value?.trim().orEmpty()
    if (candidate.isEmpty()) return null
    val url = runCatching { Url(candidate) }.getOrNull()
    val hasHttpScheme = candidate.startsWith("https://", ignoreCase = true) ||
        candidate.startsWith("http://", ignoreCase = true)
    return if (hasHttpScheme && url != null && url.host.isNotBlank() && candidate.none(Char::isWhitespace)) {
        null
    } else {
        "Enter a valid http:// or https:// registration website."
    }
}

@Composable
internal fun EventRegistrationWebsiteField(
    value: String?,
    onValueChange: (String?) -> Unit,
) {
    val error = externalRegistrationUrlError(value)
    TextInputField(
        value = value.orEmpty(),
        label = "Registration website",
        placeholder = "https://example.com/register",
        supportingText = "Leave this blank to use BracketIQ registration.",
        onValueChange = { onValueChange(it.takeIf(String::isNotBlank)) },
        isError = error != null,
        errorMessage = error,
    )
}
