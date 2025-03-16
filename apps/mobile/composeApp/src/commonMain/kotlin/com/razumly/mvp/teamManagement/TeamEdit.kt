package com.razumly.mvp.teamManagement

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.composables.PlayerCard

@Composable
fun TeamEdit(
    team: TeamWithPlayers,
    onTeamNameChange: (String) -> Unit,
    onAddPlayer: (UserData) -> Unit,
    onRemovePlayer: (UserData) -> Unit,
    onDismiss: () -> Unit
) {
    // Track an edited version of the team name locally.
    var teamName by remember { mutableStateOf(team.team.name) }
    // Remember which player's removal is being confirmed.
    var playerPendingRemovalId by remember { mutableStateOf<String?>(null) }

    Card(
        shape = RoundedCornerShape(8.dp),
        elevation = CardDefaults.cardElevation(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Editable team name at the top.
            teamName?.let {
                OutlinedTextField(
                    value = it,
                    onValueChange = { newName ->
                        teamName = newName
                        onTeamNameChange(newName)
                    },
                    label = { Text("Team Name") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text("Players", style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(8.dp))
            // List of players.
            LazyColumn {
                items(team.players) { player ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                    ) {
                        // Your PlayerCard composable that displays user info.
                        PlayerCard(
                            player = player,
                            modifier = Modifier
                                .weight(1f)
                                .clickable {
                                    // Toggle confirmation for removal.
                                    playerPendingRemovalId =
                                        if (playerPendingRemovalId == player.id) null else player.id
                                }
                        )
                        if (playerPendingRemovalId == player.id) {
                            Button(
                                onClick = {
                                    onRemovePlayer(player)
                                    playerPendingRemovalId = null
                                }
                            ) {
                                Text("Remove")
                            }
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Button(onClick = onAddPlayer) {
                    Text("Add Player")
                }
                OutlinedButton(onClick = onDismiss) {
                    Text("Close")
                }
            }
        }
    }
}