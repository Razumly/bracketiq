package com.razumly.mvp.eventCreate.steps

import androidx.compose.runtime.Composable
import com.razumly.mvp.eventCreate.CreateEventComponent
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent

@Composable
fun Step2(mapComponent: MapComponent, createEventComponent: CreateEventComponent) {
    EventMap(
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
        true,
    )
}
