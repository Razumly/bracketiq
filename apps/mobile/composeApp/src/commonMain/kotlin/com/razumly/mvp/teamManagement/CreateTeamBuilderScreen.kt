package com.razumly.mvp.teamManagement

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.NoScaffoldContentInsets
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformBackButton
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.composables.formatPhoneInput
import com.razumly.mvp.core.util.newId
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

data class TeamBuilderPersonInvite(
    val id: String = newId(),
    val firstName: String = "",
    val lastName: String = "",
    val email: String = "",
    val phone: String = "",
)

enum class TeamBuilderStaffRole(val inviteType: String, val label: String) {
    MANAGER("team_manager", "Manager"),
    HEAD_COACH("team_head_coach", "Head coach"),
    ASSISTANT_COACH("team_assistant_coach", "Assistant coach"),
}

data class TeamBuilderStaffInvite(
    val user: UserData? = null,
    val role: TeamBuilderStaffRole = TeamBuilderStaffRole.MANAGER,
    val id: String = newId(),
    val firstName: String = "",
    val lastName: String = "",
    val email: String = "",
    val phone: String = "",
)

internal val TeamBuilderStaffInvite.displayName: String
    get() = user?.fullName?.takeIf(String::isNotBlank)
        ?: "$firstName $lastName".trim()

data class TeamBuilderCreatedInviteLink(
    val name: String,
    val role: String,
    val url: String,
    val emailSent: Boolean,
)

private enum class TeamBuilderStep(val label: String) {
    TEAM("Team"),
    FREE_AGENTS("Free agents"),
    STAFF("Staff"),
    INVITE("Invite players"),
    REVIEW("Review"),
}

private val TeamBuilderEmailRegex = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

@OptIn(ExperimentalMaterial3Api::class, ExperimentalTime::class)
@Composable
fun CreateTeamBuilderScreen(
    draft: TeamWithPlayers,
    sports: List<Sport>,
    freeAgents: List<UserData>,
    suggestions: List<UserData>,
    onSearch: (String) -> Unit,
    onFinish: (Team, List<TeamBuilderPersonInvite>, List<TeamBuilderStaffInvite>) -> Unit,
    onDismiss: () -> Unit,
    currentUser: UserData,
    selectedEvent: Event?,
    isSaving: Boolean = false,
    saveError: String? = null,
) {
    val navBottomPadding = LocalNavBarPadding.current.calculateBottomPadding()
    var step by remember(draft.team.id) { mutableStateOf(0) }
    var teamName by remember(draft.team.id) { mutableStateOf(draft.team.name) }
    var teamSizeInput by remember(draft.team.id, selectedEvent?.id) {
        mutableStateOf((selectedEvent?.teamSizeLimit?.takeIf { it >= 2 } ?: draft.team.teamSize.coerceAtLeast(2)).toString())
    }
    val selectedEventSportName = sports.firstOrNull { it.id == selectedEvent?.sportId }?.name.orEmpty()
    var sportInput by remember(draft.team.id, selectedEvent?.id) {
        mutableStateOf(draft.team.sport.orEmpty())
    }
    var isPlaying by remember(draft.team.id) { mutableStateOf(true) }
    var isCaptain by remember(draft.team.id) { mutableStateOf(true) }
    var isManager by remember(draft.team.id) { mutableStateOf(true) }
    var creatorCoachRole by remember(draft.team.id) { mutableStateOf("NONE") }
    var selectedFreeAgentIds by remember(draft.team.id) { mutableStateOf<Set<String>>(emptySet()) }
    var selectedAccountInvites by remember(draft.team.id) { mutableStateOf<List<UserData>>(emptyList()) }
    var personInvites by remember(draft.team.id) { mutableStateOf<List<TeamBuilderPersonInvite>>(emptyList()) }
    var searchQuery by remember(draft.team.id) { mutableStateOf("") }
    var staffSearchQuery by remember(draft.team.id) { mutableStateOf("") }
    var staffRole by remember(draft.team.id) { mutableStateOf(TeamBuilderStaffRole.MANAGER) }
    var staffInvites by remember(draft.team.id) { mutableStateOf<List<TeamBuilderStaffInvite>>(emptyList()) }
    var staffPersonEditor by remember(draft.team.id) { mutableStateOf<TeamBuilderStaffInvite?>(null) }
    var personEditor by remember(draft.team.id) { mutableStateOf<TeamBuilderPersonInvite?>(null) }
    var error by remember(draft.team.id) { mutableStateOf<String?>(null) }
    var showContactsPrompt by remember(draft.team.id) { mutableStateOf(false) }

    val showFreeAgents = selectedEvent?.start?.let { it > Clock.System.now() } == true &&
        (selectedEvent.freeAgentIds.isNotEmpty() || freeAgents.isNotEmpty())
    val steps = remember(showFreeAgents) {
        listOf(TeamBuilderStep.TEAM) +
            (if (showFreeAgents) listOf(TeamBuilderStep.FREE_AGENTS) else emptyList()) +
            listOf(TeamBuilderStep.STAFF, TeamBuilderStep.INVITE, TeamBuilderStep.REVIEW)
    }
    val activeStep = steps.getOrElse(step) { TeamBuilderStep.TEAM }

    LaunchedEffect(searchQuery, activeStep) {
        if (activeStep == TeamBuilderStep.INVITE && searchQuery.trim().length >= 2) onSearch(searchQuery.trim())
    }
    LaunchedEffect(staffSearchQuery, activeStep) {
        if (activeStep == TeamBuilderStep.STAFF && staffSearchQuery.trim().length >= 2) onSearch(staffSearchQuery.trim())
    }
    LaunchedEffect(selectedEventSportName) {
        if (selectedEventSportName.isNotBlank()) sportInput = selectedEventSportName
    }

    val resolvedTeamSize = teamSizeInput.toIntOrNull() ?: 0
    val selectedFreeAgents = freeAgents.filter { it.id in selectedFreeAgentIds }
    val rosterCount = (if (isPlaying) 1 else 0) + selectedFreeAgents.size + selectedAccountInvites.size + personInvites.size
    val openSlots = (resolvedTeamSize - rosterCount).coerceAtLeast(0)
    val isAtCapacity = resolvedTeamSize > 0 && rosterCount >= resolvedTeamSize
    val excludedIds = buildSet {
        add(currentUser.id)
        addAll(selectedFreeAgentIds)
        addAll(selectedAccountInvites.map(UserData::id))
    }
    val visibleSuggestions = suggestions.filterNot { it.id in excludedIds }
    val visibleStaffSuggestions = suggestions.filterNot { user ->
        user.id == currentUser.id || staffInvites.any { it.user?.id == user.id }
    }
    val sportOptions = sports.map { DropdownOption(it.name, it.name) }
    val selectedEventSportLocked = !selectedEvent?.sportId.isNullOrBlank()
    val staffRoleOptions = TeamBuilderStaffRole.entries.map { DropdownOption(it.inviteType, it.label) }
    val creatorCoachOptions = listOf(
        DropdownOption("NONE", "No coaching role"),
        DropdownOption("HEAD_COACH", "Head coach"),
        DropdownOption("ASSISTANT_COACH", "Assistant coach"),
    )

    fun validateBasics(): Boolean {
        val message = when {
            teamName.isBlank() -> "Team name is required."
            resolvedTeamSize < 2 -> "Team size must be 2 or above."
            sportInput.isBlank() -> "Select a sport."
            else -> null
        }
        error = message
        return message == null
    }

    fun addPerson() {
        val editor = personEditor ?: return
        val message = when {
            editor.firstName.isBlank() || editor.lastName.isBlank() -> "First and last name are required."
            editor.email.isNotBlank() && !TeamBuilderEmailRegex.matches(editor.email.trim()) -> "Enter a valid email or leave it blank."
            editor.id !in personInvites.map(TeamBuilderPersonInvite::id) && isAtCapacity -> "This roster is full."
            else -> null
        }
        if (message != null) {
            error = message
            return
        }
        personInvites = if (personInvites.any { it.id == editor.id }) {
            personInvites.map { if (it.id == editor.id) editor else it }
        } else {
            personInvites + editor
        }
        personEditor = null
        error = null
    }

    fun addStaffPerson() {
        val editor = staffPersonEditor ?: return
        val message = when {
            editor.firstName.isBlank() || editor.lastName.isBlank() -> "First and last name are required."
            editor.email.isNotBlank() && !TeamBuilderEmailRegex.matches(editor.email.trim()) -> "Enter a valid email or leave it blank."
            else -> null
        }
        if (message != null) {
            error = message
            return
        }
        val withoutExclusiveRole = if (editor.role == TeamBuilderStaffRole.MANAGER || editor.role == TeamBuilderStaffRole.HEAD_COACH) {
            staffInvites.filter { it.id == editor.id || it.role != editor.role }
        } else staffInvites
        staffInvites = if (withoutExclusiveRole.any { it.id == editor.id }) {
            withoutExclusiveRole.map { if (it.id == editor.id) editor else it }
        } else withoutExclusiveRole + editor
        if (editor.role == TeamBuilderStaffRole.MANAGER) isManager = false
        staffPersonEditor = null
        error = null
    }

    Scaffold(
        contentWindowInsets = NoScaffoldContentInsets,
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Create Team") },
                navigationIcon = { PlatformBackButton(onBack = onDismiss, arrow = true) },
            )
        },
        bottomBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .padding(bottom = navBottomPadding),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(
                    onClick = { if (step == 0) onDismiss() else { error = null; step -= 1 } },
                    modifier = Modifier.weight(1f).height(48.dp),
                    enabled = !isSaving,
                ) { Text(if (step == 0) "Cancel" else "Back") }
                Button(
                    onClick = {
                        if (activeStep == TeamBuilderStep.TEAM && !validateBasics()) return@Button
                        if (activeStep == TeamBuilderStep.STAFF && !isManager && staffInvites.none { it.role == TeamBuilderStaffRole.MANAGER }) {
                            error = "Choose a manager before continuing. You will remain the temporary manager until they accept."
                            return@Button
                        }
                        if (step < steps.lastIndex) {
                            error = null
                            step += 1
                        } else {
                            if (!validateBasics()) return@Button
                            val activePlayerIds = if (isPlaying) listOf(currentUser.id) else emptyList()
                            onFinish(
                                draft.team.copy(
                                    name = teamName.trim(),
                                    teamSize = resolvedTeamSize,
                                    sport = sportInput.trim(),
                                    division = draft.team.division.ifBlank { "Open" },
                                    captainId = if (isPlaying && isCaptain) currentUser.id else "",
                                    managerId = currentUser.id,
                                    headCoachId = currentUser.id.takeIf { creatorCoachRole == "HEAD_COACH" },
                                    coachIds = listOf(currentUser.id).takeIf { creatorCoachRole == "ASSISTANT_COACH" }.orEmpty(),
                                    playerIds = activePlayerIds,
                                    pending = (selectedFreeAgents + selectedAccountInvites).map(UserData::id).distinct(),
                                    joinPolicy = "CLOSED",
                                    openRegistration = false,
                                ),
                                personInvites,
                                staffInvites,
                            )
                        }
                    },
                    modifier = Modifier.weight(1f).height(48.dp),
                    enabled = !isSaving,
                ) { Text(if (step == steps.lastIndex) "Create team" else if (activeStep == TeamBuilderStep.INVITE) "Review team" else "Continue") }
            }
        },
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .testTag("team-builder-scroll")
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("STEP ${step + 1} OF ${steps.size}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    Text(activeStep.label, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                }
                Text("$rosterCount / $resolvedTeamSize spots", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(progress = { (step + 1f) / steps.size }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(16.dp))

            (error ?: saveError)?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(12.dp))
            }

            AnimatedContent(targetState = activeStep, label = "teamBuilderStep") { currentStep ->
                when (currentStep) {
                    TeamBuilderStep.TEAM -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        selectedEvent?.let { event ->
                            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                                Column(Modifier.padding(12.dp)) {
                                    Text("BUILDING FOR EVENT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                    Text(event.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                        StandardTextField(value = teamName, onValueChange = { teamName = it }, label = "Team name", placeholder = "e.g. Cascade Crew", modifier = Modifier.fillMaxWidth())
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            StandardTextField(value = teamSizeInput, onValueChange = { teamSizeInput = it }, label = "Team size", keyboardType = "number", inputFilter = { it.filter(Char::isDigit) }, modifier = Modifier.weight(1f))
                            PlatformDropdown(selectedValue = sportInput, onSelectionChange = { sportInput = it }, options = sportOptions, label = "Sport", placeholder = "Select sport", enabled = !selectedEventSportLocked, modifier = Modifier.weight(1f))
                        }
                    }

                    TeamBuilderStep.FREE_AGENTS -> Column {
                        Text("Invite free agents from this event", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text("Choose interested players now. Selected rows can be removed in this step.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(12.dp))
                        if (freeAgents.isEmpty()) {
                            EmptyBuilderCard(if (selectedEvent == null) "Free agents appear when you build from an event." else "No free agents have joined this event yet.")
                        } else {
                            LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp)) {
                                items(freeAgents, key = UserData::id) { user ->
                                    val selected = user.id in selectedFreeAgentIds
                                    PlayerCard(
                                        player = user,
                                        modifier = Modifier.fillMaxWidth(),
                                        trailingContent = {
                                            TextButton(
                                                onClick = {
                                                    error = null
                                                    selectedFreeAgentIds = if (selected) selectedFreeAgentIds - user.id else {
                                                        if (isAtCapacity) { error = "This roster is full."; selectedFreeAgentIds } else selectedFreeAgentIds + user.id
                                                    }
                                                },
                                                enabled = selected || !isAtCapacity,
                                            ) { Text(if (selected) "Remove" else "Add") }
                                        },
                                    )
                                }
                            }
                        }
                    }

                    TeamBuilderStep.STAFF -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Set team leadership", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text("Choose your roles, then search BracketIQ or invite a new manager or coach.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Card(border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                BuilderCheckbox(
                                    checked = isManager,
                                    label = "I will manage this team",
                                    description = "Turn this off when another invited manager will take over.",
                                    onCheckedChange = {
                                        isManager = it
                                        if (it) staffInvites = staffInvites.filterNot { invite -> invite.role == TeamBuilderStaffRole.MANAGER }
                                    },
                                )
                                BuilderCheckbox(
                                    checked = isPlaying,
                                    label = "I’m on the player roster",
                                    onCheckedChange = {
                                        isPlaying = it
                                        if (!it) isCaptain = false
                                    },
                                )
                                BuilderCheckbox(
                                    checked = isCaptain,
                                    label = "Make me captain",
                                    description = "The captain must be on the player roster.",
                                    enabled = isPlaying,
                                    onCheckedChange = { isCaptain = it },
                                )
                                PlatformDropdown(
                                    selectedValue = creatorCoachRole,
                                    onSelectionChange = { creatorCoachRole = it },
                                    options = creatorCoachOptions,
                                    label = "My coaching role",
                                    placeholder = "No coaching role",
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                        if (!isManager) {
                            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                                Text("You will remain the temporary manager until the invited manager accepts.", modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        StandardTextField(
                            value = staffSearchQuery,
                            onValueChange = { staffSearchQuery = it },
                            label = "Search BracketIQ staff",
                            placeholder = "Name or username",
                            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                            modifier = Modifier.fillMaxWidth().testTag("team-builder-staff-search"),
                        )
                        PlatformDropdown(
                            selectedValue = staffRole.inviteType,
                            onSelectionChange = { value ->
                                staffRole = TeamBuilderStaffRole.entries.firstOrNull { it.inviteType == value } ?: TeamBuilderStaffRole.MANAGER
                            },
                            options = staffRoleOptions,
                            label = "Role",
                            placeholder = "Manager",
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedButton(
                            onClick = { staffPersonEditor = TeamBuilderStaffInvite(role = staffRole) },
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                        ) {
                            Icon(Icons.Default.PersonAdd, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text("New staff member")
                        }
                        if (staffSearchQuery.trim().length >= 2 && visibleStaffSuggestions.isNotEmpty()) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(max = 180.dp)
                                    .verticalScroll(rememberScrollState()),
                            ) {
                                visibleStaffSuggestions.forEach { user ->
                                    PlayerCard(
                                        player = user,
                                        trailingContent = {
                                            TextButton(
                                                onClick = {
                                                val withoutUser = staffInvites.filterNot { it.user?.id == user.id }
                                                val withoutExclusiveRole = if (staffRole == TeamBuilderStaffRole.MANAGER || staffRole == TeamBuilderStaffRole.HEAD_COACH) {
                                                    withoutUser.filterNot { it.role == staffRole }
                                                } else withoutUser
                                                staffInvites = withoutExclusiveRole + TeamBuilderStaffInvite(user = user, role = staffRole)
                                                if (staffRole == TeamBuilderStaffRole.MANAGER) isManager = false
                                                staffSearchQuery = ""
                                                },
                                                modifier = Modifier.testTag("team-builder-staff-add-${user.id}"),
                                            ) { Text("Add") }
                                        },
                                    )
                                }
                            }
                        }
                        staffPersonEditor?.let { editor ->
                            Card(border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                        Text(if (staffInvites.any { it.id == editor.id }) "Edit staff invite" else "New staff member", fontWeight = FontWeight.SemiBold)
                                        IconButton(onClick = { staffPersonEditor = null }) { Icon(Icons.Default.Close, contentDescription = "Close staff editor") }
                                    }
                                    PlatformDropdown(
                                        selectedValue = editor.role.inviteType,
                                        onSelectionChange = { value ->
                                            staffPersonEditor = editor.copy(
                                                role = TeamBuilderStaffRole.entries.firstOrNull { it.inviteType == value } ?: editor.role,
                                            )
                                        },
                                        options = staffRoleOptions,
                                        label = "Team role",
                                        placeholder = "Manager",
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        StandardTextField(value = editor.firstName, onValueChange = { staffPersonEditor = editor.copy(firstName = it) }, label = "First name", modifier = Modifier.weight(1f).testTag("team-builder-staff-first"))
                                        StandardTextField(value = editor.lastName, onValueChange = { staffPersonEditor = editor.copy(lastName = it) }, label = "Last name", modifier = Modifier.weight(1f).testTag("team-builder-staff-last"))
                                    }
                                    StandardTextField(value = editor.email, onValueChange = { staffPersonEditor = editor.copy(email = it) }, label = "Email (optional)", keyboardType = "email", modifier = Modifier.fillMaxWidth().testTag("team-builder-staff-email"))
                                    StandardTextField(value = editor.phone, onValueChange = { staffPersonEditor = editor.copy(phone = it) }, label = "Phone (optional)", keyboardType = "phone", inputFilter = ::formatPhoneInput, modifier = Modifier.fillMaxWidth().testTag("team-builder-staff-phone"))
                                    Button(onClick = ::addStaffPerson, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                                        Text(if (TeamBuilderEmailRegex.matches(editor.email.trim())) "Send email invite" else "Save invite")
                                    }
                                }
                            }
                        }
                        HorizontalDivider()
                        Text("Team staff", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        BuilderStaff(
                            currentUser = currentUser,
                            isManager = isManager,
                            creatorCoachRole = creatorCoachRole,
                            invites = staffInvites,
                            editable = true,
                            onEdit = { selected ->
                                if (selected.user == null) {
                                    staffPersonEditor = selected
                                } else {
                                    staffInvites = staffInvites.filterNot { it.id == selected.id }
                                    staffRole = selected.role
                                    staffSearchQuery = selected.user.fullName
                                }
                            },
                            onRemove = { selected -> staffInvites = staffInvites.filterNot { it.id == selected.id } },
                        )
                    }

                    TeamBuilderStep.INVITE -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Add more players", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text("The roster below is the complete invite list.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { personEditor = TeamBuilderPersonInvite() }, enabled = !isAtCapacity, modifier = Modifier.weight(1f).height(48.dp)) {
                                Icon(Icons.Default.PersonAdd, contentDescription = null)
                                Spacer(Modifier.width(6.dp))
                                Text("New person")
                            }
                            OutlinedButton(onClick = { showContactsPrompt = true }, enabled = !isAtCapacity, modifier = Modifier.weight(1f).height(48.dp)) {
                                Icon(Icons.Default.Add, contentDescription = null)
                                Spacer(Modifier.width(6.dp))
                                Text("Contacts")
                            }
                        }
                        StandardTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            label = "Search BracketIQ",
                            placeholder = "Name or username",
                            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                            modifier = Modifier.fillMaxWidth().testTag("team-builder-player-search"),
                        )
                        if (searchQuery.trim().length >= 2 && visibleSuggestions.isNotEmpty()) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(max = 210.dp)
                                    .verticalScroll(rememberScrollState()),
                            ) {
                                visibleSuggestions.forEach { user ->
                                    PlayerCard(
                                        player = user,
                                        trailingContent = {
                                            TextButton(
                                                onClick = { if (!isAtCapacity) { selectedAccountInvites = selectedAccountInvites + user; searchQuery = "" } },
                                                enabled = !isAtCapacity,
                                                modifier = Modifier.testTag("team-builder-player-add-${user.id}"),
                                            ) { Text("Add") }
                                        },
                                    )
                                }
                            }
                        }
                        personEditor?.let { editor ->
                            Card(border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                        Text(if (personInvites.any { it.id == editor.id }) "Edit invite" else "New person", fontWeight = FontWeight.SemiBold)
                                        IconButton(onClick = { personEditor = null }) { Icon(Icons.Default.Close, contentDescription = "Close person editor") }
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        StandardTextField(value = editor.firstName, onValueChange = { personEditor = editor.copy(firstName = it) }, label = "First name", modifier = Modifier.weight(1f).testTag("team-builder-person-first"))
                                        StandardTextField(value = editor.lastName, onValueChange = { personEditor = editor.copy(lastName = it) }, label = "Last name", modifier = Modifier.weight(1f).testTag("team-builder-person-last"))
                                    }
                                    StandardTextField(value = editor.email, onValueChange = { personEditor = editor.copy(email = it) }, label = "Email (optional)", keyboardType = "email", modifier = Modifier.fillMaxWidth())
                                    StandardTextField(value = editor.phone, onValueChange = { personEditor = editor.copy(phone = it) }, label = "Phone (optional)", keyboardType = "phone", inputFilter = ::formatPhoneInput, modifier = Modifier.fillMaxWidth())
                                    Button(onClick = ::addPerson, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                                        Text(if (TeamBuilderEmailRegex.matches(editor.email.trim())) "Send email invite" else "Save invite")
                                    }
                                }
                            }
                        }
                        HorizontalDivider()
                        Text("Roster", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        BuilderRoster(
                            currentUser = currentUser,
                            includeCurrentUser = isPlaying,
                            currentUserIsCaptain = isCaptain,
                            freeAgents = selectedFreeAgents,
                            accounts = selectedAccountInvites,
                            people = personInvites,
                            openSlots = openSlots,
                            editable = true,
                            onEditAccount = { user -> selectedAccountInvites = selectedAccountInvites - user; searchQuery = user.fullName },
                            onRemoveAccount = { user -> selectedAccountInvites = selectedAccountInvites - user },
                            onEditPerson = { personEditor = it },
                            onRemovePerson = { person -> personInvites = personInvites.filterNot { it.id == person.id } },
                        )
                    }

                    TeamBuilderStep.REVIEW -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Card(border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                            Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                                Column {
                                    Text("TEAM", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(teamName.trim(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                                    Text("$sportInput · $resolvedTeamSize players", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                AssistChip(onClick = {}, label = { Text("$openSlots open") })
                            }
                        }
                        Text("Review staff", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text("Invited staff receive their role after accepting. A replacement manager takes over after acceptance.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        BuilderStaff(currentUser, isManager, creatorCoachRole, staffInvites, editable = false)
                        Text("Review roster", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text("Invitations are sent after the team is created. Free agents remain free agents until they accept.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        BuilderRoster(currentUser, isPlaying, isCaptain, selectedFreeAgents, selectedAccountInvites, personInvites, openSlots, editable = false)
                    }
                }
            }
        }
    }

    if (showContactsPrompt) {
        AlertDialog(
            onDismissRequest = { showContactsPrompt = false },
            title = { Text("Add from contacts") },
            text = { Text("Continue to enter a contact's name, email, or phone. BracketIQ only saves the details you add to this invite.") },
            confirmButton = {
                Button(onClick = {
                    showContactsPrompt = false
                    personEditor = TeamBuilderPersonInvite()
                }) { Text("Continue") }
            },
            dismissButton = { TextButton(onClick = { showContactsPrompt = false }) { Text("Not now") } },
        )
    }
}

@Composable
private fun BuilderCheckbox(
    checked: Boolean,
    label: String,
    description: String? = null,
    enabled: Boolean = true,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
        Column {
            Text(label, style = MaterialTheme.typography.bodyLarge, color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
            description?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
private fun BuilderStaff(
    currentUser: UserData,
    isManager: Boolean,
    creatorCoachRole: String,
    invites: List<TeamBuilderStaffInvite>,
    editable: Boolean,
    onEdit: (TeamBuilderStaffInvite) -> Unit = {},
    onRemove: (TeamBuilderStaffInvite) -> Unit = {},
) {
    val creatorRows = buildList {
        if (isManager) add("Manager" to "Active")
        if (creatorCoachRole == "HEAD_COACH") add("Head coach" to "Active")
        if (creatorCoachRole == "ASSISTANT_COACH") add("Assistant coach" to "Active")
        if (!isManager) add("Temporary manager" to "Until the invited manager accepts")
    }
    LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 240.dp).testTag("team-builder-staff-list-${invites.size}")) {
        items(creatorRows, key = { "creator-${it.first}" }) { row ->
            PlayerCard(
                player = currentUser,
                trailingContent = { Column(horizontalAlignment = Alignment.End) { Text(row.first, style = MaterialTheme.typography.labelMedium); Text(row.second, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
            )
        }
        items(invites, key = { "staff-${it.id}" }) { invite ->
            val trailingContent: @Composable () -> Unit = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(horizontalAlignment = Alignment.End) {
                        Text(invite.role.label, style = MaterialTheme.typography.labelMedium)
                        Text("Invite pending", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    }
                    if (editable) {
                        TextButton(onClick = { onEdit(invite) }) {
                            Icon(Icons.Default.Edit, contentDescription = null)
                            Spacer(Modifier.width(4.dp))
                            Text("Edit")
                        }
                        IconButton(onClick = { onRemove(invite) }, modifier = Modifier.semantics { contentDescription = "Remove ${invite.displayName}" }) {
                            Icon(Icons.Default.Close, contentDescription = null)
                        }
                    }
                }
            }
            invite.user?.let { user ->
                PlayerCard(player = user, isPending = true, trailingContent = trailingContent)
            } ?: Card(border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f)) {
                        Text(invite.displayName, fontWeight = FontWeight.Medium)
                        Text(invite.email.ifBlank { invite.phone.ifBlank { "Share link invite" } }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    trailingContent()
                }
            }
        }
    }
}

@Composable
private fun BuilderRoster(
    currentUser: UserData,
    includeCurrentUser: Boolean,
    currentUserIsCaptain: Boolean,
    freeAgents: List<UserData>,
    accounts: List<UserData>,
    people: List<TeamBuilderPersonInvite>,
    openSlots: Int,
    editable: Boolean,
    onEditAccount: (UserData) -> Unit = {},
    onRemoveAccount: (UserData) -> Unit = {},
    onEditPerson: (TeamBuilderPersonInvite) -> Unit = {},
    onRemovePerson: (TeamBuilderPersonInvite) -> Unit = {},
) {
    val rowCount = (if (includeCurrentUser) 1 else 0) + freeAgents.size + accounts.size + people.size + openSlots
    LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp)) {
        if (includeCurrentUser) {
            item("captain") { PlayerCard(player = currentUser, trailingContent = { AssistChip(onClick = {}, label = { Text(if (currentUserIsCaptain) "Captain" else "Player") }) }) }
        }
        items(freeAgents, key = { "free-${it.id}" }) { user ->
            PlayerCard(player = user, isPending = true, trailingContent = { Text("Invite pending", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary) })
        }
        items(accounts, key = { "account-${it.id}" }) { user ->
            PlayerCard(
                player = user,
                isPending = true,
                trailingContent = if (editable) {{
                    Row {
                        TextButton(onClick = { onEditAccount(user) }) { Icon(Icons.Default.Edit, contentDescription = null); Spacer(Modifier.width(4.dp)); Text("Edit") }
                        IconButton(onClick = { onRemoveAccount(user) }, modifier = Modifier.semantics { contentDescription = "Remove ${user.fullName}" }) { Icon(Icons.Default.Close, contentDescription = null) }
                    }
                }} else null,
            )
        }
        items(people, key = TeamBuilderPersonInvite::id) { person ->
            Card(border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f)) {
                        Text("${person.firstName} ${person.lastName}".trim(), fontWeight = FontWeight.Medium)
                        Text(person.email.ifBlank { person.phone.ifBlank { "Share link invite" } }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (editable) {
                        TextButton(onClick = { onEditPerson(person) }) { Icon(Icons.Default.Edit, contentDescription = null); Spacer(Modifier.width(4.dp)); Text("Edit") }
                        IconButton(onClick = { onRemovePerson(person) }, modifier = Modifier.semantics { contentDescription = "Remove ${person.firstName} ${person.lastName}" }) { Icon(Icons.Default.Close, contentDescription = null) }
                    } else {
                        Text("Invite pending", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
        items(openSlots) { index -> EmptyRosterSpot(index) }
        if (rowCount == 0) item("empty") { EmptyBuilderCard("No players added yet.") }
    }
}

@Composable
private fun EmptyRosterSpot(index: Int) {
    Card(border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f))) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.PersonAdd, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(10.dp))
            Text("Open roster spot ${index + 1}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun EmptyBuilderCard(message: String) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f))) {
        Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
            Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
