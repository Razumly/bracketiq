package com.razumly.mvp.eventMap

import com.razumly.mvp.core.data.dataTypes.EventAbs
import dev.icerock.moko.geo.LatLng
import kotlinx.coroutines.flow.StateFlow

expect class MapComponent {
    val currentLocation: StateFlow<LatLng?>
    fun setEvents(events: List<EventAbs>)
    fun toggleMap()
}