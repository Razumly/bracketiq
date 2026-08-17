package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

enum class PermissionPrimerKind {
    LOCATION,
    NOTIFICATIONS,
}

data class PermissionPrimerState(
    val kind: PermissionPrimerKind,
    val isRequesting: Boolean = false,
    val settingsRequired: Boolean = false,
    val doNotAskAgain: Boolean = false,
)

@Composable
fun PermissionPrimerDialog(
    state: PermissionPrimerState,
    onDoNotAskAgainChanged: (Boolean) -> Unit = {},
    onNext: () -> Unit,
    onNotNow: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val isLocation = state.kind == PermissionPrimerKind.LOCATION
    val title = when {
        state.settingsRequired && isLocation -> "Location permission is off"
        state.settingsRequired -> "Notifications are turned off"
        isLocation -> "Find local events"
        else -> "Stay up to date"
    }
    val body = when {
        state.settingsRequired && isLocation ->
            "Turn on location in your device settings to find events near you."
        state.settingsRequired ->
            "Turn on notifications in your device settings to receive event communication."
        isLocation ->
            "We only use your location for finding local events. Your data is not shared or sold. You can still browse events without location access."
        else ->
            "Enable notifications so you receive proper communication about events you join. You can enable or disable specific notifications from Home."
    }

    AlertDialog(
        onDismissRequest = { if (!state.isRequesting) onNotNow() },
        title = { Text(title) },
        text = {
            Column {
                Text(body, style = MaterialTheme.typography.bodyMedium)
                if (isLocation && !state.settingsRequired) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp)
                            .clickable(enabled = !state.isRequesting) {
                                onDoNotAskAgainChanged(!state.doNotAskAgain)
                            }
                            .semantics { contentDescription = "Do not ask again" },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(
                            checked = state.doNotAskAgain,
                            onCheckedChange = onDoNotAskAgainChanged,
                            enabled = !state.isRequesting,
                        )
                        Text("Do not ask again")
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = if (state.settingsRequired) onOpenSettings else onNext,
                enabled = !state.isRequesting,
            ) {
                if (state.isRequesting) {
                    CircularProgressIndicator()
                } else {
                    Text(if (state.settingsRequired) "Open Settings" else "Next")
                }
            }
        },
        dismissButton = {
            TextButton(
                onClick = onNotNow,
                enabled = !state.isRequesting,
            ) {
                Text("Not now")
            }
        },
    )
}
