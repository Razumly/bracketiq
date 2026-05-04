package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.teamCapacityPlayerCount
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership

@Composable
fun TeamCard(team: TeamWithPlayers, modifier: Modifier = Modifier) {
    val syncedTeam = team.team.withSynchronizedMembership()
    val rosterSlotCount = syncedTeam.teamCapacityPlayerCount()
    UnifiedCard(
        entity = syncedTeam,
        subtitle = "Captain: ${team.captain?.displayName ?: "Unknown"} | $rosterSlotCount/${syncedTeam.teamSize} players",
        modifier = modifier
    )
}
