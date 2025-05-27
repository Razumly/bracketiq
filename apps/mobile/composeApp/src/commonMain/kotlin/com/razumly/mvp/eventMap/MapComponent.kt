package com.razumly.mvp.eventMap

import androidx.compose.ui.graphics.ImageBitmap
import com.razumly.mvp.core.data.dataTypes.EventAbs
import dev.icerock.moko.geo.LatLng
import kotlinx.coroutines.flow.StateFlow

expect class MapComponent {
    fun setEvents(events: List<EventAbs>)
}