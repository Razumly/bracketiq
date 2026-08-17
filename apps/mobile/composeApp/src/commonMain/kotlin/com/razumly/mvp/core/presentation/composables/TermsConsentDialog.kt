package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.repositories.ChatTermsConsentState

private val defaultSummaryLines = listOf(
    "There is no tolerance for objectionable content or abusive users.",
    "Users can report chats, events, and abusive users.",
    "Moderation acts on reports within 24 hours.",
)

private const val CANONICAL_TERMS_ORIGIN = "https://bracket-iq.com"
private const val CANONICAL_TERMS_PATH = "/terms"

/**
 * Accept only the canonical BracketIQ terms endpoint.  The API normally sends
 * a relative `/terms` path, which we resolve locally without ever substituting
 * a missing or untrusted value with a fallback URL.
 */
internal fun resolveCanonicalTermsUrl(rawUrl: String?): String? {
    val url = rawUrl?.trim()?.takeIf(String::isNotBlank) ?: return null
    if (url.any { it.isWhitespace() || it.code < 0x20 || it.code == 0x7f } || url.contains('\\')) return null

    if (url.startsWith(CANONICAL_TERMS_PATH)) {
        val suffix = url.removePrefix(CANONICAL_TERMS_PATH)
        return if (suffix.isEmpty() || suffix.startsWith('?') || suffix.startsWith('#')) {
            "$CANONICAL_TERMS_ORIGIN$url"
        } else {
            null
        }
    }

    if (!url.startsWith(CANONICAL_TERMS_ORIGIN, ignoreCase = true)) return null
    val suffix = url.substring(CANONICAL_TERMS_ORIGIN.length)
    return if (
        suffix.startsWith(CANONICAL_TERMS_PATH) &&
        (suffix.length == CANONICAL_TERMS_PATH.length ||
            suffix[CANONICAL_TERMS_PATH.length] in charArrayOf('?', '#'))
    ) {
        "$CANONICAL_TERMS_ORIGIN$suffix"
    } else {
        null
    }
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
    val summaryLines = state.summary.ifEmpty { defaultSummaryLines }
    val uriHandler = LocalUriHandler.current
    val agreementUrl = resolveCanonicalTermsUrl(state.url)

    AlertDialog(
        onDismissRequest = { onDismiss?.invoke() },
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(intro)
                state.version.trim().takeIf(String::isNotBlank)?.let { version ->
                    Text("Agreement version: $version", style = MaterialTheme.typography.labelMedium)
                }
                if (loading && state.summary.isEmpty() && !state.accepted) {
                    Text(
                        "Checking your Terms and EULA status...",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                summaryLines.forEach { summaryLine ->
                    Text(summaryLine, style = MaterialTheme.typography.bodySmall)
                }
                Text(
                    "Moderation reports are reviewed within 24 hours. Confirmed objectionable content is removed and abusive users are ejected or suspended.",
                    style = MaterialTheme.typography.bodySmall,
                )
                if (agreementUrl == null) {
                    Text(
                        "The authoritative Terms and EULA link is unavailable. You cannot agree until it can be verified.",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                } else {
                    TextButton(onClick = { runCatching { uriHandler.openUri(agreementUrl) } }) {
                        Text("View authoritative full agreement")
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onAccept, enabled = !loading && agreementUrl != null) {
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
}
