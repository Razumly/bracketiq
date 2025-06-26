package com.razumly.mvp.eventMap

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
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
    revealCenter: Offset,
    onBackPressed: (() -> Unit)?
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
        Box(modifier = Modifier.fillMaxSize()) {
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

            if (onBackPressed != null) {
                MapFloatingActionButton(
                    isVisible = showMap,
                    onCloseMap = onBackPressed,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 128.dp) // Adjust padding as needed
                )
            }
        }
    }
}
