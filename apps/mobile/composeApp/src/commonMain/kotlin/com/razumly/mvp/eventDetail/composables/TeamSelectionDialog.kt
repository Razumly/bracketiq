package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ListItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.presentation.composables.HorizontalDivider
import com.razumly.mvp.core.presentation.util.toTeamDisplayLabel
import com.razumly.mvp.eventDetail.TeamPosition
import com.razumly.mvp.eventDetail.TeamSelectionDialogState

@Composable
fun TeamSelectionDialog(
    dialogState: TeamSelectionDialogState,
    onTeamSelected: (String?) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = when (dialogState.position) {
                    TeamPosition.TEAM1 -> "Select Team 1"
                    TeamPosition.TEAM2 -> "Select Team 2"
                    TeamPosition.REF -> "Select Referee"
                }
            )
        },
        text = {
            LazyColumn {
                item {
                    // Option to clear selection
                    ListItem(
                        headlineContent = { Text("None") },
                        modifier = Modifier.clickable {
                            onTeamSelected(null)
                        }
                    )
                    HorizontalDivider()
                }

                items(dialogState.availableTeams) { team ->
                    ListItem(
                        headlineContent = {
                            Text(team.toTeamDisplayLabel())
                        },
                        supportingContent = {
                            Text("${team.players.size} players")
                        },
                        modifier = Modifier.clickable {
                            onTeamSelected(team.team.id)
                        }
                    )
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
