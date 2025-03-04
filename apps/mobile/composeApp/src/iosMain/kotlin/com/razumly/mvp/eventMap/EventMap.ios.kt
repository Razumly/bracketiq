package com.razumly.mvp.eventMap

import androidx.compose.runtime.Composable
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import dev.icerock.moko.geo.LatLng

@Composable
actual fun EventMap(
    events: List<EventAbs>,
    currentLocation: LatLng?,
    component: MapComponent,
    onEventSelected: (event: EventAbs) -> Unit,
    onPlaceSelected: (place: MVPPlace) -> Unit,
    canClickPOI: Boolean
) {
}