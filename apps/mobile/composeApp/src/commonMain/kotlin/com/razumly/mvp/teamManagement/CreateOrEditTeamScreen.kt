package com.razumly.mvp.teamManagement

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameters
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.TeamStaffAssignment
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.activeStaffAssignments
import com.razumly.mvp.core.data.dataTypes.isActive
import com.razumly.mvp.core.data.dataTypes.isStarted
import com.razumly.mvp.core.data.dataTypes.normalizedRole
import com.razumly.mvp.core.data.dataTypes.skillsForSport
import com.razumly.mvp.core.data.dataTypes.toDropdownOptions
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.data.repositories.EventComplianceDocumentCounts
import com.razumly.mvp.core.data.repositories.EventCompliancePaymentSummary
import com.razumly.mvp.core.data.repositories.EventComplianceRequiredDocument
import com.razumly.mvp.core.data.repositories.EventComplianceUserSummary
import com.razumly.mvp.core.data.repositories.EventTeamComplianceSummary
import com.razumly.mvp.core.data.repositories.RegistrationQuestionAnswerSummary
import com.razumly.mvp.core.data.repositories.TeamInviteEventTeamOption
import com.razumly.mvp.core.data.repositories.TeamInviteFreeAgentContext
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
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.NoScaffoldContentInsets
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.InclusivePriceInput
import com.razumly.mvp.core.presentation.composables.InvitePlayerCard
import com.razumly.mvp.core.presentation.composables.PlatformBackButton
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.util.MoneyInputUtils
import kotlinx.coroutines.launch

internal enum class TeamInviteTarget(val label: String, val inviteType: String?) {
    PLAYER("Player", "player"),
    MANAGER("Manager", "team_manager"),
    HEAD_COACH("Head Coach", "team_head_coach"),
    ASSISTANT_COACH("Assistant Coach", "team_assistant_coach"),
}

private const val JerseyNumberMaxDigits = 3

private fun normalizeJerseyNumberInput(value: String?): String =
    value.orEmpty().filter(Char::isDigit).take(JerseyNumberMaxDigits)

private val TeamPlayerInlineMinWidth = 560.dp
private val JerseyNumberFieldWidth = 88.dp
private val JerseyNumberFieldHeight = 56.dp
private val LegacyDivisionWhitespaceRegex = "\\s+".toRegex()
private val LegacyDivisionAgeTokenRegex = Regex("^(?:u\\d+|\\d+u|\\d+\\+|\\d+plus)$", RegexOption.IGNORE_CASE)

internal fun formatRegistrationCostInput(registrationPriceCents: Int): String =
    registrationPriceCents
        .takeIf { it > 0 }
        ?.toString()
        .orEmpty()

internal const val TEAM_JOIN_POLICY_CLOSED = "CLOSED"
internal const val TEAM_JOIN_POLICY_OPEN_REGISTRATION = "OPEN_REGISTRATION"
internal const val TEAM_JOIN_POLICY_REQUEST_TO_JOIN = "REQUEST_TO_JOIN"

internal fun normalizeTeamJoinPolicyInput(value: String?, openRegistration: Boolean): String {
    val normalized = value
        ?.trim()
        ?.uppercase()
        ?.takeIf(String::isNotBlank)
    return when (normalized) {
        TEAM_JOIN_POLICY_OPEN_REGISTRATION,
        TEAM_JOIN_POLICY_REQUEST_TO_JOIN,
        TEAM_JOIN_POLICY_CLOSED,
        -> normalized
        else -> if (openRegistration) TEAM_JOIN_POLICY_OPEN_REGISTRATION else TEAM_JOIN_POLICY_CLOSED
    }
}

private val TeamJoinPolicyOptions = listOf(
    DropdownOption(TEAM_JOIN_POLICY_CLOSED, "Closed"),
    DropdownOption(TEAM_JOIN_POLICY_OPEN_REGISTRATION, "Open registration"),
    DropdownOption(TEAM_JOIN_POLICY_REQUEST_TO_JOIN, "Request to join"),
)

private fun String.isOpenTeamRegistrationPolicy(): Boolean =
    normalizeTeamJoinPolicyInput(this, openRegistration = false) == TEAM_JOIN_POLICY_OPEN_REGISTRATION

private fun String.isRequestToJoinPolicy(): Boolean =
    normalizeTeamJoinPolicyInput(this, openRegistration = false) == TEAM_JOIN_POLICY_REQUEST_TO_JOIN

private fun String.allowsRegistrationCostLabel(): Boolean =
    isOpenTeamRegistrationPolicy() || isRequestToJoinPolicy()

internal fun syncedRegistrationInputs(
    registrationSettingsEdited: Boolean,
    joinPolicyInput: String,
    registrationCostInput: String,
    sourceJoinPolicy: String?,
    sourceOpenRegistration: Boolean,
    sourceRegistrationPriceCents: Int,
): Pair<String, String> = if (registrationSettingsEdited) {
    normalizeTeamJoinPolicyInput(joinPolicyInput, openRegistration = false) to registrationCostInput
} else {
    normalizeTeamJoinPolicyInput(sourceJoinPolicy, sourceOpenRegistration) to
        formatRegistrationCostInput(sourceRegistrationPriceCents)
}

internal fun resolvedRegistrationPriceCents(
    joinPolicy: String,
    canChargeRegistration: Boolean,
    registrationPriceCentsInput: Int,
): Int = when {
    joinPolicy.isRequestToJoinPolicy() -> registrationPriceCentsInput
    joinPolicy.isOpenTeamRegistrationPolicy() && canChargeRegistration -> registrationPriceCentsInput
    else -> 0
}

private fun formatRegistrationCost(joinPolicy: String, registrationPriceCents: Int): String =
    when {
        !joinPolicy.allowsRegistrationCostLabel() -> "Not open"
        registrationPriceCents <= 0 -> "Free"
        else -> {
            val dollars = registrationPriceCents / 100
            val cents = registrationPriceCents % 100
            "\$$dollars.${cents.toString().padStart(2, '0')}"
        }
    }

private fun formatJoinPolicy(joinPolicy: String): String = when {
    joinPolicy.isOpenTeamRegistrationPolicy() -> "Open registration"
    joinPolicy.isRequestToJoinPolicy() -> "Request to join"
    else -> "Closed"
}

private data class ReadOnlyTeamDivisionLabels(
    val gender: String,
    val skillDivision: String,
    val ageDivision: String,
)

private fun formatGenderDivisionLabel(value: String): String {
    return when (value.trim().uppercase()) {
        "M" -> "Men's"
        "F" -> "Women's"
        "C" -> "CoEd"
        else -> value.toDivisionDisplayLabel()
    }
}

private fun parseLegacyTeamDivisionLabels(rawDivision: String): ReadOnlyTeamDivisionLabels? {
    val tokens = rawDivision
        .trim()
        .split(LegacyDivisionWhitespaceRegex)
        .filter(String::isNotBlank)
    if (tokens.isEmpty()) return null

    val gender = when (tokens.first().trim().lowercase()) {
        "coed", "co-ed" -> "CoEd"
        "mens", "men", "men's" -> "Men's"
        "womens", "women", "women's" -> "Women's"
        else -> null
    } ?: return null

    val remaining = tokens.drop(1)
    val ageToken = remaining.lastOrNull { token -> LegacyDivisionAgeTokenRegex.matches(token) }
    val skillToken = remaining.firstOrNull { token -> token != ageToken }
    return ReadOnlyTeamDivisionLabels(
        gender = gender,
        skillDivision = skillToken?.toDivisionDisplayLabel().orEmpty(),
        ageDivision = ageToken?.toDivisionDisplayLabel().orEmpty(),
    )
}

private fun readOnlyTeamDivisionLabels(
    rawDivision: String?,
    normalizedGender: String,
    resolvedSkillDivisionTypeName: String,
    resolvedAgeDivisionTypeName: String,
): ReadOnlyTeamDivisionLabels {
    val parsedLegacy = rawDivision
        ?.takeIf(String::isNotBlank)
        ?.let(::parseLegacyTeamDivisionLabels)
    return ReadOnlyTeamDivisionLabels(
        gender = parsedLegacy?.gender
            ?: formatGenderDivisionLabel(normalizedGender)
                .ifBlank { "Unassigned" },
        skillDivision = parsedLegacy?.skillDivision
            ?.takeIf(String::isNotBlank)
            ?: resolvedSkillDivisionTypeName.trim().ifBlank { "Unassigned" },
        ageDivision = parsedLegacy?.ageDivision
            ?.takeIf(String::isNotBlank)
            ?: resolvedAgeDivisionTypeName.trim().ifBlank { "Unassigned" },
    )
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
    divisionTypeParameters: DivisionTypeParameters = DivisionTypeParameters(),
    friends: List<UserData>,
    freeAgents: List<UserData>,
    inviteFreeAgentContext: TeamInviteFreeAgentContext = TeamInviteFreeAgentContext(),
    suggestions: List<UserData>,
    onSearch: (String) -> Unit,
    onFinish: (Team) -> Unit,
    onLeaveTeam: (Team) -> Unit = {},
    onRequestRefund: ((Team, String) -> Unit)? = null,
    onDelete: (TeamWithPlayers) -> Unit,
    onDismiss: () -> Unit,
    deleteEnabled: Boolean,
    selectedEvent: Event?,
    isCaptain: Boolean,
    currentUser: UserData,
    isNewTeam: Boolean,
    isSaving: Boolean = false,
    isRequestingRefund: Boolean = false,
    saveError: String? = null,
    memberCompliance: EventTeamComplianceSummary? = null,
    memberComplianceLoading: Boolean = false,
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
    var joinPolicyInput by remember(team.team.id) {
        mutableStateOf(normalizeTeamJoinPolicyInput(team.team.joinPolicy, team.team.openRegistration))
    }
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
    var showRefundRequestDialog by remember { mutableStateOf(false) }
    var refundReasonInput by remember { mutableStateOf("") }
    var inviteError by remember { mutableStateOf<String?>(null) }
    var inviteTarget by remember { mutableStateOf(TeamInviteTarget.PLAYER) }
    var sportInput by remember(team.team.id) { mutableStateOf(team.team.sport?.trim().orEmpty()) }
    var expandedComplianceUserIds by remember(team.team.id, memberCompliance) {
        mutableStateOf<Set<String>>(emptySet())
    }
    var teamDetailsExpanded by remember(team.team.id) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val showEditDetails = isCaptain || isNewTeam
    val screenTitle = when {
        isNewTeam -> "Create Team"
        showEditDetails -> "Edit Team"
        else -> teamName.trim().ifBlank { "Team" }
    }
    val isBusy = isSaving || isRequestingRefund
    val canEditFields = showEditDetails && !isBusy
    val canChargeRegistration = currentUser.hasStripeAccount == true || team.team.registrationPriceCents > 0
    val syncedJoinPolicy = normalizeTeamJoinPolicyInput(syncedTeam.joinPolicy, syncedTeam.openRegistration)
    val isOpenRegistrationInput = joinPolicyInput.isOpenTeamRegistrationPolicy()
    val isRequestToJoinInput = joinPolicyInput.isRequestToJoinPolicy()
    val currentUserRegistration = remember(syncedTeam.playerRegistrations, currentUser.id) {
        syncedTeam.playerRegistrations.firstOrNull { registration ->
            registration.userId == currentUser.id && registration.isActive()
        }
    }
    val showRefundRequestAction = !showEditDetails &&
        onRequestRefund != null &&
        syncedJoinPolicy.isOpenTeamRegistrationPolicy() &&
        syncedTeam.registrationPriceCents > 0 &&
        currentUserRegistration != null
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
    val complianceByUserId = remember(memberCompliance) {
        memberCompliance?.users?.associateBy(EventComplianceUserSummary::userId).orEmpty()
    }
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
            ?: inferredFromDivision.skillDivisionTypeId.normalizeDivisionIdentifier()
        val resolvedAgeDivisionTypeId = team.team.ageDivisionTypeId
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
            ?: parsedCombinedDivisionTypeId?.ageDivisionTypeId
            ?: inferredFromDivision.ageDivisionTypeId.normalizeDivisionIdentifier()
        val resolvedGender = team.team.divisionGender
            ?.trim()
            ?.uppercase()
            ?.takeIf(String::isNotBlank)
            ?: inferredFromDivision.gender.trim().uppercase()
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
    val selectedSportIdForDivisionTypes = remember(
        divisionSportInput,
        resolvedEventSportName,
        selectedEvent?.sportId,
        sports,
    ) {
        val normalizedDivisionSport = divisionSportInput.trim()
        val matchingSportId = sports.firstOrNull { sport ->
            sport.name.trim().equals(normalizedDivisionSport, ignoreCase = true) ||
                sport.id.trim().equals(normalizedDivisionSport, ignoreCase = true)
        }?.id?.trim().orEmpty()
        matchingSportId.ifBlank {
            selectedEvent?.sportId
                ?.trim()
                ?.takeIf { eventSportId ->
                    normalizedDivisionSport.equals(resolvedEventSportName.trim(), ignoreCase = true) ||
                        normalizedDivisionSport.equals(eventSportId, ignoreCase = true)
                }
                .orEmpty()
        }
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
    val genderOptions = remember(divisionTypeParameters, eventDivisionOptions, inferredTeamDivisionDetail.gender) {
        val options = linkedMapOf<String, String>()
        fun addOption(id: String?, label: String? = null) {
            val normalizedId = id?.trim()?.uppercase().orEmpty()
            if (normalizedId.isBlank()) return
            options[normalizedId] = label?.trim()?.takeIf(String::isNotBlank)
                ?: normalizedId.toDivisionDisplayLabel()
        }

        divisionTypeParameters.genders.toDropdownOptions().forEach { option ->
            addOption(option.value, option.label)
        }
        eventDivisionOptions.forEach { detail ->
            addOption(detail.gender)
        }
        addOption(inferredTeamDivisionDetail.gender)
        options.map { (value, label) -> DropdownOption(value = value, label = label) }
    }
    val skillDivisionOptions = remember(
        divisionTypeParameters,
        selectedSportIdForDivisionTypes,
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

        divisionTypeParameters.skillsForSport(selectedSportIdForDivisionTypes)
            .toDropdownOptions()
            .forEach { option -> addOption(option.value, option.label) }
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
        divisionTypeParameters,
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

        divisionTypeParameters.ages.toDropdownOptions().forEach { option ->
            addOption(option.value, option.label)
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
        mutableStateOf(inferredTeamDivisionDetail.gender)
    }
    var skillDivisionTypeInput by remember(team.team.id) {
        mutableStateOf(inferredTeamDivisionDetail.skillDivisionTypeId.normalizeDivisionIdentifier())
    }
    var ageDivisionTypeInput by remember(team.team.id) {
        mutableStateOf(inferredTeamDivisionDetail.ageDivisionTypeId.normalizeDivisionIdentifier())
    }
    val normalizedDivisionGender = divisionGenderInput.trim().uppercase()
    val normalizedTeamName = teamName.trim()
    val normalizedSportName = sportInput.trim()
    val normalizedSkillDivisionTypeId = skillDivisionTypeInput.normalizeDivisionIdentifier()
    val normalizedAgeDivisionTypeId = ageDivisionTypeInput.normalizeDivisionIdentifier()
    val genderOptionValues = remember(genderOptions) {
        genderOptions.map { option -> option.value.trim().uppercase() }.toSet()
    }
    val isTeamDivisionValid = normalizedDivisionGender in genderOptionValues &&
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
    val readOnlyDivisionLabels = remember(
        team.team.division,
        normalizedDivisionGender,
        resolvedSkillDivisionTypeName,
        resolvedAgeDivisionTypeName,
    ) {
        readOnlyTeamDivisionLabels(
            rawDivision = team.team.division,
            normalizedGender = normalizedDivisionGender,
            resolvedSkillDivisionTypeName = resolvedSkillDivisionTypeName,
            resolvedAgeDivisionTypeName = resolvedAgeDivisionTypeName,
        )
    }
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
        genderOptions,
        skillDivisionOptions,
        ageDivisionOptions,
    ) {
        val hasSelectedGenderOption = genderOptions.any { option ->
            option.value.trim().uppercase() == divisionGenderInput.trim().uppercase()
        }
        val hasSelectedSkillOption = skillDivisionOptions.any { option ->
            option.value.normalizeDivisionIdentifier() == skillDivisionTypeInput.normalizeDivisionIdentifier()
        }
        val hasSelectedAgeOption = ageDivisionOptions.any { option ->
            option.value.normalizeDivisionIdentifier() == ageDivisionTypeInput.normalizeDivisionIdentifier()
        }
        if (divisionGenderInput.isNotBlank() && !hasSelectedGenderOption) {
            divisionGenderInput = ""
        }
        if (skillDivisionTypeInput.isNotBlank() && !hasSelectedSkillOption) {
            skillDivisionTypeInput = ""
        }
        if (ageDivisionTypeInput.isNotBlank() && !hasSelectedAgeOption) {
            ageDivisionTypeInput = ""
        }
    }
    LaunchedEffect(team.team.joinPolicy, team.team.openRegistration, team.team.registrationPriceCents, registrationSettingsEdited) {
        val (syncedJoinPolicy, syncedRegistrationCostInput) = syncedRegistrationInputs(
            registrationSettingsEdited = registrationSettingsEdited,
            joinPolicyInput = joinPolicyInput,
            registrationCostInput = registrationCostInput,
            sourceJoinPolicy = team.team.joinPolicy,
            sourceOpenRegistration = team.team.openRegistration,
            sourceRegistrationPriceCents = team.team.registrationPriceCents,
        )
        joinPolicyInput = syncedJoinPolicy
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
    fun staffUserFor(userId: String?): UserData? = userId
        ?.takeIf(String::isNotBlank)
        ?.let(knownUsersById::get)

    val managerUserId = activeStaffAssignments
        .firstOrNull { assignment -> assignment.normalizedRole() == "MANAGER" }
        ?.userId
        ?: syncedTeam.managerId
        ?: syncedTeam.captainId
    val managerUser = staffUserFor(managerUserId)
    val managerFallbackLabels = if (managerUser == null) {
        listOf(resolveUserName(managerUserId) ?: "Unassigned")
    } else {
        emptyList()
    }
    val headCoachUserId = activeStaffAssignments
        .firstOrNull { assignment -> assignment.normalizedRole() == "HEAD_COACH" }
        ?.userId
        ?: syncedTeam.headCoachId
    val headCoachUser = staffUserFor(headCoachUserId)
    val headCoachFallbackLabels = if (headCoachUser == null) {
        listOf(resolveUserName(headCoachUserId) ?: "Unassigned")
    } else {
        emptyList()
    }
    val assistantCoachIds = activeStaffAssignments
        .filter { assignment -> assignment.normalizedRole() == "ASSISTANT_COACH" }
        .map(TeamStaffAssignment::userId)
        .ifEmpty { syncedTeam.coachIds }
        .distinct()
    val assistantCoachUsers = assistantCoachIds.mapNotNull(::staffUserFor)
    val assistantCoachFallbackLabels = if (assistantCoachIds.isEmpty()) {
        listOf("Unassigned")
    } else {
        assistantCoachIds
            .filter { coachId -> staffUserFor(coachId) == null }
            .map { coachId -> resolveUserName(coachId) ?: "Unknown user" }
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
            joinPolicy = joinPolicyInput,
            openRegistration = isOpenRegistrationInput,
            registrationPriceCents = resolvedRegistrationPriceCents(
                joinPolicy = joinPolicyInput,
                canChargeRegistration = canChargeRegistration,
                registrationPriceCentsInput = registrationPriceCentsInput,
            ),
        ).withSynchronizedMembership()
    }

    Scaffold(
        contentWindowInsets = NoScaffoldContentInsets,
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text(screenTitle) },
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
                .padding(bottom = navBottomPadding)
                .verticalScroll(rememberScrollState())
                .padding(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 16.dp)
        ) {
            if (showEditDetails) {
                Text("Team Setup", style = MaterialTheme.typography.titleLarge)
                Spacer(modifier = Modifier.height(8.dp))
            }

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

            if (showEditDetails) {
                StandardTextField(
                    value = teamName,
                    onValueChange = {
                        teamName = it
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = "Team Name",
                    isError = !isTeamNameValid,
                    supportingText = if (!isTeamNameValid) {
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
                    isError = !isTeamSizeValid,
                    supportingText = if (!isTeamSizeValid) {
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
                        options = genderOptions,
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
                if (!isTeamDivisionValid) {
                    Text(
                        text = "Select gender, skill division, and age division.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            if (showEditDetails) {
                PlatformDropdown(
                    selectedValue = joinPolicyInput,
                    onSelectionChange = { value ->
                        registrationSettingsEdited = true
                        joinPolicyInput = normalizeTeamJoinPolicyInput(value, openRegistration = false)
                    },
                    options = TeamJoinPolicyOptions,
                    modifier = Modifier.fillMaxWidth(),
                    label = "Join mode",
                    placeholder = "Select join mode",
                    enabled = canEditFields,
                )
                Text(
                    text = when {
                        isOpenRegistrationInput -> "Players can join this team without an invite."
                        isRequestToJoinInput -> "Players submit a request first. Managers approve before any bill is sent."
                        else -> "Players need an invite to join this team."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Spacer(modifier = Modifier.height(8.dp))
                InclusivePriceInput(
                    totalPriceCents = registrationPriceCentsInput,
                    onTotalPriceChange = { nextCents ->
                        registrationSettingsEdited = true
                        registrationCostInput = nextCents
                            .coerceAtLeast(0)
                            .takeIf { it > 0 }
                            ?.toString()
                            .orEmpty()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    totalLabel = "Registration price",
                    enabled = canEditFields &&
                        joinPolicyInput.allowsRegistrationCostLabel() &&
                        !(isOpenRegistrationInput && !canChargeRegistration),
                )
                Text(
                    text = when {
                        isRequestToJoinInput -> "Request-only prices are labels. Players are not prompted for payment until you send a bill."
                        !joinPolicyInput.allowsRegistrationCostLabel() -> "Choose open registration or request to join to set a price."
                        canChargeRegistration -> "Leave blank for free registration."
                        else -> "Connect Stripe to charge for open registration. Free registration is still available."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            } else {
                ReadOnlyLabeledValue(
                    label = "Join mode",
                    value = formatJoinPolicy(joinPolicyInput),
                    supportingText = when {
                        isOpenRegistrationInput -> "Players can join this team without an invite."
                        isRequestToJoinInput -> "Players submit a request before joining."
                        else -> "Players need an invite to join this team."
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(modifier = Modifier.height(8.dp))
                ReadOnlyLabeledValue(
                    label = "Registration cost",
                    value = formatRegistrationCost(
                        joinPolicy = joinPolicyInput,
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
                    val complianceSummary = complianceByUserId[player.id]
                    TeamPlayerRosterRow(
                        player = player,
                        jerseyNumber = jerseyNumber,
                        showEditDetails = showEditDetails,
                        canEditFields = canEditFields,
                        complianceSummary = complianceSummary,
                        complianceLoading = memberComplianceLoading,
                        complianceExpanded = expandedComplianceUserIds.contains(player.id),
                        onToggleComplianceDetails = complianceSummary?.let {
                            {
                                expandedComplianceUserIds = if (expandedComplianceUserIds.contains(player.id)) {
                                    expandedComplianceUserIds - player.id
                                } else {
                                    expandedComplianceUserIds + player.id
                                }
                            }
                        },
                        onJerseyNumberChange = { updateJerseyNumber(player.id, it) },
                        onRemove = { playersInTeam = playersInTeam - player },
                    )
                }
                invitedPlayers.forEach { player ->
                    val jerseyNumber = jerseyNumberForUser(player.id)
                    val complianceSummary = complianceByUserId[player.id]
                    TeamPlayerRosterRow(
                        player = player,
                        isPending = true,
                        jerseyNumber = jerseyNumber,
                        showEditDetails = showEditDetails,
                        canEditFields = canEditFields,
                        complianceSummary = complianceSummary,
                        complianceLoading = memberComplianceLoading,
                        complianceExpanded = expandedComplianceUserIds.contains(player.id),
                        onToggleComplianceDetails = complianceSummary?.let {
                            {
                                expandedComplianceUserIds = if (expandedComplianceUserIds.contains(player.id)) {
                                    expandedComplianceUserIds - player.id
                                } else {
                                    expandedComplianceUserIds + player.id
                                }
                            }
                        },
                        onJerseyNumberChange = { updateJerseyNumber(player.id, it) },
                        onRemove = { invitedPlayers = invitedPlayers - player },
                    )
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
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TeamStaffRoleSection(
                    role = "Manager",
                    users = listOfNotNull(managerUser),
                    fallbackLabels = managerFallbackLabels,
                )
                TeamStaffRoleSection(
                    role = "Head Coach",
                    users = listOfNotNull(headCoachUser),
                    fallbackLabels = headCoachFallbackLabels,
                )
                TeamStaffRoleSection(
                    role = "Assistant Coaches",
                    users = assistantCoachUsers,
                    fallbackLabels = assistantCoachFallbackLabels,
                )
            }
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

            if (!showEditDetails) {
                Spacer(modifier = Modifier.height(16.dp))
                ExpandableReadOnlyTeamDetails(
                    teamSize = teamSizeInput.trim().ifBlank { syncedTeam.teamSize.toString() },
                    sport = sportInput.trim().ifBlank { "Unassigned" },
                    gender = readOnlyDivisionLabels.gender,
                    skillDivision = readOnlyDivisionLabels.skillDivision,
                    ageDivision = readOnlyDivisionLabels.ageDivision,
                    expanded = teamDetailsExpanded,
                    onToggleExpanded = { teamDetailsExpanded = !teamDetailsExpanded },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier.weight(1f),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    when {
                        isCaptain -> {
                            IconButton(
                                onClick = { showDeleteDialog = true },
                                enabled = deleteEnabled && !isBusy,
                                colors = IconButtonColors(
                                    containerColor = MaterialTheme.colorScheme.error,
                                    contentColor = MaterialTheme.colorScheme.onError,
                                    disabledContainerColor = MaterialTheme.colorScheme.errorContainer,
                                    disabledContentColor = MaterialTheme.colorScheme.onErrorContainer,
                                ),
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = "Delete team")
                            }
                        }
                        showRefundRequestAction -> {
                            OutlinedButton(
                                onClick = { showRefundRequestDialog = true },
                                enabled = !isBusy,
                            ) {
                                Text(if (isRequestingRefund) "Requesting..." else "Request Refund")
                            }
                        }
                    }
                }

                Box(
                    modifier = Modifier.weight(1f),
                    contentAlignment = Alignment.CenterEnd,
                ) {
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
                        }, enabled = !isBusy && isTeamSizeValid && isTeamDivisionValid && isTeamNameValid) {
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
                        Button(onClick = { showLeaveTeamDialog = true }, enabled = !isBusy) {
                            Text("Leave Team")
                        }
                    }
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

    if (showRefundRequestDialog && onRequestRefund != null) {
        AlertDialog(
            onDismissRequest = {
                showRefundRequestDialog = false
                refundReasonInput = ""
            },
            title = { Text("Refund Request") },
            text = {
                Column {
                    Text(
                        "Please provide a reason for your refund request:",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                    StandardTextField(
                        value = refundReasonInput,
                        onValueChange = { refundReasonInput = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = "Enter reason...",
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        onRequestRefund(team.team, refundReasonInput)
                        showRefundRequestDialog = false
                        refundReasonInput = ""
                    },
                    enabled = refundReasonInput.isNotBlank() && !isBusy,
                ) {
                    Text("Submit Refund Request")
                }
            },
            dismissButton = {
                OutlinedButton(
                    onClick = {
                        showRefundRequestDialog = false
                        refundReasonInput = ""
                    },
                    enabled = !isBusy,
                ) {
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
private fun TeamPlayerRosterRow(
    player: UserData,
    isPending: Boolean = false,
    jerseyNumber: String,
    showEditDetails: Boolean,
    canEditFields: Boolean,
    complianceSummary: EventComplianceUserSummary? = null,
    complianceLoading: Boolean = false,
    complianceExpanded: Boolean = false,
    onToggleComplianceDetails: (() -> Unit)? = null,
    onJerseyNumberChange: (String) -> Unit,
    onRemove: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val shouldStackControls = maxWidth < TeamPlayerInlineMinWidth
            if (!showEditDetails) {
                PlayerCard(
                    player = player,
                    isPending = isPending,
                    modifier = Modifier.fillMaxWidth(),
                    jerseyNumber = jerseyNumber,
                    trailingContent = {
                        JerseyNumberReadOnlyView(value = jerseyNumber)
                    },
                    showDivider = false,
                )
            } else if (shouldStackControls) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    PlayerCard(
                        player = player,
                        isPending = isPending,
                        modifier = Modifier.fillMaxWidth(),
                        jerseyNumber = jerseyNumber,
                        showDivider = false,
                    )
                    TeamPlayerControlsRow(
                        jerseyNumber = jerseyNumber,
                        showEditDetails = showEditDetails,
                        canEditFields = canEditFields,
                        complianceExpanded = complianceExpanded,
                        complianceLoading = complianceLoading,
                        onToggleComplianceDetails = onToggleComplianceDetails,
                        onJerseyNumberChange = onJerseyNumberChange,
                        onRemove = onRemove,
                        modifier = Modifier.fillMaxWidth(),
                        expandActionButtons = true,
                    )
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PlayerCard(
                        player = player,
                        isPending = isPending,
                        modifier = Modifier.weight(1f),
                        jerseyNumber = jerseyNumber,
                        showDivider = false,
                    )
                    TeamPlayerControlsRow(
                        jerseyNumber = jerseyNumber,
                        showEditDetails = showEditDetails,
                        canEditFields = canEditFields,
                        complianceExpanded = complianceExpanded,
                        complianceLoading = complianceLoading,
                        onToggleComplianceDetails = onToggleComplianceDetails,
                        onJerseyNumberChange = onJerseyNumberChange,
                        onRemove = onRemove,
                    )
                }
            }
        }
        if (complianceExpanded && complianceSummary != null) {
            TeamMemberComplianceDetails(userSummary = complianceSummary)
        }
        HorizontalDivider(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.outlineVariant,
            thickness = 0.5.dp,
        )
    }
}

@Composable
private fun TeamPlayerControlsRow(
    jerseyNumber: String,
    showEditDetails: Boolean,
    canEditFields: Boolean,
    complianceExpanded: Boolean,
    complianceLoading: Boolean,
    onToggleComplianceDetails: (() -> Unit)?,
    onJerseyNumberChange: (String) -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
    expandActionButtons: Boolean = false,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        JerseyNumberField(
            value = jerseyNumber,
            onValueChange = onJerseyNumberChange,
            canEdit = canEditFields,
        )
        if (showEditDetails) {
            onToggleComplianceDetails?.let { toggleDetails ->
                OutlinedButton(
                    onClick = toggleDetails,
                    enabled = !complianceLoading,
                    modifier = if (expandActionButtons) Modifier.weight(1f) else Modifier,
                ) {
                    Text(if (complianceExpanded) "Hide" else "Details")
                }
            }
            Button(
                onClick = onRemove,
                enabled = canEditFields,
                modifier = if (expandActionButtons) Modifier.weight(1f) else Modifier,
            ) {
                Text("Remove")
            }
        }
    }
}

private fun EventCompliancePaymentSummary.paymentStatusText(): String {
    return when {
        paymentPending -> "Payment pending"
        !hasBill -> "No bill yet"
        isPaidInFull -> "Paid in full ($${MoneyInputUtils.centsToDisplayValue(totalAmountCents)})"
        else -> "$${MoneyInputUtils.centsToDisplayValue(paidAmountCents)} of $${MoneyInputUtils.centsToDisplayValue(totalAmountCents)} paid"
    }
}

private fun EventComplianceDocumentCounts.documentStatusText(): String {
    return if (requiredCount <= 0) {
        "No required documents"
    } else {
        "$signedCount/$requiredCount signed"
    }
}

private fun EventCompliancePaymentSummary.needsAttention(): Boolean =
    paymentPending || (hasBill && !isPaidInFull)

private fun EventComplianceDocumentCounts.needsAttention(): Boolean =
    requiredCount > 0 && signedCount < requiredCount

@Composable
private fun TeamMemberComplianceDetails(userSummary: EventComplianceUserSummary) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            ComplianceStatusLine(
                label = "Billing",
                value = userSummary.payment.paymentStatusText(),
                needsAttention = userSummary.payment.needsAttention(),
            )
            ComplianceStatusLine(
                label = "Documents",
                value = userSummary.documents.documentStatusText(),
                needsAttention = userSummary.documents.needsAttention(),
            )
            if (userSummary.registrationAnswers.isNotEmpty()) {
                HorizontalDivider()
                RegistrationAnswersSection(answers = userSummary.registrationAnswers)
            }
            if (userSummary.requiredDocuments.isNotEmpty()) {
                HorizontalDivider()
                userSummary.requiredDocuments.forEach { document ->
                    TeamMemberComplianceDocumentRow(document = document)
                }
            }
        }
    }
}

@Composable
private fun RegistrationAnswersSection(answers: List<RegistrationQuestionAnswerSummary>) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = "Registration answers",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        answers
            .sortedBy(RegistrationQuestionAnswerSummary::sortOrder)
            .forEach { answer ->
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = answer.prompt,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Text(
                        text = answer.answer.ifBlank { "No answer" },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
    }
}

@Composable
private fun ComplianceStatusLine(
    label: String,
    value: String,
    needsAttention: Boolean,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = if (needsAttention) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun TeamMemberComplianceDocumentRow(document: EventComplianceRequiredDocument) {
    val signed = document.status.equals("SIGNED", ignoreCase = true) ||
        document.status.equals("COMPLETED", ignoreCase = true)
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = document.title.ifBlank { "Required document" },
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = document.signerLabel.ifBlank { "Participant" },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = if (signed) "Signed" else "Needs signature",
                style = MaterialTheme.typography.labelMedium,
                color = if (signed) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
            )
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

    Column(
        modifier = Modifier.width(JerseyNumberFieldWidth),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = "Jersey",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        StandardTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            keyboardType = "number",
            inputFilter = { input -> input.filter(Char::isDigit).take(JerseyNumberMaxDigits) },
            readOnly = !canEdit,
            height = JerseyNumberFieldHeight,
        )
    }
}

@Composable
private fun JerseyNumberReadOnlyView(value: String) {
    Column(
        modifier = Modifier.width(JerseyNumberFieldWidth),
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
private fun ExpandableReadOnlyTeamDetails(
    teamSize: String,
    sport: String,
    gender: String,
    skillDivision: String,
    ageDivision: String,
    expanded: Boolean,
    onToggleExpanded: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val bottomCornerSize = if (expanded) 0.dp else 16.dp
    val details = listOf(
        "Team Size" to teamSize,
        "Sport" to sport,
        "Gender" to gender,
        "Skill Division" to skillDivision,
        "Age Division" to ageDivision,
    )

    Column(modifier = modifier.fillMaxWidth()) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = if (expanded) 0.dp else 6.dp),
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomStart = bottomCornerSize,
                bottomEnd = bottomCornerSize,
            ),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggleExpanded)
                    .semantics(mergeDescendants = true) {
                        contentDescription = if (expanded) {
                            "Collapse team details"
                        } else {
                            "Expand team details"
                        }
                    }
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Team Details",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                Icon(
                    imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        AnimatedVisibility(visible = expanded) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 6.dp)
                    .offset(y = (-1).dp),
                shape = RoundedCornerShape(
                    topStart = 0.dp,
                    topEnd = 0.dp,
                    bottomStart = 16.dp,
                    bottomEnd = 16.dp,
                ),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
            ) {
                ReadOnlyDetailsGrid(
                    values = details,
                    modifier = Modifier.padding(16.dp),
                )
            }
        }
    }
}

@Composable
private fun ReadOnlyDetailsGrid(
    values: List<Pair<String, String>>,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(modifier = modifier.fillMaxWidth()) {
        val columns = if (maxWidth >= 360.dp) 2 else 1
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            values.chunked(columns).forEach { rowValues ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    rowValues.forEach { (label, value) ->
                        ReadOnlyLabeledValue(
                            label = label,
                            value = value.ifBlank { "Unassigned" },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    repeat(columns - rowValues.size) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun TeamStaffRoleSection(
    role: String,
    users: List<UserData>,
    fallbackLabels: List<String>,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = role,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (users.isEmpty() && fallbackLabels.isEmpty()) {
            Text(
                text = "Unassigned",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        users.forEach { user ->
            PlayerCard(
                player = user,
                modifier = Modifier.fillMaxWidth(),
                showDivider = false,
            )
        }
        fallbackLabels.forEach { label ->
            Text(
                text = label.ifBlank { "Unassigned" },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
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
