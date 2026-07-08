package com.razumly.mvp.eventMap

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import dev.icerock.moko.geo.LatLng
import kotlinx.coroutines.flow.StateFlow

expect class MapComponent {
    val currentLocation: StateFlow<LatLng?>
    val currentViewCenter: StateFlow<LatLng?>
    val currentViewRadiusMiles: StateFlow<Double?>
    val showMap: StateFlow<Boolean>
    val events: StateFlow<List<Event>>
    val places: StateFlow<List<MVPPlace>>
    val isLoading: StateFlow<Boolean>
    fun setEvents(events: List<Event>)
    fun setPlaces(places: List<MVPPlace>)
    suspend fun searchLocationPlaces(query: String): List<MVPPlace>
    suspend fun refreshEventsForVisibleArea()
    fun openMap()
    fun closeMap()
    fun toggleMap()
}
