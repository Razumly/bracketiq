package com.razumly.mvp.eventSearch

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.presentation.composables.EventDetails
import com.razumly.mvp.core.presentation.composables.TeamCard

@Composable
fun EventList(
    component: SearchEventListComponent,
    events: List<EventAbs>,
    firstElementPadding: PaddingValues,
    lastElementPadding: PaddingValues,
    lazyListState: LazyListState = rememberLazyListState(),
    onMapClick: (Offset) -> Unit
) {

    val selectedEvent by component.selectedEvent.collectAsState()
    val currentUser by component.currentUser.collectAsState()
    val validTeams by component.validTeams.collectAsState()
    var isUserInEvent by remember { mutableStateOf(false) }
    val teamSignup = selectedEvent?.teamSignup

    // Control the team selection dialog visibility
    var showTeamSelectionDialog by remember { mutableStateOf(false) }
    var showDropdownMenu by remember { mutableStateOf(false) }

    LaunchedEffect(currentUser, selectedEvent) {
        isUserInEvent =
            (currentUser?.user?.tournamentIds?.contains(selectedEvent?.id) == true) || (currentUser?.user?.eventIds?.contains(
                selectedEvent?.id
            ) == true)
    }

    LazyColumn(
        state = lazyListState,
    ) {
        itemsIndexed(items = events, key = { _, item -> item.id }) { index, event ->
            val padding = when (index) {
                0 -> {
                    firstElementPadding
                }

                events.size - 1 -> {
                    lastElementPadding
                }

                else -> {
                    PaddingValues()
                }
            }

            Card(
                modifier = Modifier.padding(padding).padding(horizontal = 16.dp, vertical = 8.dp)
                    .clickable(onClick = { component.selectEvent(event) }).fillMaxWidth(),
                elevation = CardDefaults.cardElevation(4.dp),
                shape = RoundedCornerShape(12.dp),
            ) {
                EventDetails(event,
                    selectedEvent?.id == event.id,
                    {},
                    Modifier.padding(8.dp),
                    onMapClick = { offset ->
                        onMapClick(offset)
                        component.onMapClick()
                    }) {
                    if (isUserInEvent) {
                        Button(onClick = {
                            component.viewEvent(event)
                        }) {
                            Text("View")
                        }
                    } else {
                        Row {
                            Button(
                                onClick = { showDropdownMenu = !showDropdownMenu },
                                modifier = Modifier.padding(8.dp)
                            ) {
                                Text("Join Event")
                            }
                            // Dropdown menu with "Join as Individual" and "Join as Team"
                            DropdownMenu(expanded = showDropdownMenu,
                                onDismissRequest = { showDropdownMenu = false }) {
                                DropdownMenuItem(text = { Text("View") }, onClick = {
                                    component.viewEvent(event)
                                    showDropdownMenu = false
                                })
                                DropdownMenuItem(text = { Text("Join as Free Agent") }, onClick = {
                                    // Join as individual logic
                                    component.joinEvent(event)
                                    showDropdownMenu = false
                                })
                                DropdownMenuItem(text = { Text("Join as Team") }, onClick = {
                                    showTeamSelectionDialog = true
                                    showDropdownMenu = false
                                })
                            }
                        }
                    }
                }
            }
        }
    }

    // Dialog for team selection when joining an event that requires team signup
    if (showTeamSelectionDialog && selectedEvent != null) {
        TeamSelectionDialog(teams = validTeams, onTeamSelected = { selectedTeam ->
            showTeamSelectionDialog = false
            component.joinEventAsTeam(selectedTeam)
        }, onDismiss = {
            showTeamSelectionDialog = false
        })
    }
}


@Composable
fun TeamSelectionDialog(
    teams: List<TeamWithRelations>, onTeamSelected: (TeamWithRelations) -> Unit, onDismiss: () -> Unit
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
    }, confirmButton = {})
}