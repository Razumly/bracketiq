package com.razumly.mvp.teamManagement

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.window.Dialog
import com.razumly.mvp.core.presentation.composables.TeamCard

@Composable
fun TeamManagementScreen(component: TeamManagementComponent) {
    val currentTeams by component.currentTeams.collectAsState()
    val lazyListState = rememberLazyListState()
    val selectedTeam by component.selectedTeam.collectAsState()

    Scaffold { paddingValues ->
        LazyColumn(
            modifier = Modifier.padding(paddingValues), state = lazyListState
        ) {
            items(currentTeams) { team ->
                TeamCard(
                    modifier = Modifier.clickable(onClick = {
                            component.selectTeam(team)
                        }), team = team
                )
            }
        }
    }
    if (selectedTeam != null) {
        Dialog(onDismissRequest = { component.deselectTeam() }) {
            TeamEdit(
                team = selectedTeam!!,
                onTeamNameChange = { newName ->
                    // Update the team name as needed (e.g. update repository or state)
                },
                onAddPlayer = { player ->
                    component.addPlayer(player)
                },
                onRemovePlayer = { player ->
                    component.removePlayer(player)
                },
                onDismiss = { component.deselectTeam() }
            )
        }
    }
}