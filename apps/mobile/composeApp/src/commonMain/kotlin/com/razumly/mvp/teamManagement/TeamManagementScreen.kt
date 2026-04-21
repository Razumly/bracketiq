package com.razumly.mvp.teamManagement

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Card
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FabPosition
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.core.data.dataTypes.isCaptainOrManager
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.NoScaffoldContentInsets
import com.razumly.mvp.core.presentation.composables.PlatformBackButton
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.util.LocalLoadingHandler

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeamManagementScreen(component: TeamManagementComponent) {
    val navBottomPadding = LocalNavBarPadding.current.calculateBottomPadding()
    val loadingHandler = LocalLoadingHandler.current
    val currentTeams by component.currentTeams.collectAsState()
    val isCurrentTeamsLoading by component.isCurrentTeamsLoading.collectAsState()
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
    val isCaptain = selectedTeam?.team?.isCaptainOrManager(currentUser.id) == true
    var createTeam by remember { mutableStateOf(false) }
    var isSavingTeam by remember(selectedTeam?.team?.id, createTeam) { mutableStateOf(false) }
    var saveError by remember(selectedTeam?.team?.id, createTeam) { mutableStateOf<String?>(null) }
    val deleteEnabled by component.enableDeleteTeam.collectAsState()

    LaunchedEffect(component, loadingHandler) {
        component.setLoadingHandler(loadingHandler)
    }
    val onCreateTeamClick = {
        createTeam = true
        component.selectTeam(null)
    }
    val onCloseTeamEditor = {
        createTeam = false
        component.deselectTeam()
    }

    selectedTeam?.let { team ->
        CreateOrEditTeamScreen(
            team = team,
            sports = sports,
            friends = friends,
            freeAgents = freeAgents,
            onSearch = { query -> component.searchPlayers(query) },
            suggestions = suggestions,
            onFinish = { newTeam ->
                if (!isSavingTeam) {
                    isSavingTeam = true
                    saveError = null
                    val onResult: (Result<Unit>) -> Unit = { result ->
                        isSavingTeam = false
                        result
                            .onSuccess { onCloseTeamEditor() }
                            .onFailure { saveError = it.userMessage("Save failed") }
                    }
                    if (createTeam) {
                        component.createTeam(newTeam, onResult)
                    } else {
                        component.updateTeam(newTeam, onResult)
                    }
                }
            },
            onLeaveTeam = { teamToLeave ->
                component.leaveTeam(teamToLeave)
                createTeam = false
            },
            onDismiss = onCloseTeamEditor,
            onDelete = { teamToDelete ->
                component.deleteTeam(teamToDelete)
                onCloseTeamEditor()
            },
            deleteEnabled = deleteEnabled,
            selectedEvent = selectedEvent,
            isCaptain = isCaptain,
            currentUser = currentUser,
            isNewTeam = createTeam,
            isSaving = isSavingTeam,
            saveError = saveError,
            staffUsersById = staffUsersById,
            onEnsureUserByEmail = { email -> component.ensureUserByEmail(email) },
            onInviteTeamRole = { teamId, userId, inviteType ->
                component.inviteUserToRole(teamId, userId, inviteType)
            },
        )
        return
    }

    Scaffold(
        contentWindowInsets = NoScaffoldContentInsets,
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Team Management") },
                navigationIcon = { PlatformBackButton(
                    onBack = { component.onBack() },
                    arrow = true,
                ) },
            )
        },
        floatingActionButton = {
            if (currentTeams.isNotEmpty()) {
                FloatingActionButton(
                    onClick = onCreateTeamClick,
                    modifier = Modifier.padding(bottom = navBottomPadding),
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Create New Team")
                }
            }
        },
        floatingActionButtonPosition = FabPosition.End
    ) { paddingValues ->
        if (currentTeams.isEmpty()) {
            if (isCurrentTeamsLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .padding(bottom = navBottomPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .padding(bottom = navBottomPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    EmptyTeamCallToAction(
                        onClick = onCreateTeamClick,
                        buttonSize = 112.dp,
                        icon = Icons.Default.Add,
                    ) {
                        Text("Create your first team", fontSize = 28.sp)
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(paddingValues),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = navBottomPadding + 16.dp),
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
                            createTeam = false
                            component.selectTeam(team)
                        }), team = team
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyTeamCallToAction(
    onClick: () -> Unit,
    buttonSize: Dp,
    icon: ImageVector,
    label: @Composable () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        label()
        FloatingActionButton(
            onClick = onClick,
            modifier = Modifier.size(buttonSize),
            shape = MaterialTheme.shapes.extraLarge,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = "Create New Team",
                modifier = Modifier.size(52.dp),
            )
        }
    }
}
