package com.razumly.mvp.eventMap

import androidx.compose.runtime.Composable
import com.razumly.mvp.core.data.dataTypes.EventAbs
import dev.icerock.moko.geo.LatLng

@Composable
expect fun EventMap(events: List<EventAbs>, currentLocation: LatLng)