package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.repositories.ChatTermsConsentState
import com.razumly.mvp.core.network.apiBaseUrl

internal data class TermsAgreementPresentation(
    val url: String?,
    val versionLabel: String?,
)

/**
 * The consent API owns both the terms revision and its canonical location. The app must not
 * replace those terms with a local approximation: a revision can change without a mobile
 * release.
 */
internal fun termsAgreementPresentation(
    state: ChatTermsConsentState,
    baseUrl: String = apiBaseUrl,
): TermsAgreementPresentation {
    val version = state.version.trim().takeIf(String::isNotBlank)
    return TermsAgreementPresentation(
        url = resolveTermsAgreementUrl(state.url, baseUrl),
        versionLabel = version?.let { "Terms and EULA version $it" },
    )
}

internal fun resolveTermsAgreementUrl(rawUrl: String, baseUrl: String): String? {
    val url = rawUrl.trim()
    if (url.isBlank()) return null
    if (url.startsWith("https://", ignoreCase = true) || url.startsWith("http://", ignoreCase = true)) {
        return url
    }
    if (!url.startsWith('/') || url.startsWith("//")) return null

    val origin = baseUrl.trim().trimEnd('/')
    if (!origin.startsWith("https://", ignoreCase = true) &&
        !origin.startsWith("http://", ignoreCase = true)
    ) {
        return null
    }
    return "$origin/${url.trimStart('/')}"
}

@Composable
fun TermsConsentDialog(
    state: ChatTermsConsentState,
    loading: Boolean,
    onAccept: () -> Unit,
    onDismiss: (() -> Unit)? = null,
    title: String = "Agree to the Terms and EULA",
    intro: String = "Sending chat messages, creating events, or other user-generated content in Bracket IQ requires agreement to the Terms and EULA.",
    confirmLabel: String = "Agree",
    dismissLabel: String = "Not now",
) {
    val agreement = remember(state.url, state.version) { termsAgreementPresentation(state) }
    val agreementUrl = agreement.url
    val agreementVersion = agreement.versionLabel
    val showAgreement = remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = { onDismiss?.invoke() },
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(intro)
                if (loading && state.summary.isEmpty() && !state.accepted) {
                    Text(
                        "Checking your Terms and EULA status...",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                state.summary.forEach { summaryLine ->
                    Text(summaryLine, style = MaterialTheme.typography.bodySmall)
                }
                agreementVersion?.let { version ->
                    Text(version, style = MaterialTheme.typography.bodySmall)
                }
                if (agreementUrl != null) {
                    TextButton(onClick = { showAgreement.value = true }) {
                        Text("Review the current Terms and EULA")
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onAccept, enabled = !loading) {
                Text(if (loading) "Saving..." else confirmLabel)
            }
        },
        dismissButton = onDismiss?.let {
            {
                TextButton(onClick = it) {
                    Text(dismissLabel)
                }
            }
        },
    )

    if (showAgreement.value && agreementUrl != null) {
        EmbeddedWebModal(
            title = agreementVersion ?: "Terms and EULA",
            url = agreementUrl,
            description = "Review the current agreement before accepting.",
            onDismiss = { showAgreement.value = false },
        )
    }
}
