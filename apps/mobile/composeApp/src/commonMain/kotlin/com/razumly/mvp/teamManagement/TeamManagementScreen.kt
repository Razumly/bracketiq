package com.razumly.mvp.teamManagement

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Button
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.razumly.mvp.core.presentation.composables.TeamCard

@Composable
fun TeamManagementScreen(component: TeamManagementComponent) {
    val currentTeams by component.currentTeams.collectAsState()
    val lazyListState = rememberLazyListState()
    val friends by component.friends.collectAsState()
    val suggestions by component.suggestedPlayers.collectAsState()
    val freeAgents by component.freeAgentsFiltered.collectAsState()
    val selectedEvent = component.selectedEvent
    val selectedTeam by component.selectedTeam.collectAsState()
    val currentUser by component.currentUser.collectAsState()
    val isCaptain = selectedTeam?.team?.captainId == currentUser?.id
    var createTeam by remember { mutableStateOf(false) }
    val teamInvites by component.teamInvites.collectAsState()
    val deleteEnabled by component.enableDeleteTeam.collectAsState()

    Scaffold { paddingValues ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(paddingValues),
            state = lazyListState,
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            items(currentTeams) { team ->
                TeamCard(
                    modifier = Modifier.clickable(onClick = {
                        component.selectTeam(team)
                    }), team = team
                )
            }
            items(teamInvites) { team ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)) {
                    TeamCard(
                        modifier = Modifier.clickable(onClick = { component.selectTeam(team) }),
                        team = team
                    )
                    Button(onClick = { component.joinTeam(team.team) }) { Text("Accept") }
                }
            }
            item {
                Button(onClick = {
                    createTeam = true
                    component.selectTeam(null)
                }) {
                    Text("Create New Team")
                }
            }
        }
    }

    if (selectedTeam != null && currentUser != null) {
        Dialog(onDismissRequest = { component.deselectTeam() }) {
            CreateOrEditTeamDialog(
                team = selectedTeam!!,
                friends = friends,
                freeAgents = freeAgents,
                onSearch = { query -> component.searchPlayers(query) },
                suggestions = suggestions,
                onFinish = { newTeam ->
                    if (createTeam) {
                        component.createTeam(newTeam)
                    } else {
                        component.updateTeam(newTeam)
                    }
                    createTeam = false
                },
                onDismiss = { component.deselectTeam() },
                onDelete = { team ->
                    component.deleteTeam(team)
                },
                deleteEnabled = deleteEnabled,
                selectedEvent = selectedEvent,
                isCaptain = isCaptain,
                currentUser = currentUser!!
            )
        }
    }
}