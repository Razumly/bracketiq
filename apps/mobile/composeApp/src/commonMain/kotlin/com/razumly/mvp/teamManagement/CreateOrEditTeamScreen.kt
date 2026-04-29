package com.razumly.mvp.teamManagement

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonColors
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.TeamStaffAssignment
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.activeStaffAssignments
import com.razumly.mvp.core.data.dataTypes.isStarted
import com.razumly.mvp.core.data.dataTypes.normalizedRole
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.data.repositories.TeamInviteEventTeamOption
import com.razumly.mvp.core.data.repositories.TeamInviteFreeAgentContext
import com.razumly.mvp.core.data.util.DEFAULT_AGE_DIVISION
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION
import com.razumly.mvp.core.data.util.DivisionRatingType
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeId
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeName
import com.razumly.mvp.core.data.util.buildGenderSkillAgeDivisionToken
import com.razumly.mvp.core.data.util.getDefaultDivisionTypeSelectionsForSport
import com.razumly.mvp.core.data.util.getDivisionTypeById
import com.razumly.mvp.core.data.util.getDivisionTypeOptionsForSport
import com.razumly.mvp.core.data.util.inferDivisionDetail
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionDetail
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.data.util.parseCombinedDivisionTypeId
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.NoScaffoldContentInsets
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.InvitePlayerCard
import com.razumly.mvp.core.presentation.composables.PlatformBackButton
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.StandardTextField
import kotlinx.coroutines.launch

internal enum class TeamInviteTarget(val label: String, val inviteType: String?) {
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

private fun normalizeJerseyNumberInput(value: String?): String =
    value.orEmpty().filter(Char::isDigit).take(3)

internal fun formatRegistrationCostInput(registrationPriceCents: Int): String =
    registrationPriceCents
        .takeIf { it > 0 }
        ?.toString()
        .orEmpty()

internal fun syncedRegistrationInputs(
    registrationSettingsEdited: Boolean,
    openRegistrationInput: Boolean,
    registrationCostInput: String,
    sourceOpenRegistration: Boolean,
    sourceRegistrationPriceCents: Int,
): Pair<Boolean, String> = if (registrationSettingsEdited) {
    openRegistrationInput to registrationCostInput
} else {
    sourceOpenRegistration to formatRegistrationCostInput(sourceRegistrationPriceCents)
}

internal fun resolvedRegistrationPriceCents(
    openRegistration: Boolean,
    canChargeRegistration: Boolean,
    registrationPriceCentsInput: Int,
): Int = if (openRegistration && canChargeRegistration) {
    registrationPriceCentsInput
} else {
    0
}

private fun formatRegistrationCost(openRegistration: Boolean, registrationPriceCents: Int): String =
    when {
        !openRegistration -> "Not open"
        registrationPriceCents <= 0 -> "Free"
        else -> {
            val dollars = registrationPriceCents / 100
            val cents = registrationPriceCents % 100
            "\$$dollars.${cents.toString().padStart(2, '0')}"
        }
    }

private fun String.isProbablyEmail(): Boolean {
    val value = trim()
    if (value.isBlank() || value.length > 254 || value.any(Char::isWhitespace)) return false
    val at = value.indexOf('@')
    if (at <= 0 || at != value.lastIndexOf('@')) return false
    val dot = value.lastIndexOf('.')
    return dot > at + 1 && dot < value.length - 1
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateOrEditTeamScreen(
    team: TeamWithPlayers,
    sports: List<Sport>,
    friends: List<UserData>,
    freeAgents: List<UserData>,
    inviteFreeAgentContext: TeamInviteFreeAgentContext = TeamInviteFreeAgentContext(),
    suggestions: List<UserData>,
    onSearch: (String) -> Unit,
    onFinish: (Team) -> Unit,
    onLeaveTeam: (Team) -> Unit = {},
    onDelete: (TeamWithPlayers) -> Unit,
    onDismiss: () -> Unit,
    deleteEnabled: Boolean,
    selectedEvent: Event?,
    isCaptain: Boolean,
    currentUser: UserData,
    isNewTeam: Boolean,
    isSaving: Boolean = false,
    saveError: String? = null,
    staffUsersById: Map<String, UserData> = emptyMap(),
    onEnsureUserByEmail: (suspend (email: String) -> Result<UserData>)? = null,
    onInviteTeamRole: ((
        teamId: String,
        userId: String?,
        inviteType: String,
        eventTeamIds: List<String>,
        email: String?,
    ) -> Unit)? = null,
) {
    val navBottomPadding = LocalNavBarPadding.current.calculateBottomPadding()
    val syncedTeam = remember(team.team) { team.team.withSynchronizedMembership() }
    var teamName by remember { mutableStateOf(team.team.name) }
    var teamSizeInput by remember { mutableStateOf(team.team.teamSize.toString()) }
    var openRegistrationInput by remember(team.team.id) { mutableStateOf(team.team.openRegistration) }
    var registrationCostInput by remember(team.team.id) {
        mutableStateOf(formatRegistrationCostInput(team.team.registrationPriceCents))
    }
    var registrationSettingsEdited by remember(team.team.id) { mutableStateOf(false) }
    var showSearchDialog by remember { mutableStateOf(false) }
    var invitedPlayers by remember { mutableStateOf(team.pendingPlayers) }
    var playersInTeam by remember { mutableStateOf(team.players) }
    var jerseyNumbersByUserId by remember(team.team.id, syncedTeam.playerRegistrations) {
        mutableStateOf(
            syncedTeam.playerRegistrations.associate { registration ->
                registration.userId to normalizeJerseyNumberInput(registration.jerseyNumber)
            }
        )
    }
    var showLeaveTeamDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var inviteError by remember { mutableStateOf<String?>(null) }
    var inviteTarget by remember { mutableStateOf(TeamInviteTarget.PLAYER) }
    var sportInput by remember(team.team.id) { mutableStateOf(team.team.sport?.trim().orEmpty()) }
    val scope = rememberCoroutineScope()
    val showEditDetails = isCaptain || isNewTeam
    val canEditFields = showEditDetails && !isSaving
    val canChargeRegistration = currentUser.hasStripeAccount == true || team.team.registrationPriceCents > 0
    val parsedTeamSize = teamSizeInput.toIntOrNull()
    val isTeamSizeValid = parsedTeamSize != null && parsedTeamSize > 0
    val resolvedTeamSize = parsedTeamSize ?: team.team.teamSize
    val playerCapacityUserIds = remember(playersInTeam, invitedPlayers, syncedTeam.playerRegistrations) {
        buildSet {
            playersInTeam.map(UserData::id).filter(String::isNotBlank).forEach(::add)
            invitedPlayers.map(UserData::id).filter(String::isNotBlank).forEach(::add)
            syncedTeam.playerRegistrations
                .filter(TeamPlayerRegistration::isStarted)
                .map(TeamPlayerRegistration::userId)
                .filter(String::isNotBlank)
                .forEach(::add)
        }
    }
    val playerCapacityCount = playerCapacityUserIds.size
    val canInvitePlayer = resolvedTeamSize <= 0 || playerCapacityCount < resolvedTeamSize
    val playerCapacityMessage = if (resolvedTeamSize > 0) {
        "This team already has $playerCapacityCount of $resolvedTeamSize player slots filled. Remove a player or pending invite, or increase team size before inviting another player."
    } else {
        ""
    }
    val registrationPriceCentsInput = (registrationCostInput.toIntOrNull() ?: 0)
        .coerceAtLeast(0)
    val resolvedEventSportName = remember(selectedEvent?.sportId, sports) {
        val normalizedEventSportId = selectedEvent?.sportId?.trim().orEmpty()
        if (normalizedEventSportId.isBlank()) {
            ""
        } else {
            sports.firstOrNull { sport -> sport.id == normalizedEventSportId }?.name
                ?: normalizedEventSportId
        }
    }
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
    val divisionSportInput = remember(sportInput, resolvedEventSportName) {
        sportInput.trim().ifBlank { resolvedEventSportName.trim() }
    }
    val sportDivisionTypeOptions = remember(divisionSportInput) {
        getDivisionTypeOptionsForSport(divisionSportInput)
    }
    val selectedSportMatchesEventSport = remember(
        divisionSportInput,
        resolvedEventSportName,
        selectedEvent?.sportId,
        sports,
    ) {
        val normalizedDivisionSport = divisionSportInput.trim()
        if (selectedEvent == null || normalizedDivisionSport.isBlank()) {
            true
        } else {
            val matchingSportId = sports.firstOrNull { sport ->
                sport.name.trim().equals(normalizedDivisionSport, ignoreCase = true) ||
                    sport.id.trim().equals(normalizedDivisionSport, ignoreCase = true)
            }?.id?.trim().orEmpty()
            normalizedDivisionSport.equals(resolvedEventSportName.trim(), ignoreCase = true) ||
                normalizedDivisionSport.equals(selectedEvent.sportId?.trim().orEmpty(), ignoreCase = true) ||
                (matchingSportId.isNotBlank() &&
                    matchingSportId.equals(selectedEvent.sportId?.trim().orEmpty(), ignoreCase = true))
        }
    }
    val eventDivisionOptions = remember(normalizedEventDivisionDetails, selectedSportMatchesEventSport) {
        if (selectedSportMatchesEventSport) {
            normalizedEventDivisionDetails
        } else {
            emptyList()
        }
    }
    val skillDivisionOptions = remember(
        sportDivisionTypeOptions,
        eventDivisionOptions,
        inferredTeamDivisionDetail.skillDivisionTypeId,
        inferredTeamDivisionDetail.skillDivisionTypeName,
    ) {
        val options = linkedMapOf<String, String>()
        fun addOption(id: String, label: String? = null) {
            val normalizedId = id.normalizeDivisionIdentifier()
            if (normalizedId.isBlank()) return
            options[normalizedId] = label?.trim()?.takeIf(String::isNotBlank)
                ?: normalizedId.toDivisionDisplayLabel()
        }

        sportDivisionTypeOptions
            .filter { option -> option.ratingType == DivisionRatingType.SKILL }
            .forEach { option ->
                addOption(option.id, option.name)
            }
        eventDivisionOptions.forEach { detail ->
            addOption(
                id = detail.skillDivisionTypeId,
                label = detail.skillDivisionTypeName,
            )
        }
        addOption(
            id = inferredTeamDivisionDetail.skillDivisionTypeId,
            label = inferredTeamDivisionDetail.skillDivisionTypeName,
        )
        options.map { (value, label) -> DropdownOption(value = value, label = label) }
    }
    val ageDivisionOptions = remember(
        sportDivisionTypeOptions,
        eventDivisionOptions,
        inferredTeamDivisionDetail.ageDivisionTypeId,
        inferredTeamDivisionDetail.ageDivisionTypeName,
    ) {
        val options = linkedMapOf<String, String>()
        fun addOption(id: String, label: String? = null) {
            val normalizedId = id.normalizeDivisionIdentifier()
            if (normalizedId.isBlank()) return
            options[normalizedId] = label?.trim()?.takeIf(String::isNotBlank)
                ?: normalizedId.toDivisionDisplayLabel()
        }

        sportDivisionTypeOptions
            .filter { option -> option.ratingType == DivisionRatingType.AGE }
            .forEach { option ->
                addOption(option.id, option.name)
            }
        eventDivisionOptions.forEach { detail ->
            addOption(
                id = detail.ageDivisionTypeId,
                label = detail.ageDivisionTypeName,
            )
        }
        addOption(
            id = inferredTeamDivisionDetail.ageDivisionTypeId,
            label = inferredTeamDivisionDetail.ageDivisionTypeName,
        )
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
    val normalizedTeamName = teamName.trim()
    val normalizedSportName = sportInput.trim()
    val normalizedSkillDivisionTypeId = skillDivisionTypeInput.normalizeDivisionIdentifier()
    val normalizedAgeDivisionTypeId = ageDivisionTypeInput.normalizeDivisionIdentifier()
    val defaultDivisionTypeSelections = remember(divisionSportInput) {
        getDefaultDivisionTypeSelectionsForSport(divisionSportInput)
    }
    val isTeamDivisionValid = normalizedDivisionGender in setOf("M", "F", "C") &&
        normalizedSkillDivisionTypeId.isNotBlank() &&
        normalizedAgeDivisionTypeId.isNotBlank()
    val resolvedSkillDivisionTypeName = skillDivisionOptionById[normalizedSkillDivisionTypeId]
        ?: getDivisionTypeById(
            sportInput = divisionSportInput,
            divisionTypeId = normalizedSkillDivisionTypeId,
            ratingType = DivisionRatingType.SKILL,
        )?.name
        ?: inferredTeamDivisionDetail.skillDivisionTypeName.takeIf(String::isNotBlank)
        ?: normalizedSkillDivisionTypeId.toDivisionDisplayLabel()
    val resolvedAgeDivisionTypeName = ageDivisionOptionById[normalizedAgeDivisionTypeId]
        ?: getDivisionTypeById(
            sportInput = divisionSportInput,
            divisionTypeId = normalizedAgeDivisionTypeId,
            ratingType = DivisionRatingType.AGE,
        )?.name
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
    val sportOptions = remember(sports, team.team.sport, resolvedEventSportName) {
        val optionLabels = linkedSetOf<String>()
        team.team.sport
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let(optionLabels::add)
        resolvedEventSportName
            .trim()
            .takeIf(String::isNotBlank)
            ?.let(optionLabels::add)
        sports.forEach { sport ->
            sport.name
                .trim()
                .takeIf(String::isNotBlank)
                ?.let(optionLabels::add)
        }
        optionLabels.map { label -> DropdownOption(value = label, label = label) }
    }
    val isTeamNameValid = normalizedTeamName.isNotBlank()
    LaunchedEffect(team.team.id, resolvedEventSportName) {
        if (sportInput.isBlank() && resolvedEventSportName.isNotBlank()) {
            sportInput = resolvedEventSportName
        }
    }
    LaunchedEffect(
        divisionSportInput,
        skillDivisionOptions,
        ageDivisionOptions,
        defaultDivisionTypeSelections,
    ) {
        val hasSelectedSkillOption = skillDivisionOptions.any { option ->
            option.value.normalizeDivisionIdentifier() == skillDivisionTypeInput.normalizeDivisionIdentifier()
        }
        val hasSelectedAgeOption = ageDivisionOptions.any { option ->
            option.value.normalizeDivisionIdentifier() == ageDivisionTypeInput.normalizeDivisionIdentifier()
        }
        if (!hasSelectedSkillOption) {
            skillDivisionTypeInput = defaultDivisionTypeSelections.skillDivisionTypeId
        }
        if (!hasSelectedAgeOption) {
            ageDivisionTypeInput = defaultDivisionTypeSelections.ageDivisionTypeId
        }
    }
    LaunchedEffect(team.team.openRegistration, team.team.registrationPriceCents, registrationSettingsEdited) {
        val (syncedOpenRegistration, syncedRegistrationCostInput) = syncedRegistrationInputs(
            registrationSettingsEdited = registrationSettingsEdited,
            openRegistrationInput = openRegistrationInput,
            registrationCostInput = registrationCostInput,
            sourceOpenRegistration = team.team.openRegistration,
            sourceRegistrationPriceCents = team.team.registrationPriceCents,
        )
        openRegistrationInput = syncedOpenRegistration
        registrationCostInput = syncedRegistrationCostInput
    }
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
            team.captain?.let { captain -> put(captain.id, captain) }
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
    val activeStaffAssignments = remember(syncedTeam) { syncedTeam.activeStaffAssignments() }
    val managerLabel = activeStaffAssignments
        .firstOrNull { assignment -> assignment.normalizedRole() == "MANAGER" }
        ?.userId
        ?.let(resolveUserName)
        ?: resolveUserName(syncedTeam.managerId ?: syncedTeam.captainId)
        ?: "Unassigned"
    val headCoachLabel = activeStaffAssignments
        .firstOrNull { assignment -> assignment.normalizedRole() == "HEAD_COACH" }
        ?.userId
        ?.let(resolveUserName)
        ?: resolveUserName(syncedTeam.headCoachId)
        ?: "Unassigned"
    val assistantCoachIds = activeStaffAssignments
        .filter { assignment -> assignment.normalizedRole() == "ASSISTANT_COACH" }
        .map(TeamStaffAssignment::userId)
        .ifEmpty { syncedTeam.coachIds }
    val assistantCoachLabel = if (assistantCoachIds.isNotEmpty()) {
        assistantCoachIds.joinToString { coachId ->
            resolveUserName(coachId) ?: "Unknown user"
        }
    } else {
        "Unassigned"
    }
    val existingPlayerRegistrationsByUserId = remember(syncedTeam.playerRegistrations) {
        syncedTeam.playerRegistrations.associateBy(TeamPlayerRegistration::userId)
    }
    fun jerseyNumberForUser(userId: String): String = jerseyNumbersByUserId[userId].orEmpty()

    fun updateJerseyNumber(userId: String, jerseyNumber: String) {
        jerseyNumbersByUserId = jerseyNumbersByUserId + (userId to normalizeJerseyNumberInput(jerseyNumber))
    }

    fun buildUpdatedTeam(
        activePlayers: List<UserData>,
        invitedPlayers: List<UserData>,
        resolvedName: String,
        resolvedSize: Int,
    ): Team {
        val activePlayerIds = activePlayers.map(UserData::id).distinct()
        val invitedPlayerIds = invitedPlayers
            .map(UserData::id)
            .distinct()
            .filterNot(activePlayerIds::contains)
        val resolvedCaptainId = syncedTeam.captainId
            .takeIf(activePlayerIds::contains)
            ?: activePlayerIds.firstOrNull()
            .orEmpty()
        val updatedPlayerRegistrations = buildList {
            activePlayerIds.forEach { userId ->
                val existing = existingPlayerRegistrationsByUserId[userId]
                val jerseyNumberInput = jerseyNumbersByUserId[userId]
                val normalizedJerseyNumberInput = normalizeJerseyNumberInput(jerseyNumberInput)
                add(
                    TeamPlayerRegistration(
                        id = existing?.id ?: "${syncedTeam.id}__player__active__${userId}",
                        teamId = syncedTeam.id,
                        userId = userId,
                        status = "ACTIVE",
                        jerseyNumber = if (jerseyNumberInput != null) {
                            normalizedJerseyNumberInput.takeIf(String::isNotBlank)
                        } else {
                            normalizeJerseyNumberInput(existing?.jerseyNumber).takeIf(String::isNotBlank)
                        },
                        position = existing?.position,
                        isCaptain = userId == resolvedCaptainId,
                    )
                )
            }
            invitedPlayerIds.forEach { userId ->
                val existing = existingPlayerRegistrationsByUserId[userId]
                val jerseyNumberInput = jerseyNumbersByUserId[userId]
                val normalizedJerseyNumberInput = normalizeJerseyNumberInput(jerseyNumberInput)
                add(
                    TeamPlayerRegistration(
                        id = existing?.id ?: "${syncedTeam.id}__player__invited__${userId}",
                        teamId = syncedTeam.id,
                        userId = userId,
                        status = "INVITED",
                        jerseyNumber = if (jerseyNumberInput != null) {
                            normalizedJerseyNumberInput.takeIf(String::isNotBlank)
                        } else {
                            normalizeJerseyNumberInput(existing?.jerseyNumber).takeIf(String::isNotBlank)
                        },
                        position = existing?.position,
                        isCaptain = false,
                    )
                )
            }
        }

        return syncedTeam.copy(
            name = resolvedName,
            sport = normalizedSportName.ifBlank { null },
            teamSize = resolvedSize,
            division = resolvedDivisionToken,
            divisionTypeId = resolvedDivisionTypeId,
            divisionTypeName = resolvedDivisionTypeName,
            skillDivisionTypeId = normalizedSkillDivisionTypeId,
            skillDivisionTypeName = resolvedSkillDivisionTypeName,
            ageDivisionTypeId = normalizedAgeDivisionTypeId,
            ageDivisionTypeName = resolvedAgeDivisionTypeName,
            divisionGender = normalizedDivisionGender,
            captainId = resolvedCaptainId,
            playerIds = activePlayerIds,
            pending = invitedPlayerIds,
            playerRegistrations = updatedPlayerRegistrations,
            staffAssignments = syncedTeam.staffAssignments,
            openRegistration = openRegistrationInput,
            registrationPriceCents = resolvedRegistrationPriceCents(
                openRegistration = openRegistrationInput,
                canChargeRegistration = canChargeRegistration,
                registrationPriceCentsInput = registrationPriceCentsInput,
            ),
        ).withSynchronizedMembership()
    }

    Scaffold(
        contentWindowInsets = NoScaffoldContentInsets,
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text(if (isNewTeam) "Create Team" else "Edit Team") },
                navigationIcon = {
                    PlatformBackButton(
                        onBack = { if (!isSaving) onDismiss() },
                        arrow = true,
                    )
                },
            )
        },
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 16.dp + navBottomPadding)
                .verticalScroll(rememberScrollState())
        ) {
            Text("Team Setup", style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(8.dp))

            inviteError?.let {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }

            saveError?.let {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }

            StandardTextField(
                value = teamName,
                onValueChange = {
                    teamName = it
                },
                modifier = Modifier.fillMaxWidth(),
                label = "Team Name",
                isError = showEditDetails && !isTeamNameValid,
                supportingText = if (showEditDetails && !isTeamNameValid) {
                    "Team name is required."
                } else {
                    ""
                },
                readOnly = !canEditFields
            )

            Spacer(modifier = Modifier.height(12.dp))
            StandardTextField(
                value = teamSizeInput,
                onValueChange = { teamSizeInput = it },
                modifier = Modifier.fillMaxWidth(),
                label = "Team Size",
                keyboardType = "number",
                inputFilter = { value -> value.filter(Char::isDigit) },
                readOnly = !canEditFields,
                isError = showEditDetails && !isTeamSizeValid,
                supportingText = if (showEditDetails && !isTeamSizeValid) {
                    "Enter a team size greater than 0."
                } else {
                    ""
                },
            )

            Spacer(modifier = Modifier.height(12.dp))
            PlatformDropdown(
                selectedValue = sportInput,
                onSelectionChange = { value -> sportInput = value },
                options = sportOptions,
                modifier = Modifier.fillMaxWidth(),
                label = "Sport",
                placeholder = "Select sport",
                enabled = canEditFields,
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
                    enabled = canEditFields,
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
                    enabled = canEditFields,
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
                enabled = canEditFields,
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
            if (showEditDetails) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(
                        checked = openRegistrationInput,
                        onCheckedChange = { checked ->
                            registrationSettingsEdited = true
                            openRegistrationInput = checked
                        },
                        enabled = canEditFields,
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Open registration")
                        Text(
                            text = "Players can join this team without an invite.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                StandardTextField(
                    value = registrationCostInput,
                    onValueChange = {
                        registrationSettingsEdited = true
                        registrationCostInput = it
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = "Registration cost",
                    keyboardType = "money",
                    inputFilter = { value -> value.filter(Char::isDigit).take(7) },
                    readOnly = !canEditFields || !openRegistrationInput || !canChargeRegistration,
                    supportingText = if (canChargeRegistration) {
                        "Leave blank for free registration."
                    } else {
                        "Connect Stripe to charge for registration. Free registration is still available."
                    },
                )
            } else {
                ReadOnlyLabeledValue(
                    label = "Open registration",
                    value = if (openRegistrationInput) "Yes" else "No",
                    supportingText = if (openRegistrationInput) {
                        "Players can join this team without an invite."
                    } else {
                        "Players need an invite to join this team."
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(modifier = Modifier.height(8.dp))
                ReadOnlyLabeledValue(
                    label = "Registration cost",
                    value = formatRegistrationCost(
                        openRegistration = openRegistrationInput,
                        registrationPriceCents = team.team.registrationPriceCents,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Spacer(modifier = Modifier.height(12.dp))
            Text("Players")
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                playersInTeam.forEach { player ->
                    val jerseyNumber = jerseyNumberForUser(player.id)
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        PlayerCard(
                            player = player,
                            modifier = Modifier.weight(1f),
                            jerseyNumber = jerseyNumber,
                            trailingContent = {
                                JerseyNumberField(
                                    value = jerseyNumber,
                                    onValueChange = { updateJerseyNumber(player.id, it) },
                                    canEdit = canEditFields,
                                )
                            },
                        )
                        if (showEditDetails) {
                            Button(
                                onClick = {
                                    playersInTeam = playersInTeam - player
                                },
                                enabled = canEditFields,
                            ) {
                                Text("Remove")
                            }
                        }
                    }
                }
                invitedPlayers.forEach { player ->
                    val jerseyNumber = jerseyNumberForUser(player.id)
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        PlayerCard(
                            player = player,
                            isPending = true,
                            modifier = Modifier.weight(1f),
                            jerseyNumber = jerseyNumber,
                            trailingContent = {
                                JerseyNumberField(
                                    value = jerseyNumber,
                                    onValueChange = { updateJerseyNumber(player.id, it) },
                                    canEdit = canEditFields,
                                )
                            },
                        )
                        if (showEditDetails) {
                            Button(
                                onClick = {
                                    invitedPlayers = invitedPlayers - player
                                },
                                enabled = canEditFields,
                            ) {
                                Text("Remove")
                            }
                        }
                    }
                }
                if (canEditFields && canInvitePlayer) {
                    InvitePlayerCard {
                        inviteTarget = TeamInviteTarget.PLAYER
                        showSearchDialog = true
                    }
                } else if (canEditFields && !canInvitePlayer) {
                    Text(
                        text = playerCapacityMessage,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
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
                        enabled = canEditFields,
                    ) { Text("Invite Manager") }
                    OutlinedButton(
                        onClick = {
                            inviteTarget = TeamInviteTarget.HEAD_COACH
                            showSearchDialog = true
                        },
                        modifier = Modifier.weight(1f),
                        enabled = canEditFields,
                    ) { Text("Invite Head Coach") }
                }
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = {
                        inviteTarget = TeamInviteTarget.ASSISTANT_COACH
                        showSearchDialog = true
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = canEditFields,
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
                OutlinedButton(onClick = onDismiss, enabled = !isSaving) {
                    Text("Cancel")
                }
                if (showEditDetails) {
                    Button(onClick = {
                        onFinish(
                            buildUpdatedTeam(
                                activePlayers = playersInTeam,
                                invitedPlayers = invitedPlayers,
                                resolvedName = normalizedTeamName,
                                resolvedSize = resolvedTeamSize,
                            )
                        )
                    }, enabled = !isSaving && isTeamSizeValid && isTeamDivisionValid && isTeamNameValid) {
                        if (isSaving) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(if (isNewTeam) "Creating..." else "Saving...")
                        } else {
                            Text(if (isNewTeam) "Create" else "Save")
                        }
                    }
                } else {
                    Button(onClick = { showLeaveTeamDialog = true }, enabled = !isSaving) {
                        Text("Leave Team")
                    }
                }
            }

            if (isCaptain) {
                IconButton(onClick = { showDeleteDialog = true }, enabled = deleteEnabled && !isSaving,
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
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete Team") },
            text = { Text("Are you sure you want to delete this team? This action cannot be undone.") },
            confirmButton = {
                Button(onClick = {
                    onDelete(team)
                    showDeleteDialog = false
                }) {
                    Text("Delete")
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { showDeleteDialog = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    if (showLeaveTeamDialog) {
        AlertDialog(
            onDismissRequest = { showLeaveTeamDialog = false },
            title = { Text("Leave Team") },
            text = { Text("Are you sure you want to leave this team?") },
            confirmButton = {
                Button(onClick = {
                    onLeaveTeam(team.team)
                    showLeaveTeamDialog = false
                }) {
                    Text("Leave")
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { showLeaveTeamDialog = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    if (showSearchDialog) {
        TeamInviteDialog(
            teamName = team.team.name,
            inviteTarget = inviteTarget,
            freeAgents = freeAgents,
            friends = friends,
            suggestions = suggestions.filterNot {
                playersInTeam.contains(it) || invitedPlayers.contains(it)
            },
            inviteFreeAgentContext = inviteFreeAgentContext,
            canInvitePlayer = inviteTarget != TeamInviteTarget.PLAYER || canInvitePlayer,
            playerCapacityMessage = playerCapacityMessage,
            onSearch = onSearch,
            onDismiss = { showSearchDialog = false },
            onInvite = { selectedUser, email, eventTeamIds ->
                inviteError = null
                val inviteType = inviteTarget.inviteType ?: return@TeamInviteDialog
                if (inviteTarget == TeamInviteTarget.PLAYER && !canInvitePlayer) {
                    inviteError = playerCapacityMessage
                    return@TeamInviteDialog
                }
                if (inviteTarget == TeamInviteTarget.PLAYER && selectedUser != null) {
                    val alreadySelected = playersInTeam.any { it.id == selectedUser.id } ||
                        invitedPlayers.any { it.id == selectedUser.id }
                    if (!alreadySelected) {
                        invitedPlayers = invitedPlayers + selectedUser
                        if (!jerseyNumbersByUserId.containsKey(selectedUser.id)) {
                            updateJerseyNumber(selectedUser.id, "")
                        }
                    }
                }
                onInviteTeamRole?.invoke(
                    team.team.id,
                    selectedUser?.id,
                    inviteType,
                    eventTeamIds,
                    email,
                )
                showSearchDialog = false
            },
        )
    }
}

private enum class TeamInviteDialogMode(val label: String) {
    FreeAgents("Free Agents"),
    InviteUser("Invite User"),
    InviteByEmail("Invite by Email"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TeamInviteDialog(
    teamName: String,
    inviteTarget: TeamInviteTarget,
    freeAgents: List<UserData>,
    friends: List<UserData>,
    suggestions: List<UserData>,
    inviteFreeAgentContext: TeamInviteFreeAgentContext,
    canInvitePlayer: Boolean = true,
    playerCapacityMessage: String = "",
    onSearch: (String) -> Unit,
    onDismiss: () -> Unit,
    onInvite: (selectedUser: UserData?, email: String?, eventTeamIds: List<String>) -> Unit,
) {
    var mode by remember(inviteTarget) {
        mutableStateOf(
            if (inviteTarget == TeamInviteTarget.PLAYER) TeamInviteDialogMode.FreeAgents
            else TeamInviteDialogMode.InviteUser
        )
    }
    var query by remember { mutableStateOf("") }
    var selectedUser by remember { mutableStateOf<UserData?>(null) }
    var selectedEventTeamIds by remember { mutableStateOf<List<String>>(emptyList()) }

    LaunchedEffect(mode, query) {
        if (mode == TeamInviteDialogMode.InviteUser && query.trim().length >= 2) {
            onSearch(query)
        }
    }

    val normalizedQuery = query.trim()
    val eventNameById = remember(inviteFreeAgentContext.eventTeams) {
        inviteFreeAgentContext.eventTeams.associate { option -> option.eventId to option.eventName }
    }
    val filteredFreeAgents = remember(freeAgents, normalizedQuery) {
        val normalized = normalizedQuery.lowercase()
        val filtered = freeAgents.filter { user ->
            if (normalized.isBlank()) {
                true
            } else {
                listOf(user.fullName, user.publicHandle.orEmpty(), user.userName)
                    .joinToString(" ")
                    .lowercase()
                    .contains(normalized)
            }
        }
        if (normalized.isBlank()) filtered.take(10) else filtered
    }
    val initialInviteUsers = remember(friends, suggestions, normalizedQuery) {
        if (normalizedQuery.length >= 2) suggestions else friends
    }
    val canSendEmail = normalizedQuery.isProbablyEmail()
    val showEventTeams = inviteTarget == TeamInviteTarget.PLAYER && inviteFreeAgentContext.eventTeams.isNotEmpty()
    val playerInviteBlocked = inviteTarget == TeamInviteTarget.PLAYER && !canInvitePlayer

    fun chooseUser(user: UserData, precheckFreeAgentEvents: Boolean) {
        if (playerInviteBlocked) return
        selectedUser = user
        selectedEventTeamIds = if (precheckFreeAgentEvents) {
            inviteFreeAgentContext.freeAgentEventTeamIdsByUserId[user.id].orEmpty()
        } else {
            emptyList()
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Invite to $teamName") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PrimaryTabRow(selectedTabIndex = mode.ordinal) {
                    TeamInviteDialogMode.values().forEach { tab ->
                        Tab(
                            selected = mode == tab,
                            onClick = {
                                mode = tab
                                query = ""
                                selectedUser = null
                                selectedEventTeamIds = emptyList()
                            },
                            enabled = tab != TeamInviteDialogMode.FreeAgents || inviteTarget == TeamInviteTarget.PLAYER,
                            text = { Text(tab.label) },
                        )
                    }
                }

                StandardTextField(
                    value = query,
                    onValueChange = {
                        query = it
                        selectedUser = null
                        if (mode != TeamInviteDialogMode.FreeAgents) {
                            selectedEventTeamIds = emptyList()
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = when (mode) {
                        TeamInviteDialogMode.FreeAgents -> "Search free agents"
                        TeamInviteDialogMode.InviteUser -> "Search ${inviteTarget.label}"
                        TeamInviteDialogMode.InviteByEmail -> "Email"
                    },
                    keyboardType = if (mode == TeamInviteDialogMode.InviteByEmail) "email" else "text",
                    supportingText = if (mode == TeamInviteDialogMode.InviteByEmail && query.isNotBlank() && !canSendEmail) {
                        "Enter a valid email address."
                    } else {
                        ""
                    },
                )

                if (playerInviteBlocked && playerCapacityMessage.isNotBlank()) {
                    Text(
                        text = playerCapacityMessage,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                when (mode) {
                    TeamInviteDialogMode.FreeAgents -> {
                        if (filteredFreeAgents.isEmpty()) {
                            Text(
                                text = if (normalizedQuery.isBlank()) "No future event free agents found." else "No matching free agents.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        } else {
                            LazyColumn(modifier = Modifier.height(220.dp)) {
                                items(filteredFreeAgents, key = { it.id }) { user ->
                                    val eventNames = inviteFreeAgentContext.freeAgentEventsByUserId[user.id]
                                        .orEmpty()
                                        .mapNotNull { eventNameById[it] }
                                    UserInviteRow(
                                        user = user,
                                        supportingText = eventNames.joinToString(", ").ifBlank { "Free agent" },
                                        selected = selectedUser?.id == user.id,
                                        enabled = !playerInviteBlocked,
                                        onClick = { chooseUser(user, precheckFreeAgentEvents = true) },
                                    )
                                }
                            }
                        }
                    }

                    TeamInviteDialogMode.InviteUser -> {
                        LazyColumn(modifier = Modifier.height(220.dp)) {
                            items(initialInviteUsers, key = { it.id }) { user ->
                                UserInviteRow(
                                    user = user,
                                    supportingText = user.publicHandle.orEmpty(),
                                    selected = selectedUser?.id == user.id,
                                    enabled = !playerInviteBlocked,
                                    onClick = { chooseUser(user, precheckFreeAgentEvents = false) },
                                )
                            }
                        }
                    }

                    TeamInviteDialogMode.InviteByEmail -> Unit
                }

                selectedUser?.let { user ->
                    Text(
                        text = "Selected: ${user.fullName}",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }

                if (showEventTeams) {
                    EventTeamCheckboxes(
                        options = inviteFreeAgentContext.eventTeams,
                        selectedIds = selectedEventTeamIds,
                        onSelectedIdsChange = { selectedEventTeamIds = it },
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    when (mode) {
                        TeamInviteDialogMode.InviteByEmail -> onInvite(null, normalizedQuery.lowercase(), selectedEventTeamIds)
                        else -> selectedUser?.let { user -> onInvite(user, null, selectedEventTeamIds) }
                    }
                },
                enabled = when (mode) {
                    TeamInviteDialogMode.InviteByEmail -> canSendEmail && !playerInviteBlocked
                    else -> selectedUser != null && !playerInviteBlocked
                },
            ) {
                Text("Send ${inviteTarget.label} Invite")
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}

@Composable
private fun UserInviteRow(
    user: UserData,
    supportingText: String,
    selected: Boolean,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .semantics { contentDescription = "Invite ${user.fullName}" }
            .clickable(enabled = enabled, onClick = onClick),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PlayerCard(player = user, modifier = Modifier.weight(1f))
            if (supportingText.isNotBlank()) {
                Text(
                    text = supportingText,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
            }
            Checkbox(
                checked = selected,
                enabled = enabled,
                onCheckedChange = { if (enabled) onClick() },
            )
        }
    }
}

@Composable
private fun EventTeamCheckboxes(
    options: List<TeamInviteEventTeamOption>,
    selectedIds: List<String>,
    onSelectedIdsChange: (List<String>) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "Update your team in upcoming events",
            style = MaterialTheme.typography.titleSmall,
        )
        options.forEach { option ->
            val selected = option.eventTeamId in selectedIds
            val updateSelection: (Boolean) -> Unit = { checked ->
                onSelectedIdsChange(
                    if (checked) {
                        (selectedIds + option.eventTeamId).distinct()
                    } else {
                        selectedIds - option.eventTeamId
                    }
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Toggle ${option.eventName} ${option.teamName}" }
                    .clickable { updateSelection(!selected) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Checkbox(
                    checked = selected,
                    onCheckedChange = updateSelection,
                )
                Text(
                    text = "${option.eventName} - ${option.teamName}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@Composable
private fun JerseyNumberField(
    value: String,
    onValueChange: (String) -> Unit,
    canEdit: Boolean,
) {
    if (!canEdit) {
        JerseyNumberReadOnlyView(value = value)
        return
    }

    StandardTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.width(96.dp),
        label = "Jersey",
        keyboardType = "number",
        inputFilter = { input -> input.filter(Char::isDigit).take(3) },
        readOnly = !canEdit,
        height = 56.dp,
        contentPadding = PaddingValues(0.dp),
    )
}

@Composable
private fun JerseyNumberReadOnlyView(value: String) {
    Column(
        modifier = Modifier.width(96.dp),
        horizontalAlignment = Alignment.Start,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Jersey",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = normalizeJerseyNumberInput(value).ifBlank { " " },
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun ReadOnlyLabeledValue(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    supportingText: String? = null,
) {
    Column(modifier = modifier.padding(vertical = 4.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        supportingText?.let { text ->
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
