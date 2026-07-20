package com.razumly.mvp.teamManagement

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FabPosition
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.core.data.dataTypes.isCaptainOrManager
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.NoScaffoldContentInsets
import com.razumly.mvp.core.presentation.composables.PlatformBackButton
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.PullToRefreshContainer
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.presentation.util.ShareServiceProvider
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
    val divisionTypeParameters by component.divisionTypeParameters.collectAsState()
    val suggestions by component.suggestedPlayers.collectAsState()
    val inviteFreeAgentContext by component.inviteFreeAgentContext.collectAsState()
    val freeAgents by component.freeAgentsFiltered.collectAsState()
    val selectedFreeAgent by component.selectedFreeAgent.collectAsState()
    val selectedEvent by component.selectedEvent.collectAsState()
    val selectedTeam by component.selectedTeam.collectAsState()
    val componentError by component.errorState.collectAsState()
    val staffUsersById by component.staffUsersById.collectAsState()
    val teamMemberCompliance by component.teamMemberCompliance.collectAsState()
    val loadingTeamMemberComplianceId by component.loadingTeamMemberComplianceId.collectAsState()
    val currentUser = component.currentUser
    val isCaptain = selectedTeam?.team?.isCaptainOrManager(currentUser.id) == true
    var createTeam by remember { mutableStateOf(false) }
    var isSavingTeam by remember(selectedTeam?.team?.id, createTeam) { mutableStateOf(false) }
    var isRequestingRefund by remember(selectedTeam?.team?.id, createTeam) { mutableStateOf(false) }
    var saveError by remember(selectedTeam?.team?.id, createTeam) { mutableStateOf<String?>(null) }
    var createdInviteLinks by remember { mutableStateOf<List<TeamBuilderCreatedInviteLink>>(emptyList()) }
    var inviteLinkDialogTitle by remember { mutableStateOf("Invite ready") }
    val shareService = remember { ShareServiceProvider().getShareService() }
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

    LaunchedEffect(selectedEvent?.id, selectedFreeAgent?.id) {
        if (selectedEvent != null && selectedFreeAgent == null && selectedTeam == null) {
            onCreateTeamClick()
        }
    }

    selectedTeam?.let { team ->
        val selectedTeamId = team.team.id.trim()
        if (createTeam) {
            CreateTeamBuilderScreen(
                draft = team,
                sports = sports,
                freeAgents = freeAgents,
                suggestions = suggestions,
                onSearch = component::searchPlayers,
                onMatchContact = component::matchSelectedContact,
                onFinish = { newTeam, personInvites, staffInvites ->
                    if (!isSavingTeam) {
                        isSavingTeam = true
                        saveError = null
                        component.createTeamFromBuilder(newTeam, personInvites, staffInvites) { result ->
                            isSavingTeam = false
                            result
                                .onSuccess { links ->
                                    inviteLinkDialogTitle = "Team created"
                                    createdInviteLinks = links
                                    onCloseTeamEditor()
                                }
                                .onFailure { saveError = it.userMessage("Save failed") }
                        }
                    }
                },
                onDismiss = onCloseTeamEditor,
                currentUser = currentUser,
                selectedEvent = selectedEvent,
                isSaving = isSavingTeam,
                saveError = saveError ?: componentError,
            )
            return
        }
        LaunchedEffect(team.team.id, createTeam, isCaptain) {
            if (!createTeam && isCaptain) {
                component.loadTeamMemberCompliance(selectedTeamId)
            }
        }
        CreateOrEditTeamScreen(
            team = team,
            sports = sports,
            divisionTypeParameters = divisionTypeParameters,
            friends = friends,
            freeAgents = freeAgents,
            inviteFreeAgentContext = inviteFreeAgentContext,
            onSearch = { query -> component.searchPlayers(query) },
            onMatchContact = component::matchSelectedContact,
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
                    component.updateTeam(newTeam, onResult)
                }
            },
            onLeaveTeam = { teamToLeave ->
                component.leaveTeam(teamToLeave)
                createTeam = false
            },
            onRequestRefund = { teamToRefund, reason ->
                if (!isRequestingRefund) {
                    isRequestingRefund = true
                    saveError = null
                    component.requestTeamRefund(teamToRefund, reason) { result ->
                        isRequestingRefund = false
                        result
                            .onSuccess { onCloseTeamEditor() }
                            .onFailure { saveError = it.userMessage("Refund request failed") }
                    }
                }
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
            isRequestingRefund = isRequestingRefund,
            saveError = saveError ?: componentError,
            memberCompliance = teamMemberCompliance[selectedTeamId],
            memberComplianceLoading = loadingTeamMemberComplianceId == selectedTeamId,
            staffUsersById = staffUsersById,
            onInviteTeamRole = { teamId, invite, onResult ->
                component.inviteUserToRole(teamId, invite) { result ->
                    result.onSuccess { link ->
                        if (link != null) {
                            inviteLinkDialogTitle = "Invite ready"
                            createdInviteLinks = listOf(link)
                        }
                    }
                    onResult(result)
                }
            },
            quoteInclusivePrice = component::quoteInclusivePrice,
        )
        TeamInviteLinksDialog(
            title = inviteLinkDialogTitle,
            inviteLinks = createdInviteLinks,
            onDismiss = { createdInviteLinks = emptyList() },
            onShare = { invite -> shareService.share("Join my BracketIQ team", invite.url) },
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            TeamManagementErrorFeedback(
                errorMessage = componentError,
                onDismiss = component::clearError,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            PullToRefreshContainer(
                isRefreshing = isCurrentTeamsLoading,
                onRefresh = component::refreshTeams,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
            ) {
                if (currentTeams.isEmpty()) {
                    if (isCurrentTeamsLoading) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(bottom = navBottomPadding),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator()
                        }
                    } else {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
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
                        modifier = Modifier.fillMaxSize(),
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
    }

    TeamInviteLinksDialog(
        title = inviteLinkDialogTitle,
        inviteLinks = createdInviteLinks,
        onDismiss = { createdInviteLinks = emptyList() },
        onShare = { invite -> shareService.share("Join my BracketIQ team", invite.url) },
    )
}

@Composable
private fun TeamInviteLinksDialog(
    title: String,
    inviteLinks: List<TeamBuilderCreatedInviteLink>,
    onDismiss: () -> Unit,
    onShare: (TeamBuilderCreatedInviteLink) -> Unit,
) {
    if (inviteLinks.isEmpty()) return
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Share each registration link with the intended player, manager, or coach.")
                LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp)) {
                    items(inviteLinks, key = { it.url }) { invite ->
                        Card(border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(invite.name, fontWeight = FontWeight.SemiBold)
                                    Text(
                                        "${invite.role} · ${if (invite.emailSent) "Email sent" else "Link ready"}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Button(onClick = { onShare(invite) }) {
                                    Text("Share")
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss) { Text("Done") }
        },
    )
}

@Composable
internal fun TeamManagementErrorFeedback(
    errorMessage: String?,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val message = errorMessage?.trim()?.takeIf(String::isNotBlank) ?: return
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
        ),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = message,
                color = MaterialTheme.colorScheme.onErrorContainer,
            )
            TextButton(onClick = onDismiss) {
                Text("Dismiss")
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
