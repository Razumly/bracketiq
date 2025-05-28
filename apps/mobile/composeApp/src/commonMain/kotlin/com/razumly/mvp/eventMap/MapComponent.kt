package com.razumly.mvp.eventMap

import androidx.compose.ui.graphics.ImageBitmap
import com.razumly.mvp.core.data.dataTypes.EventAbs
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.LocationTracker
import kotlinx.coroutines.flow.StateFlow

expect class MapComponent {
    val locationTracker: LocationTracker
    fun setEvents(events: List<EventAbs>)
}