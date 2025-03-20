package com.razumly.mvp.teamManagement

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.SearchBox

@Composable
fun TeamEdit(
    team: TeamWithRelations,
    onTeamNameChange: (String) -> Unit,
    onAddPlayer: (UserData) -> Unit,
    onRemovePlayer: (UserData) -> Unit,
    onDismiss: () -> Unit,
    // Extra parameters for the search dialog:
    friends: List<UserData>,
    searchPlayers: (String) -> Unit,
    suggestions: List<UserData>
) {
    // Track an edited version of the team name locally.
    var teamName by remember { mutableStateOf(team.team.name) }
    // Remember which player's removal is being confirmed.
    var playerPendingRemovalId by remember { mutableStateOf<String?>(null) }
    // State to show/hide the search dialog.
    var showSearchDialog by remember { mutableStateOf(false) }

    Card(
        shape = RoundedCornerShape(8.dp),
        elevation = CardDefaults.cardElevation(8.dp),
        modifier = Modifier.fillMaxWidth().padding(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Editable team name at the top.
            OutlinedTextField(value = teamName ?: "", onValueChange = { newName ->
                teamName = newName
                onTeamNameChange(newName)
            }, label = { Text("Team Name") }, modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text("Players", style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(8.dp))
            // List of players.
            LazyColumn {
                items(team.players) { player ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                    ) {
                        // PlayerCard displays user info.
                        PlayerCard(player = player, modifier = Modifier.weight(1f).clickable {
                                // Toggle confirmation for removal.
                                playerPendingRemovalId =
                                    if (playerPendingRemovalId == player.id) null else player.id
                            })
                        if (playerPendingRemovalId == player.id) {
                            Button(onClick = {
                                onRemovePlayer(player)
                                playerPendingRemovalId = null
                            }) {
                                Text("Remove")
                            }
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Button(onClick = { showSearchDialog = true }) {
                    Text("Add Player")
                }
                OutlinedButton(onClick = onDismiss) {
                    Text("Close")
                }
            }
        }
    }

    // Show the search dialog when requested.
    if (showSearchDialog) {
        SearchPlayerDialog(
            friends = friends,
            onSearch = searchPlayers,
            onPlayerSelected = { selectedPlayer ->
                onAddPlayer(selectedPlayer)
                showSearchDialog = false
            },
            onDismiss = { showSearchDialog = false },
            suggestions = suggestions,
        )
    }
}


@Composable
fun SearchPlayerDialog(
    friends: List<UserData>,
    onSearch: (query: String) -> Unit,
    onPlayerSelected: (UserData) -> Unit,
    onDismiss: () -> Unit,
    suggestions: List<UserData>
) {
    // Local state for the search query.
    var searchQuery by remember { mutableStateOf("") }

    Dialog(onDismissRequest = onDismiss) {
        // A Box to fill the screen with a grey overlay.
        Box(
            modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f))
                .padding(16.dp)
        ) {
            // The dialog card content.
            Card(
                modifier = Modifier.fillMaxWidth().align(Alignment.TopCenter),
                shape = RoundedCornerShape(8.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    // Title of the dialog.
                    Text(
                        text = "Add Player", style = MaterialTheme.typography.titleLarge
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    // The search box.
                    SearchBox(placeholder = "Search friends",
                        filter = false,
                        onChange = { newQuery ->
                            searchQuery = newQuery
                            onSearch(newQuery)
                        },
                        onSearch = { searchQuery = it },
                        initialList = {
                            // Show initial list of friends.
                            LazyColumn {
                                items(friends) { friend ->
                                    Row(modifier = Modifier.fillMaxWidth().clickable {
                                            onPlayerSelected(friend)
                                            onDismiss()
                                        }.padding(8.dp)) {
                                        PlayerCard(friend)
                                    }
                                }
                            }
                        },
                        suggestions = {
                            // Show search suggestions.
                            LazyColumn {
                                items(suggestions) { player ->
                                    Row(modifier = Modifier.fillMaxWidth().clickable {
                                            onPlayerSelected(player)
                                            onDismiss()
                                        }.padding(8.dp)) {
                                        PlayerCard(player)
                                    }
                                }
                            }
                        })
                }
            }
        }
    }
}