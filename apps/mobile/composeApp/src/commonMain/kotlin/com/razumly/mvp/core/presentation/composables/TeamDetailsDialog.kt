package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.razumly.mvp.core.data.dataTypes.TeamStaffAssignment
import com.razumly.mvp.core.data.dataTypes.BillDiscountSummary
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.activePlayerRegistrations
import com.razumly.mvp.core.data.dataTypes.countsTowardTeamCapacity
import com.razumly.mvp.core.data.dataTypes.isActive
import com.razumly.mvp.core.data.dataTypes.isPaymentPending
import com.razumly.mvp.core.data.dataTypes.isStarted
import com.razumly.mvp.core.data.dataTypes.normalizedRole
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.data.repositories.EventComplianceDocumentCounts
import com.razumly.mvp.core.data.repositories.EventCompliancePaymentSummary
import com.razumly.mvp.core.data.repositories.EventComplianceRequiredDocument
import com.razumly.mvp.core.data.repositories.EventComplianceUserSummary
import com.razumly.mvp.core.data.repositories.EventTeamComplianceSummary
import com.razumly.mvp.core.data.repositories.RegistrationQuestionAnswerSummary
import com.razumly.mvp.core.presentation.util.MoneyInputUtils

internal fun canRegisterForTeam(
    openRegistration: Boolean,
    joinPolicy: String = if (openRegistration) "OPEN_REGISTRATION" else "CLOSED",
    isCurrentUserActive: Boolean,
    isCurrentUserPending: Boolean,
    teamHasCapacity: Boolean,
    hasRegisterAction: Boolean,
): Boolean {
    return hasRegisterAction &&
        !isCurrentUserActive &&
        (isCurrentUserPending || ((openRegistration || joinPolicy.isRequestToJoinPolicy()) && teamHasCapacity))
}

internal fun shouldShowTeamRegistrationButton(
    openRegistration: Boolean,
    joinPolicy: String = if (openRegistration) "OPEN_REGISTRATION" else "CLOSED",
    isCurrentUserActive: Boolean,
    isCurrentUserPending: Boolean,
): Boolean {
    return !isCurrentUserActive && (openRegistration || joinPolicy.isRequestToJoinPolicy() || isCurrentUserPending)
}

internal fun teamRegistrationButtonLabel(
    isRegistering: Boolean,
    isCurrentUserPending: Boolean,
    teamHasCapacity: Boolean,
    registrationPriceCents: Int,
    joinPolicy: String = "OPEN_REGISTRATION",
): String {
    return when {
        isRegistering -> "Registering..."
        isCurrentUserPending -> "Resume Payment"
        !teamHasCapacity -> "Team Full"
        joinPolicy.isRequestToJoinPolicy() -> "Request to join"
        registrationPriceCents > 0 -> "Join for $${MoneyInputUtils.centsToDisplayValue(registrationPriceCents)}"
        else -> "Join Team"
    }
}

private fun String?.isRequestToJoinPolicy(): Boolean =
    equals("REQUEST_TO_JOIN", ignoreCase = true)

@Composable
fun TeamDetailsDialog(
    team: TeamWithPlayers,
    currentUser: UserData,
    knownUsers: List<UserData> = emptyList(),
    onDismiss: () -> Unit,
    onPlayerMessage: (UserData) -> Unit,
    onPlayerAction: (UserData, PlayerAction) -> Unit = { _, _ -> },
    onBlockPlayer: (UserData, Boolean) -> Unit = { _, _ -> },
    onUnblockPlayer: (UserData) -> Unit = {},
    isRegistering: Boolean = false,
    isLeaving: Boolean = false,
    memberCompliance: EventTeamComplianceSummary? = null,
    memberComplianceLoading: Boolean = false,
    onRegisterForTeam: (() -> Unit)? = null,
    onLeaveTeam: (() -> Unit)? = null,
) {
    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier.padding(24.dp)
            ) {
                val syncedTeam = team.team.withSynchronizedMembership()
                val knownUsersById = (knownUsers + team.players + team.pendingPlayers + listOfNotNull(team.captain, currentUser))
                    .associateBy { it.id }
                val activePlayerRegistrationsByUserId = syncedTeam
                    .activePlayerRegistrations()
                    .associateBy(TeamPlayerRegistration::userId)
                val currentUserRegistration = syncedTeam.playerRegistrations
                    .firstOrNull { registration -> registration.userId == currentUser.id }
                val isCurrentUserPaymentPending = currentUserRegistration?.isPaymentPending() == true
                val isCurrentUserActive = currentUserRegistration?.isActive() == true ||
                    (syncedTeam.playerIds.contains(currentUser.id) && !isCurrentUserPaymentPending)
                val isCurrentUserJoined = isCurrentUserActive || isCurrentUserPaymentPending
                val isCurrentUserPending = currentUserRegistration?.isStarted() == true
                val reservedOrActiveCount = syncedTeam.playerRegistrations
                    .filter(TeamPlayerRegistration::countsTowardTeamCapacity)
                    .map(TeamPlayerRegistration::userId)
                    .filter(String::isNotBlank)
                    .toSet()
                    .size
                    .coerceAtLeast((syncedTeam.playerIds + syncedTeam.pending).filter(String::isNotBlank).toSet().size)
                val teamHasCapacity = syncedTeam.teamSize <= 0 || reservedOrActiveCount < syncedTeam.teamSize
                val canRegister = canRegisterForTeam(
                    openRegistration = syncedTeam.openRegistration,
                    joinPolicy = syncedTeam.joinPolicy,
                    isCurrentUserActive = isCurrentUserJoined,
                    isCurrentUserPending = isCurrentUserPending,
                    teamHasCapacity = teamHasCapacity,
                    hasRegisterAction = onRegisterForTeam != null,
                )
                val activeStaffAssignments = syncedTeam.staffAssignments
                    .filter(TeamStaffAssignment::isActive)
                    .sortedWith(
                        compareBy<TeamStaffAssignment> { assignment ->
                            when (assignment.normalizedRole()) {
                                "MANAGER" -> 0
                                "HEAD_COACH" -> 1
                                else -> 2
                            }
                        }.thenBy(TeamStaffAssignment::userId),
                    )
                var expandedComplianceUserIds by remember(team.team.id, memberCompliance) {
                    mutableStateOf<Set<String>>(emptySet())
                }
                val complianceByUserId = memberCompliance
                    ?.users
                    ?.associateBy(EventComplianceUserSummary::userId)
                    .orEmpty()

                // Team Header
                Text(
                    text = team.team.name.ifBlank { "Team ${
                        team.players.joinToString(" & ") {
                            val firstName = it.firstName.trim().ifBlank { "Player" }
                            val lastInitial = it.lastName.trim().firstOrNull()?.let { initial -> "$initial." }.orEmpty()
                            "$firstName $lastInitial".trim()
                        }
                    }" },
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )

                Text(
                    text = "${team.players.size}/${team.team.teamSize} Players",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (isCurrentUserPaymentPending) {
                    Text(
                        text = "Payment pending",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                if (activeStaffAssignments.isNotEmpty()) {
                    Text(
                        text = "Team Staff",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    activeStaffAssignments.forEach { assignment ->
                        val staffUser = knownUsersById[assignment.userId]
                        val roleLabel = when (assignment.normalizedRole()) {
                            "MANAGER" -> "Manager"
                            "HEAD_COACH" -> "Head Coach"
                            else -> "Assistant Coach"
                        }
                        if (staffUser != null) {
                            UnifiedCard(
                                entity = staffUser,
                                subtitle = roleLabel,
                                modifier = Modifier.fillMaxWidth()
                            )
                        } else {
                            Text(
                                text = roleLabel,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                }

                // Players List
                Text(
                    text = "Team Members",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                if (memberComplianceLoading) {
                    Text(
                        text = "Loading billing and document status...",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(team.players) { player ->
                        val playerRegistration = activePlayerRegistrationsByUserId[player.id]
                        val compliance = complianceByUserId[player.id]
                        val expanded = expandedComplianceUserIds.contains(player.id)
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            PlayerCardWithActions(
                                player = player,
                                currentUser = currentUser,
                                onMessage = { user -> onPlayerMessage(user) },
                                onSendFriendRequest = { user ->
                                    onPlayerAction(
                                        user,
                                        PlayerAction.FRIEND_REQUEST
                                    )
                                },
                                onFollow = { user -> onPlayerAction(user, PlayerAction.FOLLOW) },
                                onUnfollow = { user -> onPlayerAction(user, PlayerAction.UNFOLLOW) },
                                onBlock = onBlockPlayer,
                                onUnblock = onUnblockPlayer,
                                jerseyNumber = playerRegistration?.jerseyNumber,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = compliance != null) {
                                        expandedComplianceUserIds = if (expanded) {
                                            expandedComplianceUserIds - player.id
                                        } else {
                                            expandedComplianceUserIds + player.id
                                        }
                                    }
                            )
                            if (compliance != null) {
                                TeamMemberComplianceStrip(
                                    userSummary = compliance,
                                    expanded = expanded,
                                    onClick = {
                                        expandedComplianceUserIds = if (expanded) {
                                            expandedComplianceUserIds - player.id
                                        } else {
                                            expandedComplianceUserIds + player.id
                                        }
                                    },
                                )
                            }
                        }
                    }

                    // Show pending players if any
                    if (team.pendingPlayers.isNotEmpty()) {
                        item {
                            Text(
                                text = "Pending Invitations",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(top = 8.dp)
                            )
                        }

                        items(team.pendingPlayers) { player ->
                            PlayerCard(
                                player = player,
                                isPending = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Actions
                if (onRegisterForTeam != null || onLeaveTeam != null) {
                    if (isCurrentUserActive && onLeaveTeam != null) {
                        Button(
                            onClick = onLeaveTeam,
                            enabled = !isLeaving,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(if (isLeaving) "Leaving..." else "Leave Team")
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                    } else if (
                        shouldShowTeamRegistrationButton(
                            openRegistration = syncedTeam.openRegistration,
                            joinPolicy = syncedTeam.joinPolicy,
                            isCurrentUserActive = isCurrentUserJoined,
                            isCurrentUserPending = isCurrentUserPending,
                        )
                    ) {
                        Button(
                            onClick = { onRegisterForTeam?.invoke() },
                            enabled = canRegister && !isRegistering,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                teamRegistrationButtonLabel(
                                    isRegistering = isRegistering,
                                    isCurrentUserPending = isCurrentUserPending,
                                    teamHasCapacity = teamHasCapacity,
                                    registrationPriceCents = syncedTeam.registrationPriceCents.coerceAtLeast(0),
                                    joinPolicy = syncedTeam.joinPolicy,
                                )
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    OutlinedButton(
                        onClick = onDismiss
                    ) {
                        Text("Close")
                    }
                }
            }
        }
    }
}

private fun EventCompliancePaymentSummary.paymentStatusText(): String {
    return when {
        paymentPending -> "Payment pending"
        !hasBill -> "No bill yet"
        isPaidInFull -> paidInFullSummary()
        else -> paymentAmountBreakdown()
    }
}

private fun EventCompliancePaymentSummary.paymentAmountBreakdown(): String {
    if (discountAmountCents > 0) {
        return listOf(
            "Original ${formatCents(originalAmountCents)}",
            "${discountLabel(discounts)} -${formatCents(discountAmountCents)}",
            "Paid ${formatCents(paidAmountCents)}",
        ).joinToString(" • ")
    }
    return "${formatCents(paidAmountCents)} of ${formatCents(discountedAmountCents)} paid"
}

private fun EventCompliancePaymentSummary.paidInFullSummary(): String {
    return if (discountAmountCents > 0) {
        "Paid in full • ${paymentAmountBreakdown()}"
    } else {
        "Paid in full • ${formatCents(discountedAmountCents)}"
    }
}

private fun discountLabel(discounts: List<BillDiscountSummary>): String {
    val primary = discounts.firstOrNull { discount -> discount.code.isNotBlank() }
        ?: discounts.firstOrNull { discount -> !discount.name.isNullOrBlank() }
    val code = primary?.code?.trim().orEmpty()
    val name = primary?.name?.trim().orEmpty()
    return when {
        code.isNotBlank() -> "Discount $code"
        name.isNotBlank() -> "Discount $name"
        discounts.size > 1 -> "Discounts"
        else -> "Discount"
    }
}

private fun formatCents(cents: Int): String = "$${MoneyInputUtils.centsToDisplayValue(cents)}"

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
private fun TeamMemberComplianceStrip(
    userSummary: EventComplianceUserSummary,
    expanded: Boolean,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = userSummary.payment.paymentStatusText(),
                        style = MaterialTheme.typography.bodySmall,
                        color = if (userSummary.payment.needsAttention()) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                    )
                    Text(
                        text = userSummary.documents.documentStatusText(),
                        style = MaterialTheme.typography.bodySmall,
                        color = if (userSummary.documents.needsAttention()) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
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
                if (userSummary.registrationAnswers.isNotEmpty()) {
                    RegistrationAnswersSection(userSummary.registrationAnswers)
                    HorizontalDivider()
                }
                if (userSummary.requiredDocuments.isEmpty()) {
                    Text(
                        text = "No required documents for this user.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    userSummary.requiredDocuments.forEach { document ->
                        TeamMemberComplianceDocumentRow(document)
                    }
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
                        fontWeight = FontWeight.SemiBold,
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
private fun TeamMemberComplianceDocumentRow(document: EventComplianceRequiredDocument) {
    val signed = document.status.equals("SIGNED", ignoreCase = true) ||
        document.status.equals("COMPLETED", ignoreCase = true)
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = document.title, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        text = document.signerLabel,
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
}

enum class PlayerAction {
    FRIEND_REQUEST,
    FOLLOW,
    UNFOLLOW,
}
