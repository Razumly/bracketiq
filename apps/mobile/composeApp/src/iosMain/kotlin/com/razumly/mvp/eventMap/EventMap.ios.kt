package com.razumly.mvp.eventMap

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.UIKitViewController
import com.razumly.mvp.LocalNativeViewFactory
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import dev.icerock.moko.geo.LatLng

@Composable
actual fun EventMap(
    component: MapComponent,
    onEventSelected: (event: EventAbs) -> Unit,
    onPlaceSelected: (place: MVPPlace) -> Unit,
    canClickPOI: Boolean,
    modifier: Modifier,
    focusedLocation: LatLng,
    focusedEvent: EventAbs?,
    revealCenter: Offset
) {
    val factory = LocalNativeViewFactory.current
    val showMap by component.showMap.collectAsState()
    LaunchedEffect(showMap) {
        if (showMap) {
            component.showMap()
        } else {
            component.hideMap()
        }
    }

    if (showMap) {
        UIKitViewController(
            modifier = modifier.fillMaxSize().background(Color.Transparent),
            factory = {
                factory.createNativeMapView(
                    component,
                    onEventSelected,
                    onPlaceSelected,
                    canClickPOI,
                    focusedLocation,
                    focusedEvent,
                    revealCenter.x.toDouble(),
                    revealCenter.y.toDouble()
                )
            },
            update = { viewController ->
                // Update the native view when parameters change
                factory.updateNativeMapView(
                    viewController,
                    component,
                    onEventSelected,
                    onPlaceSelected,
                    canClickPOI,
                    focusedLocation,
                    focusedEvent,
                    revealCenter.x.toDouble(),
                    revealCenter.y.toDouble()
                )
            }
        )
    }
}
