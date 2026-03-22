package com.razumly.mvp.eventMap

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.UIKitViewController
import com.razumly.mvp.LocalNativeViewFactory
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.presentation.localAllFocusManagers
import dev.icerock.moko.geo.LatLng

@Composable
actual fun EventMap(
    component: MapComponent,
    onEventSelected: (event: Event) -> Unit,
    onPlaceSelected: (place: MVPPlace) -> Unit,
    onPlaceSelectionPoint: (x: Float, y: Float) -> Unit,
    canClickPOI: Boolean,
    modifier: Modifier,
    focusedLocation: LatLng,
    focusedEvent: Event?,
    onBackPressed: (() -> Unit)?
) {
    val factory = LocalNativeViewFactory.current
    val allFocusManagers = localAllFocusManagers.current

    Box(modifier = Modifier.fillMaxSize().pointerInput(Unit) {
        detectTapGestures {
            allFocusManagers.forEach { it.clearFocus() }
        }
    }) {
        UIKitViewController(
            modifier = modifier.fillMaxSize().background(Color.Transparent),
            factory = {
                factory.createNativeMapView(
                    component,
                    onEventSelected,
                    onPlaceSelected,
                    onPlaceSelectionPoint,
                    canClickPOI,
                    focusedLocation,
                    focusedEvent,
                )
            },
            update = { viewController ->
                factory.updateNativeMapView(
                    viewController,
                    component,
                    onEventSelected,
                    onPlaceSelected,
                    onPlaceSelectionPoint,
                    canClickPOI,
                    focusedLocation,
                    focusedEvent,
                )
            }
        )

        if (onBackPressed != null) {
            MapFloatingActionButton(
                onCloseMap = onBackPressed,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 128.dp)
            )
        }
    }
}
