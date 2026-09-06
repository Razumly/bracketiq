package com.razumly.mvp.eventDetail.shared

import androidx.compose.runtime.Composable
import com.razumly.mvp.eventDetail.composables.TextInputField
import com.razumly.mvp.core.util.registrationUrlOrNull

internal fun externalRegistrationUrlError(value: String?): String? {
    val candidate = value?.trim().orEmpty()
    if (candidate.isEmpty()) return null
    return if (registrationUrlOrNull(candidate) != null) {
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
