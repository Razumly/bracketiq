package com.razumly.mvp.tournamentDetailScreen.composables

import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.home.LocalNavBarPadding
import com.razumly.mvp.tournamentDetailScreen.LocalTournamentComponent

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun SharedTransitionScope.TeamsView() {
    val component = LocalTournamentComponent.current
    val teams by component.divisionTeams.collectAsState()
    val showDetails by component.showDetails.collectAsState()
    val navPadding = LocalNavBarPadding.current

    LazyColumn(
        Modifier
            .background(MaterialTheme.colorScheme.background)
            .fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        contentPadding = navPadding
    ) {
        item {
            Header(component)
            CollapsableHeader(component)
        }
        itemsIndexed(teams, key = { _, team -> team.team.id }) { _, team ->
            TeamCard(team, Modifier.padding(bottom = 8.dp))
        }
    }
}