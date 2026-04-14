package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.repositories.ChatTermsConsentState

private val defaultSummaryLines = listOf(
    "There is no tolerance for objectionable content or abusive users.",
    "Users can report chats, events, and abusive users.",
    "Moderation acts on reports within 24 hours.",
)

@Composable
fun TermsConsentDialog(
    state: ChatTermsConsentState,
    loading: Boolean,
    onAccept: () -> Unit,
    onDismiss: (() -> Unit)? = null,
    title: String = "Agree to the Terms and EULA",
    intro: String = "Creating chats, events, or other user-generated content in Bracket IQ requires agreement to the Terms and EULA.",
    confirmLabel: String = "Agree",
    dismissLabel: String = "Not now",
) {
    val summaryLines = state.summary.ifEmpty { defaultSummaryLines }

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
                summaryLines.forEach { summaryLine ->
                    Text(summaryLine, style = MaterialTheme.typography.bodySmall)
                }
                Text(
                    "Moderation reports are reviewed within 24 hours. Confirmed objectionable content is removed and abusive users are ejected or suspended.",
                    style = MaterialTheme.typography.bodySmall,
                )
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
}
