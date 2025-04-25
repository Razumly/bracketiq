package com.razumly.mvp.eventCreate

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.FabPosition
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.EventDetails
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.home.LocalNavBarPadding
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.create_tournament
import org.jetbrains.compose.resources.stringResource

@Composable
fun CreateEventScreen(
    component: CreateEventComponent,
    mapComponent: MapComponent,
) {
    var canProceed by remember { mutableStateOf(false) }
    val defaultEvent by component.defaultEvent.collectAsState()
    val newEventState by component.newEventState.collectAsState()
    val isEditing = true

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = {
                    if (canProceed) {
                        component.createEvent()
                    }
                }
            ) {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = stringResource(Res.string.create_tournament)
                )
            }
        },

        floatingActionButtonPosition = FabPosition.Center,
        content = {
            EventDetails(
                mapComponent = mapComponent,
                eventWithRelations = defaultEvent,
                editEvent = newEventState,
                onFavoriteClick = {},
                favoritesModifier = Modifier.padding(top = 64.dp, end = 8.dp),
                navPadding = LocalNavBarPadding.current,
                onPlaceSelected = { component.selectPlace(it) },
                editView = isEditing,
                onEditEvent = { update -> component.updateEventField(update) },
                onEditTournament = { update -> component.updateTournamentField(update) },
                isNewEvent = false,
                onEventTypeSelected = { component.onTypeSelected(it) },
                onAddCurrentUser = {}
            ) { isValid -> canProceed = isValid }
        }
    )
}
