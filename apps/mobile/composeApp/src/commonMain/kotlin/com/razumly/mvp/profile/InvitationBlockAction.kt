package com.razumly.mvp.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.network.userMessage

@Composable
internal fun InvitationBlockAction(
    invite: Invite,
    enabled: Boolean,
    onSave: (String, Boolean, (Result<Unit>) -> Unit) -> Unit,
) {
    var opened by remember(invite.id) { mutableStateOf(false) }
    var scope by remember(invite.id) { mutableStateOf("team") }
    var leaveChats by remember(invite.id) { mutableStateOf(false) }
    var saving by remember(invite.id) { mutableStateOf(false) }
    var error by remember(invite.id) { mutableStateOf<String?>(null) }
    TextButton(enabled = enabled, onClick = { scope = "team"; leaveChats = false; error = null; opened = true }) { Text("Decline and block") }
    if (opened) AlertDialog(
        onDismissRequest = { if (!saving) opened = false },
        title = { Text("Decline and block") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Block invitations from")
                Row(
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).selectable(
                        selected = scope == "team", enabled = !saving, role = Role.RadioButton,
                        onClick = { scope = "team" },
                    ),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = scope == "team", onClick = null, enabled = !saving)
                    Text("This Team, from every manager")
                }
                Row(
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).selectable(
                        selected = scope == "sender", enabled = !saving && invite.canBlockSender,
                        role = Role.RadioButton, onClick = { scope = "sender" },
                    ),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = scope == "sender", onClick = null, enabled = !saving && invite.canBlockSender)
                    Text("This sender, on every Team")
                }
                if (!invite.canBlockSender) Text("This sender has no active Account to block.")
                Text(if (scope == "team") "This Team cannot add or invite ${invite.childFullName ?: "this Player"} until the block is removed."
                    else "The block belongs to your Account. It also stops this sender from inviting your children.")
                if (scope == "sender") Row(
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(
                        value = leaveChats, enabled = !saving, role = Role.Checkbox,
                        onValueChange = { leaveChats = it },
                    ),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = leaveChats, onCheckedChange = null, enabled = !saving)
                    Text("Also leave chats shared with this sender")
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { Button(enabled = !saving, onClick = {
            saving = true; error = null
            onSave(scope, scope == "sender" && leaveChats) { result ->
                saving = false
                result.onSuccess { opened = false }.onFailure { error = it.userMessage("The invitation and block were not saved. Try again.") }
            }
        }) { Text(if (saving) "Saving..." else "Save decline and block") } },
        dismissButton = { TextButton(enabled = !saving, onClick = { opened = false }) { Text("Back") } },
    )
}
