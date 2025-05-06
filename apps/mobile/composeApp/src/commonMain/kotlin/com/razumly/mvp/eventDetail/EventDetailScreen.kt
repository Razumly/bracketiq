package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TournamentWithRelations
import com.razumly.mvp.core.presentation.composables.EventDetails
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.eventDetail.composables.CollapsableHeader
import com.razumly.mvp.eventDetail.composables.ParticipantsView
import com.razumly.mvp.eventDetail.composables.TournamentBracketView
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.home.LocalNavBarPadding
import kotlinx.coroutines.delay

val LocalTournamentComponent =
    compositionLocalOf<EventDetailComponent> { error("No tournament provided") }

@Composable
fun EventDetailScreen(
    component: EventDetailComponent,
    mapComponent: MapComponent
) {
    val isBracketView by component.isBracketView.collectAsState()
    var showDropdownMenu by remember { mutableStateOf(false) }
    val selectedEvent by component.selectedEvent.collectAsState()
    val teamSignup = selectedEvent.event.teamSignup
    val currentUser = component.currentUser
    var showTeamSelectionDialog by remember { mutableStateOf(false) }
    val validTeams by component.validTeams.collectAsState()
    val showDetails by component.showDetails.collectAsState()
    var animateExpanded by remember { mutableStateOf(false) }
    val isHost by component.isHost.collectAsState()
    var isEditing by remember { mutableStateOf(false) }
    val editedEvent by component.editedEvent.collectAsState()

    val isUserInEvent =
        (currentUser.eventIds + currentUser.tournamentIds).contains(selectedEvent.event.id) || (selectedEvent.event.waitList + selectedEvent.event.freeAgents).contains(
            currentUser.id
        )

    LaunchedEffect(Unit) {
        delay(300)
        animateExpanded = true
    }

    CompositionLocalProvider(LocalTournamentComponent provides component) {
        Scaffold(Modifier.fillMaxSize()) { innerPadding ->
            Column(
                Modifier.background(MaterialTheme.colorScheme.background).fillMaxSize()
            ) {
                AnimatedVisibility(
                    !showDetails, enter = expandVertically(), exit = shrinkVertically()
                ) {
                    EventDetails(
                        mapComponent = mapComponent,
                        eventWithRelations = selectedEvent,
                        editEvent = editedEvent,
                        onFavoriteClick = {},
                        favoritesModifier = Modifier.padding(top = 64.dp, end = 8.dp),
                        navPadding = LocalNavBarPadding.current,
                        onPlaceSelected = { component.selectPlace(it) },
                        editView = isEditing,
                        onEditEvent = { update -> component.editEventField(update) },
                        onEditTournament = { update -> component.editTournamentField(update) },
                        isNewEvent = false,
                        onEventTypeSelected = { component.onTypeSelected(it) },
                        onAddCurrentUser = {}
                    ) { isValid ->
                        Column(
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            if (isEditing) {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(onClick = {
                                        component.updateEvent()
                                        isEditing = false
                                    }, enabled = isValid) {
                                        Text("Confirm")
                                    }
                                    Button(onClick = {
                                        isEditing = false
                                    }) {
                                        Text("Cancel")
                                    }
                                }
                            } else {
                                if (isHost) {
                                    Button(onClick = { isEditing = true }) {
                                        Text("Edit")
                                    }
                                }
                                Button(onClick = {
                                    component.viewEvent()
                                    showDropdownMenu = false
                                }) { Text("View") }
                                if (!isUserInEvent) {
                                    val individual =
                                        if (teamSignup) "Join as Free Agent" else "Join"
                                    Button(onClick = {
                                        component.joinEvent()
                                        showDropdownMenu = false
                                    }) { Text(individual) }
                                    if (teamSignup) {
                                        Button(onClick = {
                                            showTeamSelectionDialog = true
                                            showDropdownMenu = false
                                        }) { Text("Join as Team") }
                                    }
                                } else {
                                    Button(onClick = {
                                        component.leaveEvent()
                                        showDropdownMenu = false
                                    }) { Text("Leave") }
                                }
                            }
                        }

                    }
                }
                AnimatedVisibility(
                    showDetails,
                    enter = expandVertically(expandFrom = Alignment.Top),
                    exit = shrinkVertically(shrinkTowards = Alignment.Top)
                ) {
                    Column(Modifier.padding(innerPadding)) {
                        CollapsableHeader(component)
                        Box(Modifier.fillMaxSize()) {
                            when (selectedEvent) {
                                is TournamentWithRelations -> {
                                    if (isBracketView) {
                                        TournamentBracketView { match ->
                                            component.matchSelected(match)
                                        }
                                    } else {
                                        ParticipantsView()
                                    }
                                }

                                is EventWithRelations -> {
                                    ParticipantsView()
                                }
                            }
                            Button(
                                { component.toggleDetails() },
                                Modifier.align(Alignment.BottomCenter)
                                    .padding(LocalNavBarPadding.current).padding(bottom = 64.dp)
                            ) {
                                Text("Show Details")
                            }
                        }
                    }
                }
            }

            // Dialog for team selection when joining an event that requires team signup
            if (showTeamSelectionDialog) {
                TeamSelectionDialog(teams = validTeams, onTeamSelected = { selectedTeam ->
                    showTeamSelectionDialog = false
                    component.joinEventAsTeam(selectedTeam)
                }, onDismiss = {
                    showTeamSelectionDialog = false
                }, onCreateTeam = { component.createNewTeam() })
            }
        }
    }
}


@Composable
fun TeamSelectionDialog(
    teams: List<TeamWithPlayers>,
    onTeamSelected: (TeamWithPlayers) -> Unit,
    onDismiss: () -> Unit,
    onCreateTeam: () -> Unit
) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Select a Team") }, text = {
        // List only valid teams
        LazyColumn {
            items(teams) { team ->
                Row(modifier = Modifier.fillMaxWidth().clickable { onTeamSelected(team) }
                    .padding(8.dp)) {
                    TeamCard(team)
                }
            }
        }
    }, confirmButton = {
        Button(onClick = onCreateTeam) {
            Text("Manage Teams")
        }
    })
}