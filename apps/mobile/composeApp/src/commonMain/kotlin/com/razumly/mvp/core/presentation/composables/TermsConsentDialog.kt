package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.repositories.ChatTermsConsentState

private val defaultSummaryLines = listOf(
    "There is no tolerance for objectionable content or abusive users.",
    "Users can report chats, events, and abusive users.",
    "Moderation acts on reports within 24 hours.",
)

private data class TermsAgreementSection(
    val title: String,
    val body: String,
)

private val fullAgreementSections = listOf(
    TermsAgreementSection(
        title = "Content Creation Access",
        body = "Creating chats, events, or other user-generated content in Bracket IQ requires agreement to the Terms and EULA. If you do not agree, those creation flows remain unavailable until you accept.",
    ),
    TermsAgreementSection(
        title = "No Tolerance Policy",
        body = "Bracket IQ does not tolerate objectionable content, abusive users, harassment, threats, hate speech, sexual exploitation, graphic abuse, or other harmful conduct.",
    ),
    TermsAgreementSection(
        title = "Reports And Blocks",
        body = "Users can report chat groups, report events, and block abusive users. Blocking can immediately hide shared chats from the blocker and can remove the blocker from shared chats when that option is chosen.",
    ),
    TermsAgreementSection(
        title = "Moderation Timeline",
        body = "Moderation reports are reviewed within 24 hours. When objectionable content is confirmed, the content is removed and the offending user is ejected or suspended.",
    ),
    TermsAgreementSection(
        title = "Enforcement And Visibility",
        body = "Reported events are hidden from the reporting user's event results. Chat groups and messages remain preserved for moderator review even when they are hidden from end users. Unblocking removes the block relationship but does not restore friendships, follows, or chat memberships.",
    ),
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
    var showFullAgreement by remember { mutableStateOf(false) }
    val fullAgreementScrollState = rememberScrollState()

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
                TextButton(onClick = { showFullAgreement = !showFullAgreement }) {
                    Text(if (showFullAgreement) "Hide full agreement" else "View full agreement")
                }
                if (showFullAgreement) {
                    Box(
                        modifier = androidx.compose.ui.Modifier
                            .fillMaxWidth()
                            .heightIn(max = 280.dp)
                            .verticalScroll(fullAgreementScrollState),
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            fullAgreementSections.forEach { section ->
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        text = section.title,
                                        style = MaterialTheme.typography.titleSmall,
                                    )
                                    Text(
                                        text = section.body,
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                            }
                        }
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
}
