package com.razumly.mvp.eventDetailScreen

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
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.TournamentWithRelations
import com.razumly.mvp.eventDetailScreen.composables.ParticipantsView
import com.razumly.mvp.eventDetailScreen.composables.TournamentBracketView

val LocalTournamentComponent =
    compositionLocalOf<EventContentComponent> { error("No tournament provided") }

@Composable
fun EventDetailScreen(
    component: EventContentComponent
) {
    val isBracketView by component.isBracketView.collectAsState()
    val selectedEvent by component.selectedEvent.collectAsState()

    CompositionLocalProvider(LocalTournamentComponent provides component) {
        Box(
            Modifier
            .background(MaterialTheme.colorScheme.background)
            .fillMaxSize()
        ) {
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
                null -> {}
            }
        }
    }
}