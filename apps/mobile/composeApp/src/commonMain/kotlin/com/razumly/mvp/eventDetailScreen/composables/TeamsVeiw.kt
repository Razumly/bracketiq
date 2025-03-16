package com.razumly.mvp.eventDetailScreen.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.eventDetailScreen.LocalTournamentComponent
import com.razumly.mvp.home.LocalNavBarPadding

@Composable
fun ParticipantsView() {
    val component = LocalTournamentComponent.current
    val teams by component.divisionTeams.collectAsState()
    val selectedEvent by component.selectedEvent.collectAsState()
    val participants = selectedEvent?.players
    val teamSignup = selectedEvent?.event?.teamSignup
    val navPadding = LocalNavBarPadding.current

    LazyColumn(
        Modifier
            .background(MaterialTheme.colorScheme.background)
            .fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = navPadding
    ) {
        item {
            Header(component)
            CollapsableHeader(component)
        }
        if (teamSignup == true) {
            itemsIndexed(teams, key = { _, team -> team.team.id }) { _, team ->
                TeamCard(team)
            }
        } else {
            participants?.let {
                itemsIndexed(it, key = { _, participant -> participant.id }) { _, participant ->
                    PlayerCard(participant)
                }
            }
        }
    }
}