package com.razumly.mvp.eventMap

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import dev.icerock.moko.geo.LatLng
import kotlinx.coroutines.flow.StateFlow

expect class MapComponent {
    val currentLocation: StateFlow<LatLng?>
    val showMap: StateFlow<Boolean>
    val places: StateFlow<List<MVPPlace>>
    fun setEvents(events: List<Event>)
    fun setPlaces(places: List<MVPPlace>)
    fun toggleMap()
}
