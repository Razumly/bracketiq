package com.razumly.mvp.teamManagement

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.window.Dialog
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.composables.InvitePlayerCard
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.SearchPlayerDialog
import com.razumly.mvp.core.presentation.util.teamSizeFormat

@Composable
fun CreateOrEditTeamDialog(
    team: TeamWithPlayers,
    friends: List<UserData>,
    freeAgents: List<UserData>,
    suggestions: List<UserData>,
    onSearch: (String) -> Unit,
    onFinish: (Team) -> Unit,
    onDelete: (TeamWithPlayers) -> Unit,
    onDismiss: () -> Unit,
    deleteEnabled: Boolean,
    selectedEvent: EventAbs?,
    isCaptain: Boolean,
    currentUser: UserData
) {
    var teamName by remember { mutableStateOf(team.team.name ?: "") }
    var teamSize by remember { mutableStateOf(team.team.teamSize) }
    var showSearchDialog by remember { mutableStateOf(false) }
    var invitedPlayers by remember { mutableStateOf(team.pendingPlayers) }
    var playersInTeam by remember { mutableStateOf(team.players) }
    var showLeaveTeamDialog by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(12.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Team Setup", style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(8.dp))

            OutlinedTextField(value = teamName,
                onValueChange = {
                    teamName = it
                },
                label = { Text("Team Name") },
                modifier = Modifier.fillMaxWidth(),
                readOnly = !isCaptain
            )

            Spacer(modifier = Modifier.height(12.dp))
            Text("Select Team Size")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(2, 3, 4, 5, 6, 7).forEach { size ->
                    FilterChip(enabled = isCaptain, selected = size == teamSize, onClick = {
                        teamSize = size
                    }, label = { Text(size.teamSizeFormat()) })
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            Text("Players")
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(playersInTeam) { player ->
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        PlayerCard(player = player, modifier = Modifier.weight(1f))
                        if (isCaptain) {
                            Button(onClick = {
                                playersInTeam = playersInTeam - player
                            }) {
                                Text("Remove")
                            }
                        }
                    }
                }
                items(invitedPlayers) { player ->
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        PlayerCard(player = player, isPending = true, Modifier.weight(1f))
                        if (isCaptain) {
                            Button(onClick = {
                                invitedPlayers = invitedPlayers - player
                            }) {
                                Text("Remove")
                            }
                        }
                    }
                }
                if (playersInTeam.size + invitedPlayers.size < teamSize || teamSize == 7 && isCaptain) {
                    item {
                        InvitePlayerCard { showSearchDialog = true }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
            Row(
                Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween
            ) {
                OutlinedButton(onClick = onDismiss) {
                    Text("Cancel")
                }
                if (isCaptain) {
                    Button(onClick = { onDelete(team) }, enabled = deleteEnabled) {
                        Text("Delete")
                    }
                    Button(onClick = {
                        onFinish(
                            team.team.copy(players = playersInTeam.map { it.id },
                                pending = invitedPlayers.map { it.id },
                                name = teamName,
                                teamSize = teamSize
                            )
                        )
                    }) {
                        Text("Finish")
                    }
                } else {
                    Button(onClick = { showLeaveTeamDialog = true }) {
                        Text("Leave Team")
                    }
                }
            }
        }
    }

    if (showLeaveTeamDialog) {
        Dialog(onDismissRequest = { showLeaveTeamDialog = false }) {
            Box(Modifier.fillMaxSize()) {
                Text("Are you sure you want to leave this team?")
                Button(onClick = {
                    onFinish(
                        team.team.copy(players = (playersInTeam - currentUser).map { it.id },
                            pending = invitedPlayers.map { it.id },
                            name = teamName,
                            teamSize = teamSize
                        )
                    )
                    showLeaveTeamDialog = false
                }) {
                    Text("Yes")
                }
                Button(onClick = { showLeaveTeamDialog = false }) {
                    Text("Cancel")
                }
            }
        }
    }

    if (showSearchDialog) {
        SearchPlayerDialog(freeAgents = freeAgents,
            friends = friends,
            suggestions = suggestions.filterNot {
                playersInTeam.contains(it) || invitedPlayers.contains(it)
            },
            onSearch = onSearch,
            onPlayerSelected = {
                if (team.players.contains(it)) {
                    playersInTeam = playersInTeam + it
                } else {
                    invitedPlayers = invitedPlayers + it
                }
                showSearchDialog = false
            },
            onDismiss = { showSearchDialog = false },
            eventName = selectedEvent?.name ?: ""
        )
    }
}