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
import com.razumly.mvp.core.data.util.DEFAULT_AGE_DIVISION
import com.razumly.mvp.core.data.util.DEFAULT_AGE_DIVISION_OPTIONS
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION_OPTIONS
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeId
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeName
import com.razumly.mvp.core.data.util.buildGenderSkillAgeDivisionToken
import com.razumly.mvp.core.data.util.inferDivisionDetail
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionDetail
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.data.util.parseCombinedDivisionTypeId
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.InvitePlayerCard
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
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

private val TEAM_DIVISION_GENDER_OPTIONS = listOf(
    DropdownOption(value = "M", label = "Men"),
    DropdownOption(value = "F", label = "Women"),
    DropdownOption(value = "C", label = "Coed"),
)

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
    val normalizedEventDivisionDetails = remember(
        selectedEvent?.id,
        selectedEvent?.divisions,
        selectedEvent?.divisionDetails,
    ) {
        if (selectedEvent == null) {
            emptyList()
        } else {
            val selectedEventDivisionIds = (
                selectedEvent.divisions +
                    selectedEvent.divisionDetails.map { detail -> detail.id } +
                    selectedEvent.divisionDetails.map { detail -> detail.key }
                ).normalizeDivisionIdentifiers()
            mergeDivisionDetailsForDivisions(
                divisions = selectedEventDivisionIds,
                existingDetails = selectedEvent.divisionDetails,
                eventId = selectedEvent.id,
            ).map { detail ->
                detail.normalizeDivisionDetail(selectedEvent.id)
            }
        }
    }
    val skillDivisionOptions = remember(normalizedEventDivisionDetails) {
        val options = linkedMapOf<String, String>()
        fun addOption(id: String, label: String? = null) {
            val normalizedId = id.normalizeDivisionIdentifier()
            if (normalizedId.isBlank()) return
            options[normalizedId] = label?.trim()?.takeIf(String::isNotBlank)
                ?: normalizedId.toDivisionDisplayLabel()
        }

        DEFAULT_DIVISION_OPTIONS.forEach { divisionTypeId ->
            addOption(divisionTypeId)
        }
        normalizedEventDivisionDetails.forEach { detail ->
            addOption(
                id = detail.skillDivisionTypeId,
                label = detail.skillDivisionTypeName,
            )
        }
        options.map { (value, label) -> DropdownOption(value = value, label = label) }
    }
    val ageDivisionOptions = remember(normalizedEventDivisionDetails) {
        val options = linkedMapOf<String, String>()
        fun addOption(id: String, label: String? = null) {
            val normalizedId = id.normalizeDivisionIdentifier()
            if (normalizedId.isBlank()) return
            options[normalizedId] = label?.trim()?.takeIf(String::isNotBlank)
                ?: normalizedId.toDivisionDisplayLabel()
        }

        DEFAULT_AGE_DIVISION_OPTIONS.forEach { divisionTypeId ->
            addOption(divisionTypeId)
        }
        normalizedEventDivisionDetails.forEach { detail ->
            addOption(
                id = detail.ageDivisionTypeId,
                label = detail.ageDivisionTypeName,
            )
        }
        options.map { (value, label) -> DropdownOption(value = value, label = label) }
    }
    val skillDivisionOptionById = remember(skillDivisionOptions) {
        skillDivisionOptions.associateBy(
            keySelector = { option -> option.value.normalizeDivisionIdentifier() },
            valueTransform = { option -> option.label },
        )
    }
    val ageDivisionOptionById = remember(ageDivisionOptions) {
        ageDivisionOptions.associateBy(
            keySelector = { option -> option.value.normalizeDivisionIdentifier() },
            valueTransform = { option -> option.label },
        )
    }
    val inferredTeamDivisionDetail = remember(
        team.team.division,
        team.team.divisionTypeId,
        team.team.skillDivisionTypeId,
        team.team.skillDivisionTypeName,
        team.team.ageDivisionTypeId,
        team.team.ageDivisionTypeName,
        team.team.divisionGender,
    ) {
        val inferredFromDivision = inferDivisionDetail(team.team.division)
        val parsedCombinedDivisionTypeId = parseCombinedDivisionTypeId(team.team.divisionTypeId)
        val resolvedSkillDivisionTypeId = team.team.skillDivisionTypeId
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
            ?: parsedCombinedDivisionTypeId?.skillDivisionTypeId
            ?: inferredFromDivision.skillDivisionTypeId.normalizeDivisionIdentifier().ifBlank { DEFAULT_DIVISION }
        val resolvedAgeDivisionTypeId = team.team.ageDivisionTypeId
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
            ?: parsedCombinedDivisionTypeId?.ageDivisionTypeId
            ?: inferredFromDivision.ageDivisionTypeId.normalizeDivisionIdentifier()
                .ifBlank { DEFAULT_AGE_DIVISION }
        val resolvedGender = team.team.divisionGender
            ?.trim()
            ?.uppercase()
            ?.takeIf { it == "M" || it == "F" || it == "C" }
            ?: inferredFromDivision.gender.trim().uppercase().ifBlank { "C" }
        inferredFromDivision.copy(
            skillDivisionTypeId = resolvedSkillDivisionTypeId,
            ageDivisionTypeId = resolvedAgeDivisionTypeId,
            skillDivisionTypeName = team.team.skillDivisionTypeName
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: inferredFromDivision.skillDivisionTypeName,
            ageDivisionTypeName = team.team.ageDivisionTypeName
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: inferredFromDivision.ageDivisionTypeName,
            gender = resolvedGender,
        )
    }
    var divisionGenderInput by remember(team.team.id) {
        mutableStateOf(inferredTeamDivisionDetail.gender.ifBlank { "C" })
    }
    var skillDivisionTypeInput by remember(team.team.id) {
        mutableStateOf(
            inferredTeamDivisionDetail.skillDivisionTypeId.normalizeDivisionIdentifier()
                .ifBlank { DEFAULT_DIVISION },
        )
    }
    var ageDivisionTypeInput by remember(team.team.id) {
        mutableStateOf(
            inferredTeamDivisionDetail.ageDivisionTypeId.normalizeDivisionIdentifier()
                .ifBlank { DEFAULT_AGE_DIVISION },
        )
    }
    val normalizedDivisionGender = divisionGenderInput.trim().uppercase()
    val normalizedSkillDivisionTypeId = skillDivisionTypeInput.normalizeDivisionIdentifier()
    val normalizedAgeDivisionTypeId = ageDivisionTypeInput.normalizeDivisionIdentifier()
    val isTeamDivisionValid = normalizedDivisionGender in setOf("M", "F", "C") &&
        normalizedSkillDivisionTypeId.isNotBlank() &&
        normalizedAgeDivisionTypeId.isNotBlank()
    val resolvedSkillDivisionTypeName = skillDivisionOptionById[normalizedSkillDivisionTypeId]
        ?: inferredTeamDivisionDetail.skillDivisionTypeName.takeIf(String::isNotBlank)
        ?: normalizedSkillDivisionTypeId.toDivisionDisplayLabel()
    val resolvedAgeDivisionTypeName = ageDivisionOptionById[normalizedAgeDivisionTypeId]
        ?: inferredTeamDivisionDetail.ageDivisionTypeName.takeIf(String::isNotBlank)
        ?: normalizedAgeDivisionTypeId.toDivisionDisplayLabel()
    val resolvedDivisionTypeId = buildCombinedDivisionTypeId(
        skillDivisionTypeId = normalizedSkillDivisionTypeId,
        ageDivisionTypeId = normalizedAgeDivisionTypeId,
    )
    val resolvedDivisionTypeName = buildCombinedDivisionTypeName(
        skillDivisionTypeName = resolvedSkillDivisionTypeName,
        ageDivisionTypeName = resolvedAgeDivisionTypeName,
    )
    val resolvedDivisionToken = buildGenderSkillAgeDivisionToken(
        gender = normalizedDivisionGender,
        skillDivisionTypeId = normalizedSkillDivisionTypeId,
        ageDivisionTypeId = normalizedAgeDivisionTypeId,
    )
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
            Text("Team Division")
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                PlatformDropdown(
                    selectedValue = divisionGenderInput,
                    onSelectionChange = { value ->
                        divisionGenderInput = value
                    },
                    options = TEAM_DIVISION_GENDER_OPTIONS,
                    modifier = Modifier.weight(1f),
                    label = "Gender",
                    placeholder = "Select gender",
                    enabled = showEditDetails,
                )
                PlatformDropdown(
                    selectedValue = skillDivisionTypeInput,
                    onSelectionChange = { value ->
                        skillDivisionTypeInput = value
                    },
                    options = skillDivisionOptions,
                    modifier = Modifier.weight(1f),
                    label = "Skill Division",
                    placeholder = "Select skill",
                    enabled = showEditDetails,
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            PlatformDropdown(
                selectedValue = ageDivisionTypeInput,
                onSelectionChange = { value ->
                    ageDivisionTypeInput = value
                },
                options = ageDivisionOptions,
                modifier = Modifier.fillMaxWidth(),
                label = "Age Division",
                placeholder = "Select age",
                enabled = showEditDetails,
            )
            if (showEditDetails && !isTeamDivisionValid) {
                Text(
                    text = "Select gender, skill division, and age division.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 4.dp),
                )
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
                                division = resolvedDivisionToken,
                                divisionTypeId = resolvedDivisionTypeId,
                                divisionTypeName = resolvedDivisionTypeName,
                                skillDivisionTypeId = normalizedSkillDivisionTypeId,
                                skillDivisionTypeName = resolvedSkillDivisionTypeName,
                                ageDivisionTypeId = normalizedAgeDivisionTypeId,
                                ageDivisionTypeName = resolvedAgeDivisionTypeName,
                                divisionGender = normalizedDivisionGender,
                            )
                        )
                    }, enabled = isTeamSizeValid && isTeamDivisionValid) {
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
