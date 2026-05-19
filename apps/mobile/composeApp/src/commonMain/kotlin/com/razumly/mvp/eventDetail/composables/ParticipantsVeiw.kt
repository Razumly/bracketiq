package com.razumly.mvp.eventDetail.composables

import coil3.compose.AsyncImage
import com.razumly.mvp.core.network.userMessage
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.activePlayerRegistrations
import com.razumly.mvp.core.data.dataTypes.activeStaffAssignments
import com.razumly.mvp.core.data.dataTypes.isCaptainOrManager
import com.razumly.mvp.core.data.dataTypes.resolvedDivisionPriceCents
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.data.repositories.EventTeamBillCreateRequest
import com.razumly.mvp.core.data.repositories.EventTeamBillingSnapshot
import com.razumly.mvp.core.data.repositories.EventTeamBillingUserOption
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckout
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckoutRequest
import com.razumly.mvp.core.data.repositories.EventComplianceDocumentCounts
import com.razumly.mvp.core.data.repositories.EventCompliancePaymentSummary
import com.razumly.mvp.core.data.repositories.EventComplianceRequiredDocument
import com.razumly.mvp.core.data.repositories.EventComplianceUserSummary
import com.razumly.mvp.core.data.repositories.EventTeamComplianceSummary
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.UserVisibilityContext
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.PlayerInteractionComponent
import com.razumly.mvp.core.presentation.composables.MoneyInputField
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.composables.PlayerAction
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.PlayerCardWithActions
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.presentation.composables.TeamDetailsDialog
import com.razumly.mvp.core.presentation.util.getScreenWidth
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventDetail.LocalTournamentComponent
import com.razumly.mvp.eventDetail.EventDetailDivisionOption
import com.razumly.mvp.eventDetail.eventDivisionMatchIdentifiers
import com.razumly.mvp.eventDetail.findEventDivisionOption
import com.razumly.mvp.eventDetail.matchesDivisionIdentifier
import com.razumly.mvp.eventDetail.resolveSelectedEventDivisionId
import com.razumly.mvp.eventDetail.visibleTeams
import kotlin.math.round
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

private const val MOBILE_BREAKPOINT_DP = 600

enum class ParticipantsSection(val label: String) {
    TEAMS("Teams"),
    PARTICIPANTS("Participants"),
    FREE_AGENTS("Free Agents"),
}

internal fun visibleParticipantTeams(
    event: Event,
    teams: Iterable<TeamWithPlayers>,
): List<TeamWithPlayers> = event.visibleTeams(teams.toList())

internal fun visibleParticipantTeamsForDivision(
    event: Event,
    teams: Iterable<TeamWithPlayers>,
    divisionOptions: List<EventDetailDivisionOption>,
    selectedDivisionId: String?,
): List<TeamWithPlayers> {
    val visibleTeams = visibleParticipantTeams(event, teams)
    val selectedOption = selectedParticipantDivisionOption(event, divisionOptions, selectedDivisionId)
        ?: return visibleTeams
    return visibleTeams.filter { team ->
        team.matchesParticipantDivision(
            selectedOption = selectedOption,
            divisionOptions = divisionOptions,
        )
    }
}

internal fun hasParticipantDivisionFilter(
    event: Event,
    divisionOptions: List<EventDetailDivisionOption>,
    selectedDivisionId: String?,
): Boolean = selectedParticipantDivisionOption(event, divisionOptions, selectedDivisionId) != null

private fun selectedParticipantDivisionOption(
    event: Event,
    divisionOptions: List<EventDetailDivisionOption>,
    selectedDivisionId: String?,
): EventDetailDivisionOption? {
    if (event.singleDivision) return null
    if (divisionOptions.size <= 1) return null
    val resolvedDivisionId = divisionOptions.resolveSelectedEventDivisionId(selectedDivisionId)
        ?: return null
    return divisionOptions.firstOrNull { option -> option.matchesDivisionIdentifier(resolvedDivisionId) }
}

private fun TeamWithPlayers.matchesParticipantDivision(
    selectedOption: EventDetailDivisionOption,
    divisionOptions: List<EventDetailDivisionOption>,
): Boolean {
    return resolveParticipantDivisionOption(divisionOptions)?.id == selectedOption.id
}

private fun participantUserIdsForTeams(teams: Iterable<TeamWithPlayers>): Set<String> =
    teams.flatMap { teamWithPlayers ->
        val syncedTeam = teamWithPlayers.team.withSynchronizedMembership()
        buildList {
            addAll(syncedTeam.activePlayerRegistrations().map { registration -> registration.userId })
            addAll(syncedTeam.playerIds)
            addAll(teamWithPlayers.players.map { player -> player.id })
        }
    }
        .map(String::trim)
        .filter(String::isNotBlank)
        .toSet()

private enum class ParticipantCardType {
    TEAM,
    USER,
}

private sealed class ParticipantAnimatedCard {
    abstract val stableId: String

    data class TeamEntry(
        val team: TeamWithPlayers,
    ) : ParticipantAnimatedCard() {
        override val stableId: String = "team:${team.team.id}"
    }

    data class UserEntry(
        val user: UserData,
        val section: ParticipantsSection,
    ) : ParticipantAnimatedCard() {
        override val stableId: String = "${section.name}:${user.id}"
    }
}

private enum class ParticipantCardWavePhase {
    VISIBLE,
    ENTERING,
    EXITING,
}

private data class ParticipantCardWaveSlot(
    val index: Int,
    val outgoing: ParticipantAnimatedCard?,
    val incoming: ParticipantAnimatedCard?,
    val transitioning: Boolean,
)

private fun List<ParticipantAnimatedCard>.toParticipantVisibleSlots(): List<ParticipantCardWaveSlot> =
    mapIndexed { index, card ->
        ParticipantCardWaveSlot(
            index = index,
            outgoing = null,
            incoming = card,
            transitioning = false,
        )
    }

private fun buildParticipantWaveSlots(
    outgoingCards: List<ParticipantAnimatedCard>,
    incomingCards: List<ParticipantAnimatedCard>,
): List<ParticipantCardWaveSlot> {
    val slotCount = maxOf(outgoingCards.size, incomingCards.size)
    return List(slotCount) { index ->
        ParticipantCardWaveSlot(
            index = index,
            outgoing = outgoingCards.getOrNull(index),
            incoming = incomingCards.getOrNull(index),
            transitioning = true,
        )
    }
}

private fun participantWaveDelay(index: Int): Int =
    (index * ParticipantCardWaveDelayMillis).coerceAtMost(ParticipantCardWaveMaxDelayMillis)

private const val ParticipantCardSlideInMillis = 220
private const val ParticipantCardFadeInMillis = 180
private const val ParticipantCardFadeInDelayMillis = 60
private const val ParticipantCardSlideOutMillis = 180
private const val ParticipantCardFadeOutMillis = 150
private const val ParticipantCardWaveDelayMillis = 22
private const val ParticipantCardWaveMaxDelayMillis = 154
private const val ParticipantCardTransitionRetainMillis = 420

private data class ParticipantCardListState(
    val animationKey: String,
    val cards: List<ParticipantAnimatedCard>,
    val emptyMessage: String,
    val showLoading: Boolean = false,
    val loadingMessage: String? = null,
)

private data class ParticipantBillingContext(
    val billingTeamId: String,
    val title: String,
    val userOptions: List<EventTeamBillingUserOption>,
    val allowTeamOwner: Boolean,
    val defaultOwnerType: String,
    val defaultOwnerId: String?,
)

private data class ParticipantRemoveTarget(
    val cardType: ParticipantCardType,
    val title: String,
    val subtitle: String,
    val team: TeamWithPlayers? = null,
    val userId: String? = null,
)

private data class ParticipantManagementTarget(
    val cardType: ParticipantCardType,
    val title: String,
    val team: TeamWithPlayers? = null,
    val user: UserData? = null,
    val billingContext: ParticipantBillingContext? = null,
    val teamCompliance: EventTeamComplianceSummary? = null,
    val userCompliance: EventComplianceUserSummary? = null,
)

private data class ParticipantPaymentQrState(
    val title: String,
    val checkout: EventTeamPaymentCheckout,
)

private fun EventCompliancePaymentSummary.paymentStatusText(cardType: ParticipantCardType): String {
    if (paymentPending) {
        return "Payment pending"
    }
    if (!hasBill) {
        return if (cardType == ParticipantCardType.TEAM) "No team bill yet" else "No bill yet"
    }
    if (isPaidInFull) {
        return "Paid in full (${formatCurrency(totalAmountCents)})"
    }
    val prefix = if (inheritedFromTeamBill) "Team bill" else "Bill"
    return "$prefix: ${formatCurrency(paidAmountCents)} of ${formatCurrency(totalAmountCents)} paid"
}

private fun EventComplianceDocumentCounts.documentStatusText(): String {
    if (requiredCount <= 0) {
        return "No required documents"
    }
    return "$signedCount/$requiredCount signatures complete"
}

private fun EventComplianceDocumentCounts.needsAttention(): Boolean {
    return requiredCount > 0 && signedCount < requiredCount
}

private fun EventCompliancePaymentSummary.needsAttention(): Boolean {
    return paymentPending || (hasBill && !isPaidInFull && totalAmountCents > 0)
}

private fun EventComplianceUserSummary.registrationLabel(): String {
    return if (registrationType.equals("CHILD", ignoreCase = true)) {
        "Child registration"
    } else {
        "Adult registration"
    }
}

private fun TeamWithPlayers.resolveParticipantDivisionId(
    divisionOptions: List<EventDetailDivisionOption>,
    fallbackDivisionId: String?,
): String? {
    if (divisionOptions.isEmpty()) return null
    return resolveParticipantDivisionOption(divisionOptions)?.id
        ?: divisionOptions.resolveSelectedEventDivisionId(fallbackDivisionId)
}

private fun TeamWithPlayers.resolveParticipantDivisionOption(
    divisionOptions: List<EventDetailDivisionOption>,
): EventDetailDivisionOption? {
    team.eventDivisionMatchIdentifiers().forEach { identifier ->
        divisionOptions.findEventDivisionOption(identifier)?.let { option ->
            return option
        }
    }
    return null
}

@Composable
fun ParticipantsView(
    showFab: (Boolean) -> Unit,
    section: ParticipantsSection = ParticipantsSection.TEAMS,
    onNavigateToChat: (UserData) -> Unit,
    manageMode: Boolean = false,
    canManageParticipants: Boolean = false,
    topContentPadding: Dp = 0.dp,
    selectedDivisionId: String? = null,
    divisionOptions: List<EventDetailDivisionOption> = emptyList(),
    onTeamDivisionSelected: (TeamWithPlayers, String) -> Unit = { _, _ -> },
) {
    val component = LocalTournamentComponent.current
    val divisionTeams by component.divisionTeams.collectAsState()
    val selectedEvent by component.eventWithRelations.collectAsState()
    val currentUser by component.currentUser.collectAsState()
    val startingTeamRegistrationId by component.startingTeamRegistrationId.collectAsState()
    val participantManagementLoading by component.participantManagementLoading.collectAsState()
    val teamComplianceSummaries by component.teamComplianceSummaries.collectAsState()
    val userComplianceSummaries by component.userComplianceSummaries.collectAsState()
    val participantComplianceLoading by component.participantComplianceLoading.collectAsState()
    val participants = selectedEvent.players
    val teamSignup = selectedEvent.event.teamSignup
    val eventTeams = remember(selectedEvent.event.eventType, teamSignup, selectedEvent.teams) {
        visibleParticipantTeams(selectedEvent.event, selectedEvent.teams)
    }
    val visibleDivisionTeams = remember(
        selectedEvent.event.eventType,
        teamSignup,
        divisionTeams,
        divisionOptions,
        selectedDivisionId,
    ) {
        visibleParticipantTeamsForDivision(
            event = selectedEvent.event,
            teams = divisionTeams.values,
            divisionOptions = divisionOptions,
            selectedDivisionId = selectedDivisionId,
        )
    }
    val filtersByDivision = remember(selectedEvent.event.singleDivision, divisionOptions, selectedDivisionId) {
        hasParticipantDivisionFilter(selectedEvent.event, divisionOptions, selectedDivisionId)
    }
    val participantTeams = remember(eventTeams, visibleDivisionTeams, filtersByDivision) {
        if (filtersByDivision) visibleDivisionTeams else eventTeams
    }
    val participantIds = remember(selectedEvent.event.playerIds) {
        selectedEvent.event.playerIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
    }
    val participantUsersFromEvent = remember(participantIds, selectedEvent.players) {
        val playersById = selectedEvent.players.associateBy(UserData::id)
        participantIds.mapNotNull(playersById::get)
    }
    val freeAgentIds = remember(selectedEvent.event.freeAgentIds) {
        selectedEvent.event.freeAgentIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
    }
    val freeAgentUsers = remember(freeAgentIds, selectedEvent.players) {
        val playersById = selectedEvent.players.associateBy(UserData::id)
        freeAgentIds.mapNotNull(playersById::get)
    }
    val participantUsers = remember(selectedEvent.players, participantTeams, freeAgentUsers, filtersByDivision) {
        val usersById = (selectedEvent.players + participantTeams.flatMap { team -> team.players })
            .distinctBy(UserData::id)
            .associateBy(UserData::id)
        val teamUserIds = participantUserIdsForTeams(participantTeams)
        val teamPlayers = if (teamUserIds.isEmpty()) {
            participantTeams.flatMap { team -> team.players }
        } else {
            teamUserIds.mapNotNull(usersById::get)
        }
        val unassignedUsers = if (filtersByDivision) emptyList() else freeAgentUsers
        (teamPlayers + unassignedUsers).distinctBy(UserData::id)
    }
    val visibleParticipants = remember(teamSignup, participantUsers, participantUsersFromEvent, participants) {
        if (teamSignup) {
            participantUsers
        } else {
            participantUsersFromEvent.ifEmpty { participants }
        }
    }
    val participantCardsDivisionKey = remember(filtersByDivision, divisionOptions, selectedDivisionId) {
        if (!filtersByDivision) {
            "all"
        } else {
            divisionOptions.resolveSelectedEventDivisionId(selectedDivisionId)
                ?: selectedDivisionId?.trim().orEmpty()
        }
    }
    val participantCardListState = remember(
        section,
        participantCardsDivisionKey,
        teamSignup,
        visibleDivisionTeams,
        freeAgentUsers,
        visibleParticipants,
        manageMode,
        canManageParticipants,
        participantManagementLoading,
        participantComplianceLoading,
    ) {
        when (section) {
            ParticipantsSection.TEAMS -> ParticipantCardListState(
                animationKey = "${section.name}:$participantCardsDivisionKey",
                cards = if (teamSignup) {
                    visibleDivisionTeams.map { team ->
                        ParticipantAnimatedCard.TeamEntry(team)
                    }
                } else {
                    emptyList()
                },
                emptyMessage = "No teams yet.",
            )
            ParticipantsSection.FREE_AGENTS -> ParticipantCardListState(
                animationKey = "${section.name}:$participantCardsDivisionKey",
                cards = if (teamSignup) {
                    freeAgentUsers.map { user ->
                        ParticipantAnimatedCard.UserEntry(
                            user = user,
                            section = section,
                        )
                    }
                } else {
                    emptyList()
                },
                emptyMessage = "No free agents yet.",
            )
            ParticipantsSection.PARTICIPANTS -> ParticipantCardListState(
                animationKey = "${section.name}:$participantCardsDivisionKey",
                cards = visibleParticipants.map { user ->
                    ParticipantAnimatedCard.UserEntry(
                        user = user,
                        section = section,
                    )
                },
                emptyMessage = "No participants yet.",
                showLoading = manageMode &&
                    canManageParticipants &&
                    (participantManagementLoading || participantComplianceLoading),
                loadingMessage = "Loading registration details...",
            )
        }
    }
    var displayedParticipantAnimationKey by remember {
        mutableStateOf(participantCardListState.animationKey)
    }
    var displayedParticipantSlots by remember {
        mutableStateOf(participantCardListState.cards.toParticipantVisibleSlots())
    }
    LaunchedEffect(participantCardListState.animationKey, participantCardListState.cards) {
        if (displayedParticipantAnimationKey == participantCardListState.animationKey) {
            displayedParticipantSlots = participantCardListState.cards.toParticipantVisibleSlots()
            return@LaunchedEffect
        }
        val outgoingCards = displayedParticipantSlots.mapNotNull { slot ->
            slot.incoming ?: slot.outgoing
        }
        displayedParticipantAnimationKey = participantCardListState.animationKey
        displayedParticipantSlots = buildParticipantWaveSlots(
            outgoingCards = outgoingCards,
            incomingCards = participantCardListState.cards,
        )
        delay(ParticipantCardTransitionRetainMillis.toLong())
        displayedParticipantSlots = participantCardListState.cards.toParticipantVisibleSlots()
    }
    val participantsTeamsByUserId = remember(participantTeams) {
        mutableMapOf<String, TeamWithPlayers>().apply {
            participantTeams.forEach { teamWithPlayers: TeamWithPlayers ->
                val team = teamWithPlayers.team.withSynchronizedMembership()
                val memberIds = buildSet {
                    addAll(team.activePlayerRegistrations().map { it.userId })
                    team.captainId.takeIf(String::isNotBlank)?.let(::add)
                    addAll(team.activeStaffAssignments().map { it.userId })
                }.map(String::trim).filter(String::isNotBlank)

                memberIds.forEach { memberId ->
                    if (!containsKey(memberId)) {
                        this[memberId] = teamWithPlayers
                    }
                }
            }
        }.toMap()
    }
    val canInviteToTeam = remember(eventTeams, currentUser.id) {
        eventTeams.any { teamWithPlayers ->
            teamWithPlayers.team.isCaptainOrManager(currentUser.id)
        }
    }
    val navPadding = LocalNavBarPadding.current
    val lazyColumnState = rememberLazyListState()
    val isScrollingUp by lazyColumnState.isScrollingUp()
    val showParticipantsTitle = getScreenWidth() >= MOBILE_BREAKPOINT_DP
    val popUpHandler = LocalPopupHandler.current
    val loadingHandler = LocalLoadingHandler.current
    val coroutineScope = rememberCoroutineScope()

    var selectedTeam by remember { mutableStateOf<TeamWithPlayers?>(null) }
    var showTeamDialog by remember { mutableStateOf(false) }
    var teamDialogKnownUsers by remember { mutableStateOf<Map<String, UserData>>(emptyMap()) }

    var managementTarget by remember { mutableStateOf<ParticipantManagementTarget?>(null) }
    var removeTarget by remember { mutableStateOf<ParticipantRemoveTarget?>(null) }

    var refundContext by remember { mutableStateOf<ParticipantBillingContext?>(null) }
    var refundSnapshot by remember { mutableStateOf<EventTeamBillingSnapshot?>(null) }
    var refundError by remember { mutableStateOf<String?>(null) }
    var refundLoading by remember { mutableStateOf(false) }
    var refundingPaymentId by remember { mutableStateOf<String?>(null) }
    var refundAmountDraftByPaymentId by remember { mutableStateOf<Map<String, String>>(emptyMap()) }

    var billContext by remember { mutableStateOf<ParticipantBillingContext?>(null) }
    var createBillError by remember { mutableStateOf<String?>(null) }
    var creatingBill by remember { mutableStateOf(false) }
    var createBillOwnerType by remember { mutableStateOf("TEAM") }
    var createBillOwnerId by remember { mutableStateOf<String?>(null) }
    var createBillAmount by remember { mutableStateOf("0") }
    var createBillTax by remember { mutableStateOf("0") }
    var createBillAllowSplit by remember { mutableStateOf(false) }
    var createBillLabel by remember { mutableStateOf("Event registration") }

    var receivingPaymentTargetId by remember { mutableStateOf<String?>(null) }
    var paymentQrState by remember { mutableStateOf<ParticipantPaymentQrState?>(null) }

    val playerInteractionComponent = remember {
        getKoin().get<PlayerInteractionComponent> { parametersOf(component) }
    }
    val teamRepository = remember {
        getKoin().get<ITeamRepository>()
    }
    val userRepository = remember {
        getKoin().get<IUserRepository>()
    }
    val selectedTeamFlow = remember(selectedTeam?.team?.id) {
        selectedTeam?.team?.id
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let { teamId -> teamRepository.getTeamsFlow(listOf(teamId)) }
            ?: flowOf(Result.success(emptyList()))
    }
    val selectedTeamResult by selectedTeamFlow.collectAsState(
        initial = Result.success(selectedTeam?.let(::listOf) ?: emptyList()),
    )
    val selectedTeamForDialog = selectedTeamResult.getOrNull()?.firstOrNull() ?: selectedTeam

    LaunchedEffect(Unit) {
        playerInteractionComponent.setLoadingHandler(loadingHandler)
        playerInteractionComponent.errorState.collect { error ->
            if (error != null) {
                popUpHandler.showPopup(error)
            }
        }
    }

    LaunchedEffect(showTeamDialog, selectedTeamForDialog?.team?.id, currentUser.id, selectedEvent.players) {
        val team = selectedTeamForDialog
        if (!showTeamDialog || team == null) {
            teamDialogKnownUsers = emptyMap()
            return@LaunchedEffect
        }

        val baseKnownUsers = (
            selectedEvent.players +
                team.players +
                team.pendingPlayers +
                listOfNotNull(team.captain, currentUser)
            )
            .distinctBy(UserData::id)
            .associateBy(UserData::id)
        teamDialogKnownUsers = baseKnownUsers
        val syncedTeam = team.team.withSynchronizedMembership()

        val roleIds = buildSet {
            syncedTeam.captainId.takeIf(String::isNotBlank)?.let(::add)
            addAll(syncedTeam.activeStaffAssignments().map { it.userId })
        }
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()

        val missingRoleIds = roleIds.filterNot(baseKnownUsers::containsKey)
        if (missingRoleIds.isEmpty()) return@LaunchedEffect

        userRepository.getUsers(
            userIds = missingRoleIds,
            visibilityContext = UserVisibilityContext(teamId = team.team.id),
        ).onSuccess { loadedUsers ->
            teamDialogKnownUsers = (baseKnownUsers.values + loadedUsers)
                .distinctBy(UserData::id)
                .associateBy(UserData::id)
        }
    }

    showFab(isScrollingUp)

    fun toDisplayName(user: UserData): String {
        return user.fullName
            .ifBlank {
                listOf(user.firstName.trim(), user.lastName.trim())
                    .filter(String::isNotBlank)
                    .joinToString(" ")
            }
            .ifBlank { user.userName.ifBlank { user.id } }
    }

    fun resolveTeamUsers(team: TeamWithPlayers): List<EventTeamBillingUserOption> {
        val usersById = selectedEvent.players.associateBy(UserData::id)
        val syncedTeam = team.team.withSynchronizedMembership()
        val uniqueIds = buildSet {
            addAll(syncedTeam.activePlayerRegistrations().map { it.userId })
            syncedTeam.captainId.takeIf(String::isNotBlank)?.let(::add)
            addAll(syncedTeam.activeStaffAssignments().map { it.userId })
        }.map(String::trim).filter(String::isNotBlank)

        return uniqueIds.map { userId ->
            val existing = usersById[userId]
            EventTeamBillingUserOption(
                id = userId,
                displayName = existing?.let(::toDisplayName) ?: userId,
            )
        }
    }

    fun buildTeamBillingContext(team: TeamWithPlayers): ParticipantBillingContext {
        val teamName = team.team.name.trim().ifBlank { "Team" }
        val billOwnerTeamId = team.team.parentTeamId?.trim()?.takeIf(String::isNotBlank)
            ?: team.team.id
        val users = resolveTeamUsers(team)
        return ParticipantBillingContext(
            billingTeamId = team.team.id,
            title = teamName,
            userOptions = users,
            allowTeamOwner = true,
            defaultOwnerType = "TEAM",
            defaultOwnerId = billOwnerTeamId,
        )
    }

    fun buildUserBillingContext(user: UserData): ParticipantBillingContext? {
        if (!teamSignup) {
            val userName = toDisplayName(user)
            return ParticipantBillingContext(
                billingTeamId = user.id,
                title = userName,
                userOptions = listOf(
                    EventTeamBillingUserOption(
                        id = user.id,
                        displayName = userName,
                    )
                ),
                allowTeamOwner = false,
                defaultOwnerType = "USER",
                defaultOwnerId = user.id,
            )
        }

        val teamWithPlayers = participantsTeamsByUserId[user.id] ?: return null
        val users = resolveTeamUsers(teamWithPlayers)
        return ParticipantBillingContext(
            billingTeamId = teamWithPlayers.team.id,
            title = toDisplayName(user),
            userOptions = users,
            allowTeamOwner = true,
            defaultOwnerType = "USER",
            defaultOwnerId = user.id,
        )
    }

    fun teamManagementTarget(team: TeamWithPlayers): ParticipantManagementTarget {
        return ParticipantManagementTarget(
            cardType = ParticipantCardType.TEAM,
            title = team.team.name.ifBlank { "Team" },
            team = team,
            billingContext = buildTeamBillingContext(team),
            teamCompliance = teamComplianceSummaries[team.team.id],
        )
    }

    fun userManagementTarget(user: UserData): ParticipantManagementTarget {
        val teamSummary = participantsTeamsByUserId[user.id]
            ?.team
            ?.id
            ?.let(teamComplianceSummaries::get)
        val compliance = userComplianceSummaries[user.id]
            ?: teamSummary?.users?.firstOrNull { summary -> summary.userId == user.id }
        return ParticipantManagementTarget(
            cardType = ParticipantCardType.USER,
            title = toDisplayName(user),
            user = user,
            billingContext = buildUserBillingContext(user),
            teamCompliance = teamSummary,
            userCompliance = compliance,
        )
    }

    fun fallbackComplianceUser(user: UserData): EventComplianceUserSummary {
        return EventComplianceUserSummary(
            userId = user.id,
            fullName = toDisplayName(user),
            userName = user.userName.trim().takeIf(String::isNotBlank),
        )
    }

    fun fallbackTeamComplianceUsers(team: TeamWithPlayers): List<EventComplianceUserSummary> {
        val syncedTeam = team.team.withSynchronizedMembership()
        val knownUsers = (
            selectedEvent.players +
                team.players +
                team.pendingPlayers +
                listOfNotNull(team.captain)
            )
            .distinctBy(UserData::id)
            .associateBy(UserData::id)
        val rosterIds = buildSet {
            addAll(syncedTeam.activePlayerRegistrations().map { registration -> registration.userId })
            syncedTeam.captainId.takeIf(String::isNotBlank)?.let(::add)
            addAll(syncedTeam.activeStaffAssignments().map { assignment -> assignment.userId })
        }
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()

        val rosterUsers = rosterIds.map { userId ->
            knownUsers[userId]?.let(::fallbackComplianceUser)
                ?: EventComplianceUserSummary(userId = userId, fullName = userId)
        }
        return rosterUsers.ifEmpty {
            team.players.distinctBy(UserData::id).map(::fallbackComplianceUser)
        }
    }

    fun fallbackComplianceUsersForTarget(target: ParticipantManagementTarget): List<EventComplianceUserSummary> {
        return when (target.cardType) {
            ParticipantCardType.TEAM -> {
                target.teamCompliance?.users?.takeIf { users -> users.isNotEmpty() }
                    ?: target.team?.let(::fallbackTeamComplianceUsers)
                    ?: emptyList()
            }
            ParticipantCardType.USER -> {
                listOfNotNull(
                    target.userCompliance
                        ?: target.user?.let(::fallbackComplianceUser),
                )
            }
        }
    }

    fun buildRemoveTarget(target: ParticipantManagementTarget): ParticipantRemoveTarget? {
        return when (target.cardType) {
            ParticipantCardType.TEAM -> {
                val team = target.team ?: return null
                ParticipantRemoveTarget(
                    cardType = ParticipantCardType.TEAM,
                    title = "Remove ${target.title}?",
                    subtitle = "This removes the team from the event.",
                    team = team,
                )
            }
            ParticipantCardType.USER -> {
                val userId = target.user?.id
                    ?: target.userCompliance?.userId
                    ?: return null
                ParticipantRemoveTarget(
                    cardType = ParticipantCardType.USER,
                    title = "Remove ${target.title}?",
                    subtitle = "This removes the participant from the event.",
                    userId = userId,
                )
            }
        }
    }

    fun closeRefundModal() {
        refundContext = null
        refundSnapshot = null
        refundError = null
        refundLoading = false
        refundingPaymentId = null
        refundAmountDraftByPaymentId = emptyMap()
    }

    fun loadRefundSnapshot(context: ParticipantBillingContext) {
        refundContext = context
        refundLoading = true
        refundError = null
        refundSnapshot = null
        refundAmountDraftByPaymentId = emptyMap()
        coroutineScope.launch {
            component.getParticipantBillingSnapshot(context.billingTeamId)
                .onSuccess { snapshot ->
                    refundSnapshot = snapshot
                    refundAmountDraftByPaymentId = snapshot.bills
                        .flatMap { bill -> bill.payments }
                        .associate { payment ->
                            payment.id to payment.refundableAmountCents.coerceAtLeast(0).toString()
                        }
                }
                .onFailure { throwable ->
                    refundError = throwable.userMessage("Failed to load billing details.")
                }
            refundLoading = false
        }
    }

    fun openCreateBillModal(context: ParticipantBillingContext) {
        billContext = context
        createBillError = null
        creatingBill = false
        createBillOwnerType = context.defaultOwnerType
        createBillOwnerId = context.defaultOwnerId ?: context.userOptions.firstOrNull()?.id
        createBillAmount = "0"
        createBillTax = "0"
        createBillAllowSplit = false
        createBillLabel = "Event registration"
    }

    fun resolvePaymentDivisionId(target: ParticipantManagementTarget): String? {
        return when (target.cardType) {
            ParticipantCardType.TEAM -> target.team?.resolveParticipantDivisionId(
                divisionOptions = divisionOptions,
                fallbackDivisionId = selectedDivisionId,
            )
            ParticipantCardType.USER -> divisionOptions.resolveSelectedEventDivisionId(selectedDivisionId)
        }
    }

    fun startReceivePaymentNow(target: ParticipantManagementTarget) {
        val context = target.billingContext ?: return
        val divisionId = resolvePaymentDivisionId(target)
        val amountCents = selectedEvent.event.resolvedDivisionPriceCents(divisionId)
        if (amountCents == null || amountCents <= 0) {
            popUpHandler.showPopup("Set a price for this division before receiving payment.")
            return
        }

        val ownerType = if (teamSignup) "TEAM" else "USER"
        val ownerId = if (ownerType == "TEAM") {
            context.defaultOwnerId ?: context.billingTeamId
        } else {
            context.defaultOwnerId ?: context.userOptions.firstOrNull()?.id
        }
        if (ownerId.isNullOrBlank()) {
            popUpHandler.showPopup("Unable to determine who should pay.")
            return
        }

        val divisionLabel = divisionOptions
            .firstOrNull { option -> option.matchesDivisionIdentifier(divisionId) }
            ?.label
            ?.trim()
            ?.takeIf(String::isNotBlank)
        val label = divisionLabel?.let { "Event registration • $it" } ?: "Event registration"

        managementTarget = null
        receivingPaymentTargetId = context.billingTeamId
        coroutineScope.launch {
            loadingHandler.showLoading("Preparing payment QR...")
            component.createParticipantPaymentCheckout(
                teamId = context.billingTeamId,
                request = EventTeamPaymentCheckoutRequest(
                    ownerType = ownerType,
                    ownerId = ownerId,
                    eventAmountCents = amountCents,
                    taxAmountCents = 0,
                    divisionId = divisionId,
                    label = label,
                ),
            ).onSuccess { checkout ->
                paymentQrState = ParticipantPaymentQrState(
                    title = context.title,
                    checkout = checkout,
                )
            }.onFailure { throwable ->
                popUpHandler.showPopup(throwable.userMessage("Failed to prepare payment QR."))
            }
            receivingPaymentTargetId = null
            loadingHandler.hideLoading()
        }
    }

    @Composable
    fun ParticipantWaveCard(
        card: ParticipantAnimatedCard,
        phase: ParticipantCardWavePhase,
        index: Int,
        content: @Composable (ParticipantAnimatedCard) -> Unit,
    ) {
        val screenWidth = getScreenWidth()
        var enterReady by remember(card.stableId, phase) {
            mutableStateOf(phase != ParticipantCardWavePhase.ENTERING)
        }
        LaunchedEffect(card.stableId, phase) {
            if (phase == ParticipantCardWavePhase.ENTERING) {
                enterReady = true
            }
        }
        val rowDelay = participantWaveDelay(index)
        val targetOffset = when (phase) {
            ParticipantCardWavePhase.VISIBLE -> 0f
            ParticipantCardWavePhase.ENTERING -> if (enterReady) 0f else -screenWidth / 4f
            ParticipantCardWavePhase.EXITING -> screenWidth / 3f
        }
        val targetAlpha = when (phase) {
            ParticipantCardWavePhase.VISIBLE -> 1f
            ParticipantCardWavePhase.ENTERING -> if (enterReady) 1f else 0f
            ParticipantCardWavePhase.EXITING -> 0f
        }
        val slideDuration = when (phase) {
            ParticipantCardWavePhase.EXITING -> ParticipantCardSlideOutMillis
            else -> ParticipantCardSlideInMillis
        }
        val fadeDuration = when (phase) {
            ParticipantCardWavePhase.EXITING -> ParticipantCardFadeOutMillis
            else -> ParticipantCardFadeInMillis
        }
        val fadeDelay = when (phase) {
            ParticipantCardWavePhase.ENTERING -> ParticipantCardFadeInDelayMillis + rowDelay
            ParticipantCardWavePhase.EXITING -> rowDelay
            ParticipantCardWavePhase.VISIBLE -> 0
        }
        val animatedOffset by animateFloatAsState(
            targetValue = targetOffset,
            animationSpec = tween(
                durationMillis = slideDuration,
                delayMillis = if (phase == ParticipantCardWavePhase.VISIBLE) 0 else rowDelay,
            ),
            label = "participantCardWaveOffset",
        )
        val animatedAlpha by animateFloatAsState(
            targetValue = targetAlpha,
            animationSpec = tween(
                durationMillis = fadeDuration,
                delayMillis = fadeDelay,
            ),
            label = "participantCardWaveAlpha",
        )

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .offset(x = animatedOffset.dp)
                .alpha(animatedAlpha)
                .padding(horizontal = 12.dp),
        ) {
            content(card)
        }
    }

    @Composable
    fun ParticipantCardContent(card: ParticipantAnimatedCard) {
        when (card) {
            is ParticipantAnimatedCard.TeamEntry -> {
                TeamCard(
                    team = card.team,
                    modifier = Modifier.clickable {
                        if (manageMode && canManageParticipants) {
                            managementTarget = teamManagementTarget(card.team)
                        } else {
                            selectedTeam = card.team
                            showTeamDialog = true
                        }
                    },
                )
            }
            is ParticipantAnimatedCard.UserEntry -> {
                if (
                    card.section == ParticipantsSection.PARTICIPANTS &&
                    manageMode &&
                    canManageParticipants
                ) {
                    PlayerCard(
                        player = card.user,
                        modifier = Modifier.clickable {
                            managementTarget = userManagementTarget(card.user)
                        },
                    )
                } else {
                    PlayerCardWithActions(
                        player = card.user,
                        currentUser = currentUser,
                        onMessage = { user ->
                            onNavigateToChat(user)
                        },
                        onSendFriendRequest = { user ->
                            playerInteractionComponent.sendFriendRequest(user)
                        },
                        onFollow = { user ->
                            playerInteractionComponent.followUser(user)
                        },
                        onUnfollow = { user ->
                            playerInteractionComponent.unfollowUser(user)
                        },
                        onBlock = { user, leaveSharedChats ->
                            playerInteractionComponent.blockUser(user, leaveSharedChats)
                        },
                        onUnblock = { user ->
                            playerInteractionComponent.unblockUser(user)
                        },
                        onInviteToTeam = if (card.section == ParticipantsSection.FREE_AGENTS && canInviteToTeam) {
                            { user -> component.inviteFreeAgentToTeam(user.id) }
                        } else {
                            null
                        },
                    )
                }
            }
        }
    }

    LazyColumn(
        Modifier
            .background(MaterialTheme.colorScheme.background)
            .fillMaxSize(),
        state = lazyColumnState,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = navPadding,
    ) {
        if (topContentPadding > 0.dp) {
            item(key = "division-pill-spacer") {
                Spacer(modifier = Modifier.height(topContentPadding))
            }
        }
        if (showParticipantsTitle) {
            item(key = "header") {
                Text("Participants", style = MaterialTheme.typography.titleLarge)
            }
        }

        item(key = "section-header") {
            Text(section.label, style = MaterialTheme.typography.titleLarge)
        }

        if (participantCardListState.showLoading && participantCardListState.loadingMessage != null) {
            item(key = "participant-card-loading") {
                Text(
                    participantCardListState.loadingMessage,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (displayedParticipantSlots.isEmpty()) {
            item(key = "participant-card-empty") {
                Text(
                    participantCardListState.emptyMessage,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            items(
                displayedParticipantSlots,
                key = { slot -> "participant-card-wave-slot-${slot.index}" },
            ) { slot ->
                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.TopCenter,
                ) {
                    slot.outgoing?.let { card ->
                        ParticipantWaveCard(
                            card = card,
                            phase = ParticipantCardWavePhase.EXITING,
                            index = slot.index,
                        ) { animatedCard ->
                            ParticipantCardContent(animatedCard)
                        }
                    }
                    slot.incoming?.let { card ->
                        ParticipantWaveCard(
                            card = card,
                            phase = if (slot.transitioning) {
                                ParticipantCardWavePhase.ENTERING
                            } else {
                                ParticipantCardWavePhase.VISIBLE
                            },
                            index = slot.index,
                        ) { animatedCard ->
                            ParticipantCardContent(animatedCard)
                        }
                    }
                }
            }
        }

    }

    if (showTeamDialog && selectedTeamForDialog != null) {
        TeamDetailsDialog(
            team = selectedTeamForDialog,
            currentUser = currentUser,
            knownUsers = teamDialogKnownUsers.values.toList(),
            memberCompliance = teamComplianceSummaries[selectedTeamForDialog.team.id],
            memberComplianceLoading = participantComplianceLoading,
            onDismiss = {
                showTeamDialog = false
                selectedTeam = null
            },
            onPlayerMessage = { user ->
                onNavigateToChat(user)
                showTeamDialog = false
                selectedTeam = null
            },
            onPlayerAction = { user, action ->
                when (action) {
                    PlayerAction.FRIEND_REQUEST -> playerInteractionComponent.sendFriendRequest(user)
                    PlayerAction.FOLLOW -> playerInteractionComponent.followUser(user)
                    PlayerAction.UNFOLLOW -> playerInteractionComponent.unfollowUser(user)
                }
            },
            onBlockPlayer = { user, leaveSharedChats ->
                playerInteractionComponent.blockUser(user, leaveSharedChats)
            },
            onUnblockPlayer = { user ->
                playerInteractionComponent.unblockUser(user)
            },
            isRegistering = startingTeamRegistrationId == selectedTeamForDialog.team.id,
            onRegisterForTeam = { component.startTeamRegistration(selectedTeamForDialog) },
        )
    }

    managementTarget?.let { selectedTarget ->
        val target = when (selectedTarget.cardType) {
            ParticipantCardType.TEAM -> selectedTarget.team?.let(::teamManagementTarget) ?: selectedTarget
            ParticipantCardType.USER -> selectedTarget.user?.let(::userManagementTarget) ?: selectedTarget
        }
        ParticipantManagementDialog(
            target = target,
            fallbackUsers = fallbackComplianceUsersForTarget(target),
            complianceLoading = participantComplianceLoading,
            selectedDivisionId = selectedDivisionId,
            divisionOptions = divisionOptions,
            showManagementActions = !(teamSignup && target.cardType == ParticipantCardType.USER),
            paymentActionInProgress = receivingPaymentTargetId == target.billingContext?.billingTeamId,
            onTeamDivisionSelected = onTeamDivisionSelected,
            onDismiss = { managementTarget = null },
            onRefund = {
                target.billingContext?.let { billingContext ->
                    managementTarget = null
                    loadRefundSnapshot(billingContext)
                }
            },
            onReceivePaymentNow = {
                startReceivePaymentNow(target)
            },
            onSendBill = {
                target.billingContext?.let { billingContext ->
                    managementTarget = null
                    openCreateBillModal(billingContext)
                }
            },
            onRemove = {
                buildRemoveTarget(target)?.let { nextRemoveTarget ->
                    managementTarget = null
                    removeTarget = nextRemoveTarget
                }
            },
        )
    }
    removeTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { removeTarget = null },
            title = { Text(target.title) },
            text = { Text(target.subtitle) },
            confirmButton = {
                Button(
                    onClick = {
                        when (target.cardType) {
                            ParticipantCardType.TEAM -> {
                                target.team?.let(component::removeTeamParticipant)
                            }
                            ParticipantCardType.USER -> {
                                target.userId?.let(component::removeUserParticipant)
                            }
                        }
                        removeTarget = null
                    },
                ) {
                    Text("Remove")
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { removeTarget = null }) {
                    Text("Cancel")
                }
            },
        )
    }

    paymentQrState?.let { qrState ->
        ParticipantPaymentQrDialog(
            state = qrState,
            onDismiss = { paymentQrState = null },
        )
    }

    refundContext?.let { context ->
        AlertDialog(
            onDismissRequest = ::closeRefundModal,
            title = { Text("Refunds • ${context.title}") },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (refundError != null) {
                        Text(
                            text = refundError ?: "",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    if (refundLoading) {
                        Text("Loading billing details...", style = MaterialTheme.typography.bodyMedium)
                    } else if (refundSnapshot == null) {
                        Text("No billing details found.", style = MaterialTheme.typography.bodyMedium)
                    } else {
                        val snapshot = refundSnapshot!!
                        Text(
                            "Paid ${formatCurrency(snapshot.totals.paidAmountCents)} • " +
                                "Refunded ${formatCurrency(snapshot.totals.refundedAmountCents)} • " +
                                "Refundable ${formatCurrency(snapshot.totals.refundableAmountCents)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        HorizontalDivider()
                        LazyColumn(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            items(snapshot.bills, key = { it.id }) { bill ->
                                Column(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Text(
                                        "${bill.ownerType} • ${bill.ownerName}",
                                        style = MaterialTheme.typography.titleSmall,
                                    )
                                    Text(
                                        "Total ${formatCurrency(bill.totalAmountCents)} • " +
                                            "Refundable ${formatCurrency(bill.refundableAmountCents)}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )

                                    bill.payments.forEach { payment ->
                                        val draft = refundAmountDraftByPaymentId[payment.id]
                                            ?: payment.refundableAmountCents.coerceAtLeast(0).toString()
                                        Column(
                                            modifier = Modifier.fillMaxWidth(),
                                            verticalArrangement = Arrangement.spacedBy(4.dp),
                                        ) {
                                            Text(
                                                "Payment #${payment.sequence} • " +
                                                    formatCurrency(payment.amountCents),
                                                style = MaterialTheme.typography.bodyMedium,
                                            )
                                            Text(
                                                "Refundable ${formatCurrency(payment.refundableAmountCents)}",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                            if (payment.isRefundable && !payment.paymentIntentId.isNullOrBlank()) {
                                                Row(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                    verticalAlignment = Alignment.CenterVertically,
                                                ) {
                                                    MoneyInputField(
                                                        value = draft,
                                                        onValueChange = { value ->
                                                            refundAmountDraftByPaymentId =
                                                                refundAmountDraftByPaymentId +
                                                                (payment.id to value.filter(Char::isDigit))
                                                        },
                                                        modifier = Modifier.weight(1f),
                                                        placeholder = "0",
                                                    )
                                                    OutlinedButton(
                                                        enabled = refundingPaymentId == null ||
                                                            refundingPaymentId == payment.id,
                                                        onClick = {
                                                            val amountCents =
                                                                parseCentsInputToCents(
                                                                    refundAmountDraftByPaymentId[payment.id]
                                                                        ?: payment.refundableAmountCents
                                                                            .coerceAtLeast(0)
                                                                            .toString(),
                                                                )
                                                            if (amountCents == null || amountCents <= 0) {
                                                                refundError = "Enter a refund amount greater than $0.00"
                                                                return@OutlinedButton
                                                            }
                                                            refundingPaymentId = payment.id
                                                            refundError = null
                                                            coroutineScope.launch {
                                                                component.refundParticipantPayment(
                                                                    teamId = context.billingTeamId,
                                                                    billPaymentId = payment.id,
                                                                    amountCents = amountCents,
                                                                ).onSuccess {
                                                                    popUpHandler.showPopup("Refund processed.")
                                                                    loadRefundSnapshot(context)
                                                                }.onFailure { throwable ->
                                                                    refundError = throwable.userMessage("Failed to process refund.")
                                                                }
                                                                refundingPaymentId = null
                                                            }
                                                        },
                                                    ) {
                                                        Text("Refund")
                                                    }
                                                }
                                            } else {
                                                Text(
                                                    "This payment does not have refundable balance.",
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                            }
                                        }
                                    }
                                    HorizontalDivider()
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                OutlinedButton(onClick = ::closeRefundModal) {
                    Text("Close")
                }
            },
            dismissButton = {},
        )
    }

    billContext?.let { context ->
        val availableUserOwners = context.userOptions
        val isUserOnlyOwner = !context.allowTeamOwner
        val previewEventAmountCents = (parseCentsInputToCents(createBillAmount) ?: 0).coerceAtLeast(0)
        val previewTaxAmountCents = (parseCentsInputToCents(createBillTax) ?: 0).coerceAtLeast(0)
        val previewTotalAmountCents = previewEventAmountCents + previewTaxAmountCents
        val previewLabel = createBillLabel.trim().ifBlank { "Event registration" }

        AlertDialog(
            onDismissRequest = {
                if (!creatingBill) {
                    billContext = null
                }
            },
            title = { Text("Send Bill • ${context.title}") },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (createBillError != null) {
                        Text(
                            text = createBillError ?: "",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }

                    if (!isUserOnlyOwner) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            OutlinedButton(
                                onClick = {
                                    createBillOwnerType = "TEAM"
                                    createBillOwnerId = context.defaultOwnerId ?: context.billingTeamId
                                },
                                modifier = Modifier.weight(1f),
                            ) {
                                Text(if (createBillOwnerType == "TEAM") "Owner: Team ✓" else "Owner: Team")
                            }
                            OutlinedButton(
                                onClick = {
                                    createBillOwnerType = "USER"
                                    createBillOwnerId = createBillOwnerId
                                        ?.takeIf { selected -> availableUserOwners.any { it.id == selected } }
                                        ?: availableUserOwners.firstOrNull()?.id
                                },
                                modifier = Modifier.weight(1f),
                            ) {
                                Text(if (createBillOwnerType == "USER") "Owner: User ✓" else "Owner: User")
                            }
                        }
                    }

                    if (createBillOwnerType == "USER") {
                        availableUserOwners.forEach { option ->
                            OutlinedButton(
                                onClick = { createBillOwnerId = option.id },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                val selectedMarker = if (createBillOwnerId == option.id) " ✓" else ""
                                Text("${option.displayName}$selectedMarker")
                            }
                        }
                    }

                    MoneyInputField(
                        value = createBillAmount,
                        onValueChange = { value ->
                            createBillAmount = value.filter(Char::isDigit)
                        },
                        modifier = Modifier.fillMaxWidth(),
                        label = "Price",
                        placeholder = "0",
                    )
                    MoneyInputField(
                        value = createBillTax,
                        onValueChange = { value ->
                            createBillTax = value.filter(Char::isDigit)
                        },
                        modifier = Modifier.fillMaxWidth(),
                        label = "Tax",
                        placeholder = "0",
                    )
                    StandardTextField(
                        value = createBillLabel,
                        onValueChange = { createBillLabel = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = "Primary line item label",
                    )

                    if (createBillOwnerType == "TEAM" && context.allowTeamOwner) {
                        OutlinedButton(
                            onClick = {
                                createBillAllowSplit = !createBillAllowSplit
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                if (createBillAllowSplit) {
                                    "Allow split payments ✓"
                                } else {
                                    "Allow split payments"
                                },
                            )
                        }
                    }

                    HorizontalDivider()
                    Text(
                        text = "Price preview",
                        style = MaterialTheme.typography.titleSmall,
                    )
                    BillPreviewRow(
                        label = previewLabel,
                        amount = formatCurrency(previewEventAmountCents),
                    )
                    if (previewTaxAmountCents > 0) {
                        BillPreviewRow(
                            label = "Tax",
                            amount = formatCurrency(previewTaxAmountCents),
                        )
                    }
                    HorizontalDivider()
                    BillPreviewRow(
                        label = "Total",
                        amount = formatCurrency(previewTotalAmountCents),
                        isTotal = true,
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val amountCents = parseCentsInputToCents(createBillAmount)
                        if (amountCents == null || amountCents <= 0) {
                            createBillError = "Enter an amount greater than $0.00"
                            return@Button
                        }
                        val taxCents = parseCentsInputToCents(createBillTax) ?: 0
                        if (taxCents < 0) {
                            createBillError = "Tax cannot be negative"
                            return@Button
                        }

                        val ownerId = if (createBillOwnerType == "TEAM") {
                            context.defaultOwnerId ?: context.billingTeamId
                        } else {
                            createBillOwnerId
                        }
                        if (createBillOwnerType == "USER" && ownerId.isNullOrBlank()) {
                            createBillError = "Select a user to bill"
                            return@Button
                        }

                        creatingBill = true
                        createBillError = null
                        coroutineScope.launch {
                            component.createParticipantBill(
                                teamId = context.billingTeamId,
                                request = EventTeamBillCreateRequest(
                                    ownerType = createBillOwnerType,
                                    ownerId = ownerId,
                                    eventAmountCents = amountCents,
                                    taxAmountCents = taxCents,
                                    allowSplit = createBillOwnerType == "TEAM" && createBillAllowSplit,
                                    label = createBillLabel.trim(),
                                ),
                            ).onSuccess {
                                popUpHandler.showPopup("Bill created successfully.")
                                billContext = null
                            }.onFailure { throwable ->
                                createBillError = throwable.userMessage("Failed to create bill.")
                            }
                            creatingBill = false
                        }
                    },
                    enabled = !creatingBill,
                ) {
                    Text(if (creatingBill) "Creating..." else "Create Bill")
                }
            },
            dismissButton = {
                OutlinedButton(
                    onClick = { billContext = null },
                    enabled = !creatingBill,
                ) {
                    Text("Cancel")
                }
            },
        )
    }
}

@Composable
private fun ParticipantManagementDialog(
    target: ParticipantManagementTarget,
    fallbackUsers: List<EventComplianceUserSummary>,
    complianceLoading: Boolean,
    selectedDivisionId: String?,
    divisionOptions: List<EventDetailDivisionOption>,
    showManagementActions: Boolean,
    paymentActionInProgress: Boolean,
    onTeamDivisionSelected: (TeamWithPlayers, String) -> Unit,
    onDismiss: () -> Unit,
    onRefund: () -> Unit,
    onReceivePaymentNow: () -> Unit,
    onSendBill: () -> Unit,
    onRemove: () -> Unit,
) {
    var expandedUserIds by remember(target.cardType, target.title, target.team?.team?.id, target.user?.id) {
        mutableStateOf<Set<String>>(emptySet())
    }
    val paymentSummary = when (target.cardType) {
        ParticipantCardType.TEAM -> target.teamCompliance?.payment
        ParticipantCardType.USER -> target.userCompliance?.payment
    } ?: EventCompliancePaymentSummary()
    val documentSummary = when (target.cardType) {
        ParticipantCardType.TEAM -> target.teamCompliance?.documents
        ParticipantCardType.USER -> target.userCompliance?.documents
    } ?: EventComplianceDocumentCounts()
    val users = when (target.cardType) {
        ParticipantCardType.TEAM -> target.teamCompliance?.users?.takeIf { users -> users.isNotEmpty() }
        ParticipantCardType.USER -> target.userCompliance?.let(::listOf)
    } ?: fallbackUsers
    val hasComplianceSummary = when (target.cardType) {
        ParticipantCardType.TEAM -> target.teamCompliance != null
        ParticipantCardType.USER -> target.userCompliance != null
    }
    val targetTeam = target.team
    val initialTargetDivisionId = remember(targetTeam?.team?.id, targetTeam?.team?.division, divisionOptions, selectedDivisionId) {
        targetTeam?.resolveParticipantDivisionId(
            divisionOptions = divisionOptions,
            fallbackDivisionId = selectedDivisionId,
        )
    }
    var dialogDivisionId by remember(targetTeam?.team?.id, initialTargetDivisionId) {
        mutableStateOf(initialTargetDivisionId)
    }
    val showDivisionSelector = target.cardType == ParticipantCardType.TEAM &&
        divisionOptions.size > 1

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(target.title)
                if (showDivisionSelector && targetTeam != null) {
                    ParticipantDivisionDropdown(
                        selectedDivisionId = dialogDivisionId,
                        divisionOptions = divisionOptions,
                        onDivisionSelected = { divisionId ->
                            dialogDivisionId = divisionId
                            onTeamDivisionSelected(targetTeam, divisionId)
                        },
                    )
                }
            }
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth().heightIn(max = 460.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (complianceLoading && !hasComplianceSummary) {
                    Text(
                        text = "Loading registration details...",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    ComplianceSummaryCard(
                        title = "Payment",
                        value = paymentSummary.paymentStatusText(target.cardType),
                        needsAttention = paymentSummary.needsAttention(),
                        modifier = Modifier.weight(1f),
                    )
                    ComplianceSummaryCard(
                        title = "Required signatures",
                        value = documentSummary.documentStatusText(),
                        needsAttention = documentSummary.needsAttention(),
                        modifier = Modifier.weight(1f),
                    )
                }

                if (users.isEmpty()) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        ),
                    ) {
                        Text(
                            text = if (target.cardType == ParticipantCardType.TEAM) {
                                "No users were found on this team."
                            } else {
                                "Participant details are not available yet."
                            },
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(users, key = { user -> user.userId }) { userSummary ->
                            val expanded = expandedUserIds.contains(userSummary.userId)
                            ComplianceUserCard(
                                userSummary = userSummary,
                                cardType = target.cardType,
                                expanded = expanded,
                                onClick = {
                                    expandedUserIds = if (expanded) {
                                        expandedUserIds - userSummary.userId
                                    } else {
                                        expandedUserIds + userSummary.userId
                                    }
                                },
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            if (showManagementActions) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedButton(
                            onClick = onRefund,
                            enabled = target.billingContext != null,
                            modifier = Modifier.weight(1f),
                        ) {
                            Text("Refund")
                        }
                        ParticipantPaymentsMenuButton(
                            enabled = target.billingContext != null && !paymentActionInProgress,
                            paymentActionInProgress = paymentActionInProgress,
                            onReceivePaymentNow = onReceivePaymentNow,
                            onSendBill = onSendBill,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Button(
                        onClick = onRemove,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error,
                            contentColor = MaterialTheme.colorScheme.onError,
                        ),
                    ) {
                        Text("Remove")
                    }
                }
            } else {
                OutlinedButton(onClick = onDismiss) {
                    Text("Close")
                }
            }
        },
        dismissButton = {},
    )
}

@Composable
private fun ParticipantPaymentsMenuButton(
    enabled: Boolean,
    paymentActionInProgress: Boolean,
    onReceivePaymentNow: () -> Unit,
    onSendBill: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }

    Box(modifier = modifier) {
        OutlinedButton(
            onClick = { expanded = true },
            enabled = enabled,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (paymentActionInProgress) "Preparing..." else "Payments")
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            DropdownMenuItem(
                text = { Text("Receive payment now") },
                onClick = {
                    expanded = false
                    onReceivePaymentNow()
                },
            )
            DropdownMenuItem(
                text = { Text("Send bill") },
                onClick = {
                    expanded = false
                    onSendBill()
                },
            )
        }
    }
}

@Composable
private fun ParticipantPaymentQrDialog(
    state: ParticipantPaymentQrState,
    onDismiss: () -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    val checkout = state.checkout

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Payment QR • ${state.title}") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = "Amount ${formatCurrency(checkout.amountCents)}",
                    style = MaterialTheme.typography.titleSmall,
                )
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                    ),
                ) {
                    AsyncImage(
                        model = checkout.qrCodeUrl,
                        contentDescription = "Payment QR code",
                        modifier = Modifier
                            .padding(12.dp)
                            .size(220.dp),
                        contentScale = ContentScale.Fit,
                    )
                }
                Text(
                    text = checkout.checkoutUrl,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    runCatching { uriHandler.openUri(checkout.checkoutUrl) }
                },
            ) {
                Text("Open link")
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onDismiss) {
                Text("Close")
            }
        },
    )
}

@Composable
private fun ParticipantDivisionDropdown(
    selectedDivisionId: String?,
    divisionOptions: List<EventDetailDivisionOption>,
    onDivisionSelected: (String) -> Unit,
) {
    val resolvedDivisionId = divisionOptions.resolveSelectedEventDivisionId(selectedDivisionId)
    val selectedLabel = divisionOptions
        .firstOrNull { option -> option.id == resolvedDivisionId }
        ?.label
        .orEmpty()

    DropdownField(
        modifier = Modifier.fillMaxWidth(),
        value = selectedLabel,
        label = "Division",
    ) { dismiss ->
        divisionOptions.forEach { option ->
            DropdownMenuItem(
                text = { Text(option.label) },
                onClick = {
                    dismiss()
                    onDivisionSelected(option.id)
                },
                leadingIcon = {
                    if (option.id == resolvedDivisionId) {
                        Icon(
                            imageVector = Icons.Default.Check,
                            contentDescription = null,
                        )
                    }
                },
            )
        }
    }
}

@Composable
private fun ComplianceSummaryCard(
    title: String,
    value: String,
    needsAttention: Boolean,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodySmall,
                color = if (needsAttention) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
            )
        }
    }
}

@Composable
private fun ComplianceUserCard(
    userSummary: EventComplianceUserSummary,
    cardType: ParticipantCardType,
    expanded: Boolean,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = userSummary.fullName,
                        style = MaterialTheme.typography.titleSmall,
                    )
                    userSummary.userName?.let { userName ->
                        Text(
                            text = "@$userName",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        text = userSummary.registrationLabel(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    text = if (expanded) "Hide" else "Details",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }

            if (expanded) {
                HorizontalDivider()
                ComplianceDetailSection(
                    title = "Bills",
                    value = userSummary.payment.paymentStatusText(cardType),
                    needsAttention = userSummary.payment.needsAttention(),
                )
                ComplianceDetailSection(
                    title = "Documents",
                    value = userSummary.documents.documentStatusText(),
                    needsAttention = userSummary.documents.needsAttention(),
                )
                if (userSummary.requiredDocuments.isEmpty()) {
                    Text(
                        text = "No required documents for this user.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    userSummary.requiredDocuments.forEach { document ->
                        ComplianceDocumentRow(document)
                    }
                }
            }
        }
    }
}

@Composable
private fun ComplianceDetailSection(
    title: String,
    value: String,
    needsAttention: Boolean,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = if (needsAttention) {
                MaterialTheme.colorScheme.error
            } else {
                MaterialTheme.colorScheme.onSurface
            },
        )
    }
}

@Composable
private fun ComplianceDocumentRow(document: EventComplianceRequiredDocument) {
    val signed = document.status.equals("SIGNED", ignoreCase = true) ||
        document.status.equals("COMPLETED", ignoreCase = true)
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = document.title,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Text(
                        text = "${document.signerLabel} | " +
                            (if (document.signOnce) "Sign once" else "Event-specific"),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    text = if (signed) "Signed" else "Needs signature",
                    style = MaterialTheme.typography.labelMedium,
                    color = if (signed) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.error
                    },
                )
            }
            document.signedAt?.let { signedAt ->
                Text(
                    text = signedAt,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun formatCurrency(amountCents: Int): String = "$${centsToAmountText(amountCents)}"

private fun centsToAmountText(amountCents: Int): String {
    val dollars = amountCents / 100.0
    val rounded = round(dollars * 100) / 100
    val wholePart = rounded.toInt()
    val decimalPart = ((rounded - wholePart) * 100).toInt()
    return if (decimalPart == 0) {
        "$wholePart.00"
    } else if (decimalPart < 10) {
        "$wholePart.0$decimalPart"
    } else {
        "$wholePart.$decimalPart"
    }
}

private fun parseCentsInputToCents(value: String): Int? {
    return value.filter(Char::isDigit).toIntOrNull()
}

@Composable
private fun BillPreviewRow(
    label: String,
    amount: String,
    isTotal: Boolean = false,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = if (isTotal) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium,
        )
        Text(
            text = amount,
            style = if (isTotal) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium,
        )
    }
}
