package com.razumly.mvp.core.presentation.composables

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.razumly.mvp.core.data.dataTypes.TeamStaffAssignment
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.activePlayerRegistrations
import com.razumly.mvp.core.data.dataTypes.countsTowardTeamCapacity
import com.razumly.mvp.core.data.dataTypes.isActive
import com.razumly.mvp.core.data.dataTypes.isStarted
import com.razumly.mvp.core.data.dataTypes.normalizedRole
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.presentation.util.MoneyInputUtils

internal fun canRegisterForTeam(
    openRegistration: Boolean,
    isCurrentUserActive: Boolean,
    isCurrentUserPending: Boolean,
    teamHasCapacity: Boolean,
    hasRegisterAction: Boolean,
): Boolean {
    return hasRegisterAction &&
        !isCurrentUserActive &&
        (isCurrentUserPending || (openRegistration && teamHasCapacity))
}

internal fun shouldShowTeamRegistrationButton(
    openRegistration: Boolean,
    isCurrentUserActive: Boolean,
    isCurrentUserPending: Boolean,
): Boolean {
    return !isCurrentUserActive && (openRegistration || isCurrentUserPending)
}

internal fun teamRegistrationButtonLabel(
    isRegistering: Boolean,
    isCurrentUserPending: Boolean,
    teamHasCapacity: Boolean,
    registrationPriceCents: Int,
): String {
    return when {
        isRegistering -> "Registering..."
        isCurrentUserPending -> "Resume Payment"
        !teamHasCapacity -> "Team Full"
        registrationPriceCents > 0 -> "Join for $${MoneyInputUtils.centsToDisplayValue(registrationPriceCents)}"
        else -> "Join Team"
    }
}

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
                val isCurrentUserActive = currentUserRegistration?.isActive() == true ||
                    syncedTeam.playerIds.contains(currentUser.id)
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
                    isCurrentUserActive = isCurrentUserActive,
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

                Spacer(modifier = Modifier.height(8.dp))

                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(team.players) { player ->
                        val playerRegistration = activePlayerRegistrationsByUserId[player.id]
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
                            modifier = Modifier.fillMaxWidth()
                        )
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
                            isCurrentUserActive = isCurrentUserActive,
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

enum class PlayerAction {
    FRIEND_REQUEST,
    FOLLOW,
    UNFOLLOW,
}
