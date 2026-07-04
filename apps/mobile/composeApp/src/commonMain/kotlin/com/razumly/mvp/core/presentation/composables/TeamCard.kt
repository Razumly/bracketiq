package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.activeStaffAssignments
import com.razumly.mvp.core.data.dataTypes.normalizedRole
import com.razumly.mvp.core.data.dataTypes.teamCapacityPlayerCount
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership

@Composable
fun TeamCard(
    team: TeamWithPlayers,
    modifier: Modifier = Modifier,
    showPlayerCount: Boolean = true,
) {
    val syncedTeam = team.team.withSynchronizedMembership()
    val rosterSlotCount = syncedTeam.teamCapacityPlayerCount()
    val managerId = syncedTeam.activeStaffAssignments()
        .firstOrNull { assignment -> assignment.normalizedRole() == "MANAGER" }
        ?.userId
        ?: syncedTeam.managerId
        ?: syncedTeam.captainId
    val knownUsers = listOfNotNull(team.captain) + team.players + team.pendingPlayers
    val managerName = knownUsers
        .firstOrNull { user -> user.id == managerId }
        ?.displayName
    UnifiedCard(
        entity = syncedTeam,
        subtitle = teamCardSubtitle(
            managerName = managerName,
            rosterSlotCount = rosterSlotCount,
            teamSize = syncedTeam.teamSize,
            showPlayerCount = showPlayerCount,
        ),
        modifier = modifier
    )
}

internal fun teamCardSubtitle(
    managerName: String?,
    rosterSlotCount: Int,
    teamSize: Int,
    showPlayerCount: Boolean,
): String {
    val managerLabel = "Manager: ${managerName ?: "Unknown"}"
    return if (showPlayerCount) {
        "$managerLabel | $rosterSlotCount/$teamSize players"
    } else {
        managerLabel
    }
}
