package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.util.isPlaceholderSlot
import com.razumly.mvp.core.data.repositories.EventTeamBillCreateRequest
import com.razumly.mvp.core.data.repositories.EventTeamBillingSnapshot
import com.razumly.mvp.core.data.repositories.EventTeamBillingUserOption
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.PlayerInteractionComponent
import com.razumly.mvp.core.presentation.composables.MoneyInputField
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.composables.PlayerAction
import com.razumly.mvp.core.presentation.composables.PlayerCardWithActions
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.presentation.composables.TeamDetailsDialog
import com.razumly.mvp.core.presentation.util.getScreenWidth
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventDetail.LocalTournamentComponent
import kotlin.math.round
import kotlinx.coroutines.launch
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

private const val MOBILE_BREAKPOINT_DP = 600

enum class ParticipantsSection(val label: String) {
    TEAMS("Teams"),
    PARTICIPANTS("Participants"),
    FREE_AGENTS("Free Agents"),
}

private enum class ParticipantCardType {
    TEAM,
    USER,
}

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

@Composable
fun ParticipantsView(
    showFab: (Boolean) -> Unit,
    section: ParticipantsSection = ParticipantsSection.TEAMS,
    onNavigateToChat: (UserData) -> Unit,
    manageMode: Boolean = false,
    canManageParticipants: Boolean = false,
) {
    val component = LocalTournamentComponent.current
    val divisionTeams by component.divisionTeams.collectAsState()
    val selectedEvent by component.eventWithRelations.collectAsState()
    val currentUser by component.currentUser.collectAsState()
    val participants = selectedEvent.players
    val teamSignup = selectedEvent.event.teamSignup
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
    val participantUsers = remember(selectedEvent.players, selectedEvent.teams, freeAgentUsers) {
        val teamPlayers = selectedEvent.teams.flatMap { team -> team.players }
        (teamPlayers + selectedEvent.players + freeAgentUsers).distinctBy(UserData::id)
    }
    val participantsTeamsByUserId = remember(selectedEvent.teams) {
        mutableMapOf<String, TeamWithPlayers>().apply {
            selectedEvent.teams.forEach { teamWithPlayers: TeamWithPlayers ->
                val team = teamWithPlayers.team
                val memberIds = buildSet {
                    addAll(team.playerIds)
                    add(team.captainId)
                    team.managerId?.let { add(it) }
                    team.headCoachId?.let { add(it) }
                    addAll(team.coachIds)
                }.map(String::trim).filter(String::isNotBlank)

                memberIds.forEach { memberId ->
                    if (!containsKey(memberId)) {
                        this[memberId] = teamWithPlayers
                    }
                }
            }
        }.toMap()
    }
    val canInviteToTeam = remember(selectedEvent.teams, currentUser.id) {
        selectedEvent.teams.any { teamWithPlayers ->
            teamWithPlayers.team.captainId == currentUser.id ||
                teamWithPlayers.team.managerId == currentUser.id
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
    var createBillAmount by remember { mutableStateOf("0.00") }
    var createBillTax by remember { mutableStateOf("0.00") }
    var createBillAllowSplit by remember { mutableStateOf(false) }
    var createBillLabel by remember { mutableStateOf("Event registration") }

    val playerInteractionComponent = remember {
        getKoin().get<PlayerInteractionComponent> { parametersOf(component) }
    }

    LaunchedEffect(Unit) {
        playerInteractionComponent.setLoadingHandler(loadingHandler)
        playerInteractionComponent.errorState.collect { error ->
            if (error != null) {
                popUpHandler.showPopup(error)
            }
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
        val uniqueIds = buildSet {
            addAll(team.team.playerIds)
            add(team.team.captainId)
            team.team.managerId?.let { add(it) }
            team.team.headCoachId?.let { add(it) }
            addAll(team.team.coachIds)
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
        val teamName = team.team.name?.trim().takeUnless { it.isNullOrBlank() } ?: "Team"
        val users = resolveTeamUsers(team)
        return ParticipantBillingContext(
            billingTeamId = team.team.id,
            title = teamName,
            userOptions = users,
            allowTeamOwner = true,
            defaultOwnerType = "TEAM",
            defaultOwnerId = team.team.id,
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
                            payment.id to centsToAmountText(payment.refundableAmountCents)
                        }
                }
                .onFailure { throwable ->
                    refundError = throwable.message ?: "Failed to load billing details."
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
        createBillAmount = "0.00"
        createBillTax = "0.00"
        createBillAllowSplit = false
        createBillLabel = "Event registration"
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
        if (showParticipantsTitle) {
            item(key = "header") {
                Text("Participants", style = MaterialTheme.typography.titleLarge)
            }
        }

        item(key = "section-header") {
            Text(section.label, style = MaterialTheme.typography.titleLarge)
        }

        when (section) {
            ParticipantsSection.TEAMS -> {
                if (!teamSignup || divisionTeams.isEmpty()) {
                    item(key = "teams-empty") {
                        Text(
                            "No teams yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    items(
                        divisionTeams.values.toList(),
                        key = { it.team.id },
                    ) { team ->
                        val isPlaceholderTeam = team.team.isPlaceholderSlot(selectedEvent.event.eventType)
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            TeamCard(
                                team = team,
                                modifier = Modifier.clickable {
                                    selectedTeam = team
                                    showTeamDialog = true
                                },
                            )
                            if (manageMode && canManageParticipants && !isPlaceholderTeam) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    OutlinedButton(
                                        onClick = {
                                            loadRefundSnapshot(buildTeamBillingContext(team))
                                        },
                                        modifier = Modifier.weight(1f),
                                    ) {
                                        Text("Refund")
                                    }
                                    OutlinedButton(
                                        onClick = {
                                            openCreateBillModal(buildTeamBillingContext(team))
                                        },
                                        modifier = Modifier.weight(1f),
                                    ) {
                                        Text("Send Bill")
                                    }
                                    OutlinedButton(
                                        onClick = {
                                            removeTarget = ParticipantRemoveTarget(
                                                cardType = ParticipantCardType.TEAM,
                                                title = team.team.name ?: "Remove team",
                                                subtitle = "Remove this team from participants?",
                                                team = team,
                                            )
                                        },
                                        modifier = Modifier.weight(1f),
                                    ) {
                                        Text("Remove")
                                    }
                                }
                            }
                        }
                    }
                }
            }

            ParticipantsSection.FREE_AGENTS -> {
                if (!teamSignup || freeAgentUsers.isEmpty()) {
                    item(key = "free-agents-empty") {
                        Text(
                            "No free agents yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    items(freeAgentUsers, key = { it.id }) { freeAgent ->
                        PlayerCardWithActions(
                            player = freeAgent,
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
                            onInviteToTeam = if (canInviteToTeam) {
                                { user -> component.inviteFreeAgentToTeam(user.id) }
                            } else {
                                null
                            }
                        )
                    }
                }
            }

            ParticipantsSection.PARTICIPANTS -> {
                val visibleParticipants = if (teamSignup) {
                    participantUsers
                } else {
                    participantUsersFromEvent.ifEmpty { participants }
                }
                if (visibleParticipants.isEmpty()) {
                    item(key = "participants-empty") {
                        Text(
                            "No participants yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    items(visibleParticipants, key = { it.id }) { participant ->
                        val billingContext = buildUserBillingContext(participant)
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            PlayerCardWithActions(
                                player = participant,
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
                                }
                            )
                            if (manageMode && canManageParticipants) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    OutlinedButton(
                                        onClick = { billingContext?.let(::loadRefundSnapshot) },
                                        enabled = billingContext != null,
                                        modifier = Modifier.weight(1f),
                                    ) {
                                        Text("Refund")
                                    }
                                    OutlinedButton(
                                        onClick = { billingContext?.let(::openCreateBillModal) },
                                        enabled = billingContext != null,
                                        modifier = Modifier.weight(1f),
                                    ) {
                                        Text("Send Bill")
                                    }
                                    OutlinedButton(
                                        onClick = {
                                            removeTarget = ParticipantRemoveTarget(
                                                cardType = ParticipantCardType.USER,
                                                title = toDisplayName(participant),
                                                subtitle = "Remove this participant from the event?",
                                                userId = participant.id,
                                            )
                                        },
                                        modifier = Modifier.weight(1f),
                                    ) {
                                        Text("Remove")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

    }

    if (showTeamDialog && selectedTeam != null) {
        TeamDetailsDialog(
            team = selectedTeam!!,
            currentUser = currentUser,
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
            }
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
                                            ?: centsToAmountText(payment.refundableAmountCents)
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
                                                    PlatformTextField(
                                                        value = draft,
                                                        onValueChange = { value ->
                                                            refundAmountDraftByPaymentId =
                                                                refundAmountDraftByPaymentId + (payment.id to value)
                                                        },
                                                        modifier = Modifier.weight(1f),
                                                        placeholder = "0.00",
                                                    )
                                                    OutlinedButton(
                                                        enabled = refundingPaymentId == null ||
                                                            refundingPaymentId == payment.id,
                                                        onClick = {
                                                            val amountCents =
                                                                parseCurrencyTextToCents(
                                                                    refundAmountDraftByPaymentId[payment.id]
                                                                        ?: centsToAmountText(
                                                                            payment.refundableAmountCents,
                                                                        ),
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
                                                                    refundError = throwable.message
                                                                        ?: "Failed to process refund."
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
        val previewEventAmountCents = (parseCurrencyTextToCents(createBillAmount) ?: 0).coerceAtLeast(0)
        val previewTaxAmountCents = (parseCurrencyTextToCents(createBillTax) ?: 0).coerceAtLeast(0)
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
                                    createBillOwnerId = context.billingTeamId
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
                        onValueChange = { createBillAmount = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = "Price",
                        placeholder = "0.00",
                    )
                    MoneyInputField(
                        value = createBillTax,
                        onValueChange = { createBillTax = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = "Tax",
                        placeholder = "0.00",
                    )
                    PlatformTextField(
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
                        val amountCents = parseCurrencyTextToCents(createBillAmount)
                        if (amountCents == null || amountCents <= 0) {
                            createBillError = "Enter an amount greater than $0.00"
                            return@Button
                        }
                        val taxCents = parseCurrencyTextToCents(createBillTax) ?: 0
                        if (taxCents < 0) {
                            createBillError = "Tax cannot be negative"
                            return@Button
                        }

                        val ownerId = if (createBillOwnerType == "TEAM") {
                            context.billingTeamId
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
                                createBillError = throwable.message ?: "Failed to create bill."
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

private fun parseCurrencyTextToCents(value: String): Int? {
    val numeric = value.trim().replace("$", "").takeIf(String::isNotBlank)?.toDoubleOrNull() ?: return null
    if (!numeric.isFinite()) return null
    return round(numeric * 100).toInt()
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
