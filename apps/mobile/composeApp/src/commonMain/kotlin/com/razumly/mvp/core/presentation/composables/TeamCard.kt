package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers

@Composable
fun TeamCard(team: TeamWithPlayers, modifier: Modifier = Modifier) {
    UnifiedCard(
        entity = team.team,
        subtitle = "Captain: ${team.captain?.displayName ?: "Unknown"} | ${team.team.playerIds.size}/${team.team.teamSize} players",
        modifier = modifier
    )
}
