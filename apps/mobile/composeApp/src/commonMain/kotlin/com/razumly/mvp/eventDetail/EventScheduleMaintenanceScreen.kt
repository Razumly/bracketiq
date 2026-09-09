package com.razumly.mvp.eventDetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation

@Composable
internal fun EventScheduleMaintenanceScreen(
    canRequest: Boolean,
    options: EventScheduleMaintenanceOptions?,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    onSelect: (EventEditorMaintenanceOperation) -> Unit,
) {
    if (!canRequest) return
    OutlinedButton(
        onClick = onOpen,
        modifier = Modifier.padding(horizontal = 12.dp).fillMaxWidth(),
    ) {
        Text("Schedule actions")
    }
    if (options == null) return
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Maintain Schedule") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 400.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (options.isLoading) Text("Loading permitted Schedule actions...")
                options.message?.let { Text(it) }
                if (!options.isLoading) options.operations.forEach { operation ->
                    val (label, description) = when (operation) {
                        EventEditorMaintenanceOperation.BUILD ->
                            "Build Schedule" to "Generate Matches and propose their placements."
                        EventEditorMaintenanceOperation.COMPLETE ->
                            "Complete Schedule" to "Place Unscheduled Matches. Keep placed Matches fixed."
                        EventEditorMaintenanceOperation.REBUILD ->
                            "Rebuild Schedule" to "Replace eligible Matches. Keep protected Matches fixed."
                    }
                    TextButton(
                        onClick = { onSelect(operation) },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    ) { Text(label) }
                    Text(description, style = MaterialTheme.typography.bodyMedium)
                }
            }
        },
        confirmButton = {
            if (!options.isLoading && options.operations.isEmpty()) {
                TextButton(onClick = onOpen) { Text("Retry") }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
