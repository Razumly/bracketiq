package com.razumly.mvp.eventCreate.steps

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.unit.dp
import com.razumly.mvp.eventCreate.CreateEventComponent
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent

@Composable
fun Step2(mapComponent: MapComponent, createEventComponent: CreateEventComponent) {
    val currentLocation = mapComponent.currentLocation.collectAsState()

    Column(
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ){
        EventMap(
            listOf(),
            currentLocation.value,
            mapComponent,
            {},
            { place ->
                createEventComponent.updateEventField {
                    copy(
                        imageUrl = place.imageUrl,
                        location = place.name,
                        lat = place.lat,
                        long = place.long
                    )
                }
            },
            true
        )
    }
}
