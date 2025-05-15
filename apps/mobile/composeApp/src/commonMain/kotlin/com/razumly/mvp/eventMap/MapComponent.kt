package com.razumly.mvp.eventMap

import dev.icerock.moko.geo.LatLng
import kotlinx.coroutines.flow.StateFlow

expect class MapComponent {
    val currentLocation: StateFlow<LatLng?>
}