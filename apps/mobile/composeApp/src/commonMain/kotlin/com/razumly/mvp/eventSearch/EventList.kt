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
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.presentation.composables.EventDetails

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
    var isUserInEvent by remember { mutableStateOf(false) }
    val teamSignup = selectedEvent?.teamSignup

    // Control the team selection dialog visibility
    var showTeamSelectionDialog by remember { mutableStateOf(false) }
    // Save the event for which the user is trying to join
    var joiningEvent by remember { mutableStateOf<EventAbs?>(null) }

    LaunchedEffect(currentUser, selectedEvent) {
        isUserInEvent = (currentUser?.user?.tournamentIds?.contains(selectedEvent?.id) == true) ||
                (currentUser?.user?.eventIds?.contains(selectedEvent?.id) == true)
    }

    // Filter valid teams based on event's teamSizeLimit
    val validTeams = remember(currentUser, joiningEvent) {
        joiningEvent?.let { event ->
            // Assuming each Team has a member count and you want teams that haven't reached the teamSizeLimit.
            currentUser?.teams?.filter { team ->
                team.players.size < event.teamSizeLimit
            } ?: emptyList()
        } ?: emptyList()
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
                modifier = Modifier
                    .padding(padding)
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .clickable(onClick = { component.selectEvent(event) })
                    .fillMaxWidth(),
                elevation = CardDefaults.cardElevation(4.dp),
                shape = RoundedCornerShape(12.dp),
            ) {
                EventDetails(
                    event,
                    selectedEvent?.id == event.id,
                    {},
                    Modifier
                        .padding(8.dp),
                    onMapClick = { offset ->
                        onMapClick(offset)
                        component.onMapClick()
                    }
                ) {
                    Button(onClick = {
                        if (isUserInEvent) component.viewEvent(event) else component.joinEvent(
                            event
                        )
                    }) {
                        val text = if (isUserInEvent) "View" else "Join"
                        Text(text)
                    }
                }
            }
        }
    }

    // Dialog for team selection when joining an event that requires team signup
    if (showTeamSelectionDialog && joiningEvent != null) {
        TeamSelectionDialog(
            teams = validTeams,
            onTeamSelected = { selectedTeam ->
                showTeamSelectionDialog = false
                joiningEvent?.let { event ->
                    // Call a component function that joins event with the chosen team.
                    component.joinEventWithTeam(event, selectedTeam)
                }
                joiningEvent = null
            },
            onDismiss = {
                showTeamSelectionDialog = false
                joiningEvent = null
            }
        )
    }
}


@Composable
fun TeamSelectionDialog(
    teams: List<Team>,
    onTeamSelected: (Team) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Select a Team") },
        text = {
            // List only valid teams
            LazyColumn {
                items(teams) { team ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onTeamSelected(team) }
                            .padding(8.dp)
                    ) {
                        Text(text = team)
                    }
                }
            }
        },
        confirmButton = {} // or add a cancel button here if needed
    )
}