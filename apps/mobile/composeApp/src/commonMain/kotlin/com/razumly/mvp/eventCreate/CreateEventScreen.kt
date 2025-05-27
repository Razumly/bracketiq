package com.razumly.mvp.eventCreate

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.experimental.stack.ChildStack
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.razumly.mvp.core.presentation.composables.EventDetails
import com.razumly.mvp.eventCreate.steps.Preview
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.home.LocalNavBarPadding
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.create_tournament
import mvp.composeapp.generated.resources.next
import mvp.composeapp.generated.resources.previous
import org.jetbrains.compose.resources.stringResource

@OptIn(ExperimentalDecomposeApi::class)
@Composable
fun CreateEventScreen(
    component: CreateEventComponent,
    mapComponent: MapComponent,
) {
    var canProceed by remember { mutableStateOf(false) }
    val defaultEvent by component.defaultEvent.collectAsState()
    val newEventState by component.newEventState.collectAsState()
    val childStack by component.childStack.subscribeAsState()
    val isEditing = true
    val currentLocation by component.currentLocation.collectAsState()

    Scaffold(
        modifier = Modifier.padding(LocalNavBarPadding.current),
        floatingActionButton = {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                if (childStack.active.instance == CreateEventComponent.Child.EventInfo) {
                    Spacer(Modifier.width(48.dp))
                    FloatingActionButton(
                        onClick = {
                            if (canProceed) {
                                component.nextStep()
                            }
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Default.Check,
                            contentDescription = stringResource(Res.string.next)
                        )
                    }
                } else {
                    FloatingActionButton(
                        onClick = {
                            component.previousStep()
                        }
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(Res.string.previous)
                        )
                    }
                    FloatingActionButton(
                        onClick = {
                            component.createEvent()
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Default.Check,
                            contentDescription = stringResource(Res.string.create_tournament)
                        )
                    }
                }
            }
        },
        floatingActionButtonPosition = FabPosition.Center,
        content = {
            ChildStack(childStack) { child ->
                when (child.instance) {
                    is CreateEventComponent.Child.EventInfo -> EventDetails(
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
                        isNewEvent = true,
                        onEventTypeSelected = { component.onTypeSelected(it) },
                        onAddCurrentUser = {},
                        currentLocation = currentLocation
                    ) { isValid -> canProceed = isValid }

                    is CreateEventComponent.Child.Preview -> Preview(
                        modifier = Modifier.fillMaxSize(),
                        component = component
                    )
                }
            }

        }
    )
}
