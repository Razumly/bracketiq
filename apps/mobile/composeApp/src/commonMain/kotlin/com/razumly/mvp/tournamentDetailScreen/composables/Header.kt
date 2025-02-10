package com.razumly.mvp.tournamentDetailScreen.composables

import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.EventDetails
import com.razumly.mvp.icons.ArrowDown
import com.razumly.mvp.icons.ArrowUp
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.tournamentDetailScreen.TournamentContentComponent


@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun SharedTransitionScope.Header(
    component: TournamentContentComponent,
) {
    val tournament by component.selectedTournament.collectAsState()
    val showDetails by component.showDetails.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        tournament?.tournament?.let {
            EventDetails(
                it,
                true,
                {},
                Modifier.padding(top = 32.dp, end = 8.dp)
            )
        }

//        Icon(
//            if (showDetails) {
//                MVPIcons.ArrowDown
//            } else {
//                MVPIcons.ArrowUp
//            },
//            contentDescription = "Expand",
//            modifier = Modifier.clickable(onClick = { component.toggleDetails() })
//        )
    }
}