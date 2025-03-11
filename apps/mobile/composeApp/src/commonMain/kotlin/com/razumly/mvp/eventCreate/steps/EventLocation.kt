package com.razumly.mvp.eventCreate.steps

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import com.razumly.mvp.eventCreate.CreateEventComponent
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent

@Composable
fun EventLocation(
    mapComponent: MapComponent,
    createEventComponent: CreateEventComponent,
    isCompleted: (Boolean) -> Unit
) {
    val eventState by createEventComponent.newEventState.collectAsState()
    val formValid by remember(eventState) {
        mutableStateOf(
            eventState?.let { event ->
                event.location.isNotBlank() &&
                        event.lat != 0.0 &&
                        event.long != 0.0
            } ?: false
        )
    }

    // Trigger the isCompleted callback whenever the form validity changes.
    LaunchedEffect(formValid) {
        isCompleted(formValid)
    }
    EventMap(
        mapComponent,
        {},
        { place ->
            createEventComponent.selectPlace(place)
        },
        true,
    )
}
