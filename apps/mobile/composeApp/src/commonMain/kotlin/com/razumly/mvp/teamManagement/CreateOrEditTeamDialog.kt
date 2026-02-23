package com.razumly.mvp.teamManagement

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonColors
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.composables.InvitePlayerCard
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.SearchPlayerDialog
import kotlinx.coroutines.launch

private enum class TeamInviteTarget(val label: String, val inviteType: String?) {
    PLAYER("Player", "player"),
    MANAGER("Manager", "team_manager"),
    HEAD_COACH("Head Coach", "team_head_coach"),
    ASSISTANT_COACH("Assistant Coach", "team_assistant_coach"),
}

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
    selectedEvent: Event?,
    isCaptain: Boolean,
    currentUser: UserData,
    isNewTeam: Boolean,
    staffUsersById: Map<String, UserData> = emptyMap(),
    onEnsureUserByEmail: (suspend (email: String) -> Result<UserData>)? = null,
    onInviteTeamRole: ((teamId: String, userId: String, inviteType: String) -> Unit)? = null,
) {
    var teamName by remember { mutableStateOf(team.team.name ?: "") }
    var teamSizeInput by remember { mutableStateOf(team.team.teamSize.toString()) }
    var showSearchDialog by remember { mutableStateOf(false) }
    var invitedPlayers by remember { mutableStateOf(team.pendingPlayers) }
    var playersInTeam by remember { mutableStateOf(team.players) }
    var showLeaveTeamDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var inviteError by remember { mutableStateOf<String?>(null) }
    var inviteTarget by remember { mutableStateOf(TeamInviteTarget.PLAYER) }
    val scope = rememberCoroutineScope()
    val showEditDetails = isCaptain || isNewTeam
    val parsedTeamSize = teamSizeInput.toIntOrNull()
    val isTeamSizeValid = parsedTeamSize != null && parsedTeamSize > 0
    val resolvedTeamSize = parsedTeamSize ?: team.team.teamSize
    val knownUsersById = remember(
        staffUsersById,
        team.captain,
        playersInTeam,
        invitedPlayers,
        friends,
        freeAgents,
        suggestions,
    ) {
        buildMap {
            putAll(staffUsersById)
            put(team.captain.id, team.captain)
            playersInTeam.forEach { put(it.id, it) }
            invitedPlayers.forEach { put(it.id, it) }
            friends.forEach { put(it.id, it) }
            freeAgents.forEach { put(it.id, it) }
            suggestions.forEach { put(it.id, it) }
        }
    }
    val resolveUserName: (String?) -> String? = { userId ->
        userId
            ?.takeIf(String::isNotBlank)
            ?.let { knownUsersById[it]?.displayName ?: "Unknown user" }
    }
    val managerLabel = resolveUserName(team.team.managerId ?: team.team.captainId) ?: "Unassigned"
    val headCoachLabel = resolveUserName(team.team.headCoachId) ?: "Unassigned"
    val assistantCoachLabel = if (team.team.coachIds.isNotEmpty()) {
        team.team.coachIds.joinToString { coachId ->
            resolveUserName(coachId) ?: "Unknown user"
        }
    } else {
        "Unassigned"
    }

    Card(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(12.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Team Setup", style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(8.dp))

            inviteError?.let {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }

            PlatformTextField(
                value = teamName,
                onValueChange = {
                    teamName = it
                },
                modifier = Modifier.fillMaxWidth(),
                label = "Team Name",
                readOnly = !showEditDetails
            )

            Spacer(modifier = Modifier.height(12.dp))
            PlatformTextField(
                value = teamSizeInput,
                onValueChange = { teamSizeInput = it },
                modifier = Modifier.fillMaxWidth(),
                label = "Team Size",
                keyboardType = "number",
                inputFilter = { value -> value.filter(Char::isDigit) },
                readOnly = !showEditDetails,
                isError = showEditDetails && !isTeamSizeValid,
                supportingText = if (showEditDetails && !isTeamSizeValid) {
                    "Enter a team size greater than 0."
                } else {
                    ""
                },
            )

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
                        if (showEditDetails) {
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
                        if (showEditDetails) {
                            Button(onClick = {
                                invitedPlayers = invitedPlayers - player
                            }) {
                                Text("Remove")
                            }
                        }
                    }
                }
                if (playersInTeam.size + invitedPlayers.size < resolvedTeamSize || resolvedTeamSize == 7 && showEditDetails) {
                    item {
                        InvitePlayerCard {
                            inviteTarget = TeamInviteTarget.PLAYER
                            showSearchDialog = true
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            Text("Team Staff")
            Text(
                text = "Manager: $managerLabel",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = "Head Coach: $headCoachLabel",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = "Assistant Coaches: $assistantCoachLabel",
                style = MaterialTheme.typography.bodySmall,
            )
            if (showEditDetails && !isNewTeam) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(
                        onClick = {
                            inviteTarget = TeamInviteTarget.MANAGER
                            showSearchDialog = true
                        },
                        modifier = Modifier.weight(1f),
                    ) { Text("Invite Manager") }
                    OutlinedButton(
                        onClick = {
                            inviteTarget = TeamInviteTarget.HEAD_COACH
                            showSearchDialog = true
                        },
                        modifier = Modifier.weight(1f),
                    ) { Text("Invite Head Coach") }
                }
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = {
                        inviteTarget = TeamInviteTarget.ASSISTANT_COACH
                        showSearchDialog = true
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Invite Assistant Coach") }
            } else if (showEditDetails && isNewTeam) {
                Text(
                    text = "Save the team first to invite manager/coaches.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            Row(
                Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween
            ) {
                OutlinedButton(onClick = onDismiss) {
                    Text("Cancel")
                }
                if (showEditDetails) {
                    Button(onClick = {
                        onFinish(
                            team.team.copy(playerIds = playersInTeam.map { it.id },
                                pending = invitedPlayers.map { it.id },
                                name = teamName,
                                teamSize = resolvedTeamSize,
                            )
                        )
                    }, enabled = isTeamSizeValid) {
                        Text("Finish")
                    }
                } else {
                    Button(onClick = { showLeaveTeamDialog = true }) {
                        Text("Leave Team")
                    }
                }
            }

            if (isCaptain) {
                IconButton(onClick = { showDeleteDialog = true }, enabled = deleteEnabled,
                    colors = IconButtonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                        contentColor = MaterialTheme.colorScheme.onError,
                        disabledContainerColor = MaterialTheme.colorScheme.errorContainer,
                        disabledContentColor = MaterialTheme.colorScheme.onErrorContainer
                    ),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.Delete, contentDescription = "Trash")
                }
            }
        }
    }

    if (showDeleteDialog) {
        Dialog(onDismissRequest = { showDeleteDialog = false }) {
            Box(Modifier.fillMaxSize()) {
                Text("Are you sure you want to delete this team?")
                Button(onClick = {
                    onDelete(team)
                    showDeleteDialog = false
                }) {
                    Text("Yes")
                }
                Button(onClick = { showDeleteDialog = false }) {
                    Text("Cancel")
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
                        team.team.copy(playerIds = (playersInTeam - currentUser).map { it.id },
                            pending = invitedPlayers.map { it.id },
                            name = teamName,
                            teamSize = resolvedTeamSize
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
                if (inviteTarget == TeamInviteTarget.PLAYER) {
                    if (team.players.contains(it)) {
                        playersInTeam = playersInTeam + it
                    } else {
                        invitedPlayers = invitedPlayers + it
                    }
                } else {
                    val inviteType = inviteTarget.inviteType
                    if (inviteType != null) {
                        onInviteTeamRole?.invoke(team.team.id, it.id, inviteType)
                    }
                }
                showSearchDialog = false
            },
            onInviteByEmail = onEnsureUserByEmail?.let { ensure ->
                { email ->
                    inviteError = null
                    scope.launch {
                        ensure(email)
                            .onSuccess { user ->
                                if (inviteTarget == TeamInviteTarget.PLAYER) {
                                    val alreadySelected = playersInTeam.any { it.id == user.id } ||
                                        invitedPlayers.any { it.id == user.id }
                                    if (!alreadySelected) {
                                        invitedPlayers = invitedPlayers + user
                                    }
                                } else {
                                    val inviteType = inviteTarget.inviteType
                                    if (inviteType != null) {
                                        onInviteTeamRole?.invoke(team.team.id, user.id, inviteType)
                                    }
                                }
                            }
                            .onFailure { inviteError = it.message ?: "Invite failed" }
                    }
                }
            },
            onDismiss = { showSearchDialog = false },
            eventName = selectedEvent?.name ?: "",
            entryLabel = inviteTarget.label,
        )
    }
}
