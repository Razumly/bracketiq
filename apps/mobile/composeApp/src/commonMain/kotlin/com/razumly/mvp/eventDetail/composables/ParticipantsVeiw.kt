package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.eventDetail.LocalTournamentComponent
import com.razumly.mvp.home.LocalNavBarPadding

@Composable
fun ParticipantsView(showFab: (Boolean) -> Unit) {
    val component = LocalTournamentComponent.current
    val divisionTeams by component.divisionTeams.collectAsState()
    val selectedEvent by component.selectedEvent.collectAsState()

    val participants = selectedEvent.players
    val teamSignup = selectedEvent.event.teamSignup
    val navPadding = LocalNavBarPadding.current
    val lazyColumnState = rememberLazyListState()
    val isScrollingUp by lazyColumnState.isScrollingUp()

    showFab(isScrollingUp)

    LazyColumn(
        Modifier
            .background(MaterialTheme.colorScheme.background)
            .fillMaxSize(),
        state = lazyColumnState,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = navPadding
    ) {
        item(key = "header") {
            Text("Participants", style = MaterialTheme.typography.titleLarge)
        }
        if (teamSignup) {
            items(
                divisionTeams.values.toList(),
                key = { it.team.id },
            ) { team ->
                TeamCard(team)
            }

        } else {
            items(participants, key = { it.id }) { participant ->
                PlayerCard(participant)
            }
        }
    }
}