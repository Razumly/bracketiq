package com.razumly.mvp.eventMap

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.compose.rememberMarkerState
import com.razumly.mvp.core.data.dataTypes.EventAbs

@Composable
actual fun EventMap(events: List<EventAbs>, currentLocation: dev.icerock.moko.geo.LatLng) {
    Box(
        modifier = Modifier.fillMaxSize(),
    ) {
        val currentLocationGoogle = LatLng(currentLocation.latitude, currentLocation.longitude)
        val cameraPositionState = rememberCameraPositionState {
            position = CameraPosition.fromLatLngZoom(currentLocationGoogle, 10f)
        }
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState
        ) {
            events.forEach { event ->
                val eventPosition = LatLng(event.lat, event.long)
                Marker(
                    state = rememberMarkerState(position = eventPosition),
                    title = event.name,
                    snippet = "${event.type} - $${event.price}"
                )
            }
        }
    }
}