package com.razumly.mvp.teamManagement

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.util.newId

@Composable
internal fun TeamInvitationHistory(invites: List<Invite>, onAction: (Invite, String, String, (Result<String>) -> Unit) -> Unit) {
    var activeId by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val keys = remember { mutableMapOf<String, String>() }
    fun act(invite: Invite, action: String) {
        if (activeId != null) return
        activeId = invite.id; message = null; error = null
        val operation = "$action:${invite.id}"
        val key = keys.getOrPut(operation) { newId() }
        onAction(invite, action, key) { result ->
            activeId = null
            result.onSuccess { keys.remove(operation); message = it }
                .onFailure { error = it.userMessage("The action could not be confirmed. Retry the same action.") }
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Invitation history", style = MaterialTheme.typography.titleMedium)
        message?.let { Text(it) }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        invites.filter { it.isCurrentAttempt }.forEach { invite ->
            var expanded by remember(invite.id) { mutableStateOf(false) }
            Card {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(listOfNotNull(invite.firstName, invite.lastName).joinToString(" ").ifBlank { invite.email.ifBlank { "Player" } })
                    Text(invite.invitationLabel ?: "Invitation ${invite.status?.lowercase() ?: "pending"}")
                    Text("Created ${invite.createdAt ?: "—"}", style = MaterialTheme.typography.bodySmall)
                    invite.finalizedAt?.let { Text("Final outcome $it", style = MaterialTheme.typography.bodySmall) }
                    Row {
                        if (invite.status == "PENDING") {
                            TextButton(enabled = activeId == null, onClick = { act(invite, "remind") }) { Text("Remind") }
                            TextButton(enabled = activeId == null, onClick = { act(invite, "cancel") }) { Text("Cancel invitation") }
                        } else if (invite.status in setOf("DECLINED", "CANCELLED", "EXPIRED")) {
                            TextButton(enabled = activeId == null, onClick = { act(invite, "reinvite") }) { Text("Reinvite") }
                        }
                    }
                    TextButton(onClick = { expanded = !expanded }) { Text("Attempts and deliveries") }
                    if (expanded) invites.filter { it.id == invite.id || invite.userId != null && it.userId == invite.userId }.forEach { attempt ->
                        Text("${attempt.invitationLabel ?: attempt.status} · ${attempt.finalizedAt ?: attempt.createdAt}", style = MaterialTheme.typography.bodySmall)
                        Text("Sender ${attempt.senderName ?: "Unavailable"}", style = MaterialTheme.typography.bodySmall)
                        attempt.actingGuardianId?.let { Text("Guardian ${attempt.actingGuardianName ?: "Unavailable"}", style = MaterialTheme.typography.bodySmall) }
                        attempt.deliveries.forEach { delivery ->
                            Text("${if (delivery.kind == "REMINDER") "Reminder" else "Delivery"}: ${delivery.status.lowercase()} · ${delivery.createdAt}", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
        if (invites.isEmpty()) Text("No invitation attempts.")
    }
}
