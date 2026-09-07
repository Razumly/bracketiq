package com.razumly.mvp.eventDetail

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.composables.TeamCard

@Composable
internal fun EventCheckoutTeamEditor(
    state: EventCheckoutTeamEditorState,
    onDismiss: () -> Unit,
    onNameChange: (String) -> Unit,
    onSizeChange: (String) -> Unit,
    onSave: () -> Unit,
) {
    EventCheckoutDialog(
        onDismissRequest = { if (!state.busy) onDismiss() },
        title = { Text("Edit team") },
        text = {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                TeamCard(state.team)
                StandardTextField(value = state.name, onValueChange = onNameChange, label = "Team name")
                StandardTextField(value = state.size, onValueChange = onSizeChange, label = "Roster capacity")
                Text("Capacity must include all Players already on the roster. Changes apply to this Team in all Events.")
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(enabled = state.valid && !state.busy, modifier = Modifier.fillMaxWidth(), onClick = onSave) {
                Text(if (state.busy) "Saving…" else "Save and return")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !state.busy) { Text("Cancel") } },
    )
}
