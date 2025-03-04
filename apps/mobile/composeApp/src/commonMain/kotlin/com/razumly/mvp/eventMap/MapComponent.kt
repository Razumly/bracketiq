package com.razumly.mvp.eventMap

import com.arkivanov.decompose.ComponentContext
import dev.icerock.moko.geo.LatLng
import kotlinx.coroutines.flow.StateFlow

expect class MapComponent : ComponentContext {
    val currentLocation: StateFlow<LatLng?>
}