package com.razumly.mvp.tournamentDetailScreen

import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.razumly.mvp.tournamentDetailScreen.composables.TeamsView
import com.razumly.mvp.tournamentDetailScreen.composables.TournamentBracketView

val LocalTournamentComponent =
    compositionLocalOf<TournamentContentComponent> { error("No tournament provided") }

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun SharedTransitionScope.TournamentDetailScreen(
    component: TournamentContentComponent
) {
    val isBracketView by component.isBracketView.collectAsState()

    CompositionLocalProvider(LocalTournamentComponent provides component) {
        Box(
            Modifier
            .background(MaterialTheme.colorScheme.background)
            .fillMaxSize()
        ) {
            if (isBracketView) {
                TournamentBracketView { match ->
                    component.matchSelected(match)
                }
            } else {
                TeamsView()
            }
        }
    }
}