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
import androidx.compose.ui.window.DialogProperties
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.SearchBox

@Composable
fun TeamEdit(
    team: TeamWithPlayers,
    onTeamNameChange: (String) -> Unit,
    onAddPlayer: (UserData) -> Unit,
    onRemovePlayer: (UserData) -> Unit,
    onDismiss: () -> Unit,
    friends: List<UserData>,
    freeAgents: List<UserData>,
    searchPlayers: (String) -> Unit,
    suggestions: List<UserData>,
    eventName: String?,
) {
    var teamName by remember { mutableStateOf(team.team.name) }
    var playerPendingRemovalId by remember { mutableStateOf<String?>(null) }
    var showSearchDialog by remember { mutableStateOf(false) }

    Card(
        shape = RoundedCornerShape(8.dp),
        elevation = CardDefaults.cardElevation(8.dp),
        modifier = Modifier.fillMaxWidth().padding(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            OutlinedTextField(value = teamName ?: "", onValueChange = { newName ->
                teamName = newName
                onTeamNameChange(newName)
            }, label = { Text("Team Name") }, modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text("Players", style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(8.dp))
            LazyColumn {
                items(team.players) { player ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                    ) {
                        PlayerCard(player = player, modifier = Modifier.weight(1f).clickable {
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
            freeAgents = freeAgents,
            friends = friends,
            onSearch = searchPlayers,
            onPlayerSelected = { selectedPlayer ->
                onAddPlayer(selectedPlayer)
                showSearchDialog = false
            },
            onDismiss = { showSearchDialog = false },
            suggestions = suggestions,
            eventName = eventName ?: ""
        )
    }
}


@Composable
fun SearchPlayerDialog(
    freeAgents: List<UserData>,
    friends: List<UserData>,
    onSearch: (query: String) -> Unit,
    onPlayerSelected: (UserData) -> Unit,
    onDismiss: () -> Unit,
    suggestions: List<UserData>,
    eventName: String
) {
    var searchQuery by remember { mutableStateOf("") }

    Dialog(
        onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f))
                .padding(16.dp)
        ) {
            Card(
                modifier = Modifier.fillMaxWidth().align(Alignment.TopCenter),
                shape = RoundedCornerShape(8.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Add Player", style = MaterialTheme.typography.titleLarge
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    SearchBox(placeholder = "Search Players",
                        filter = false,
                        onChange = { newQuery ->
                            searchQuery = newQuery
                            onSearch(newQuery)
                        },
                        onSearch = { searchQuery = it },
                        initialList = {
                            LazyColumn {
                                if (freeAgents.isNotEmpty()) {
                                    item {
                                        Text("Free Agents of $eventName")
                                    }
                                    items(freeAgents) { player ->
                                        Row(modifier = Modifier.fillMaxWidth().clickable {
                                            onPlayerSelected(player)
                                            onDismiss()
                                        }.padding(8.dp)) {
                                            PlayerCard(player)
                                        }
                                    }
                                }
                                item {
                                    Text("Friends")
                                }
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