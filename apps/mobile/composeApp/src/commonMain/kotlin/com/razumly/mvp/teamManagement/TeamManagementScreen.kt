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
import androidx.compose.material3.Card
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.razumly.mvp.core.data.dataTypes.inferTeamInviteRole
import com.razumly.mvp.core.data.dataTypes.label
import com.razumly.mvp.core.presentation.composables.PlatformBackButton
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.util.LocalLoadingHandler

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeamManagementScreen(component: TeamManagementComponent) {
    val loadingHandler = LocalLoadingHandler.current
    val currentTeams by component.currentTeams.collectAsState()
    val lazyListState = rememberLazyListState()
    val friends by component.friends.collectAsState()
    val sports by component.sports.collectAsState()
    val suggestions by component.suggestedPlayers.collectAsState()
    val freeAgents by component.freeAgentsFiltered.collectAsState()
    val selectedFreeAgent by component.selectedFreeAgent.collectAsState()
    val selectedEvent = component.selectedEvent
    val selectedTeam by component.selectedTeam.collectAsState()
    val staffUsersById by component.staffUsersById.collectAsState()
    val currentUser = component.currentUser
    val isCaptain = selectedTeam?.team?.captainId == currentUser.id || selectedTeam?.team?.managerId == currentUser.id
    var createTeam by remember { mutableStateOf(false) }
    val deleteEnabled by component.enableDeleteTeam.collectAsState()
    val teamInvites by component.teamInvites.collectAsState()

    LaunchedEffect(component, loadingHandler) {
        component.setLoadingHandler(loadingHandler)
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Team Management") },
                navigationIcon = { PlatformBackButton(
                    onBack = { component.onBack() },
                    arrow = true,
                ) },
            )
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(paddingValues),
            state = lazyListState,
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            selectedFreeAgent?.let { freeAgent ->
                item(key = "selected-free-agent-suggestion") {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp),
                    ) {
                        Text(
                            text = "Suggested free agent from event",
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        )
                        PlayerCard(
                            player = freeAgent,
                            modifier = Modifier.padding(horizontal = 12.dp),
                        )
                        Text(
                            text = "Open a team and invite this player from the free-agent list.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        )
                    }
                }
            }
            items(currentTeams) { team ->
                TeamCard(
                    modifier = Modifier.clickable(onClick = {
                        component.selectTeam(team)
                    }), team = team
                )
            }
            items(teamInvites) { invite ->
                val team = invite.team
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)
                ) {
                    team?.let {
                        TeamCard(
                            modifier = Modifier.clickable(onClick = { component.selectTeam(it) }),
                            team = it
                        )
                    } ?: Text("Invited to team", modifier = Modifier.weight(1f))
                    Text("Role: ${invite.invite.inferTeamInviteRole(team?.team).label()}")
                    Button(onClick = { component.acceptTeamInvite(invite) }) {
                        Text("Accept")
                    }
                    Button(onClick = { component.declineTeamInvite(invite) }) { Text("Decline") }
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

    if (selectedTeam != null) {
        Dialog(onDismissRequest = { component.deselectTeam() }) {
            CreateOrEditTeamDialog(
                team = selectedTeam!!,
                sports = sports,
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
                currentUser = currentUser,
                isNewTeam = createTeam,
                staffUsersById = staffUsersById,
                onEnsureUserByEmail = { email -> component.ensureUserByEmail(email) },
                onInviteTeamRole = { teamId, userId, inviteType ->
                    component.inviteUserToRole(teamId, userId, inviteType)
                },
            )
        }
    }
}
