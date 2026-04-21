package com.razumly.mvp.eventMap

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.viewinterop.UIKitViewController
import com.razumly.mvp.LocalNativeViewFactory
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.localAllFocusManagers
import dev.icerock.moko.geo.LatLng

@Composable
actual fun EventMap(
    component: MapComponent,
    onEventSelected: (event: Event) -> Unit,
    onPlaceSelected: (place: MVPPlace) -> Unit,
    onPlaceSelectionPoint: (x: Float, y: Float) -> Unit,
    selectionRequiresConfirmation: Boolean,
    originalPlace: MVPPlace?,
    selectedPlace: MVPPlace?,
    onPlaceSelectionCleared: () -> Unit,
    canClickPOI: Boolean,
    modifier: Modifier,
    focusedLocation: LatLng,
    focusedEvent: Event?,
    mapActionLabel: String,
    usePrimaryActionButton: Boolean,
    onBackPressed: (() -> Unit)?
) {
    val factory = LocalNativeViewFactory.current
    val allFocusManagers = localAllFocusManagers.current
    val trackedLocation by component.currentLocation.collectAsState()
    var recenterRequestToken by remember { mutableIntStateOf(0) }
    val closeButtonBottomPadding =
        LocalNavBarPadding.current.calculateBottomPadding() + MAP_CLOSE_BUTTON_EXTRA_BOTTOM_PADDING

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
                    selectionRequiresConfirmation,
                    originalPlace,
                    selectedPlace,
                    onPlaceSelectionCleared,
                    canClickPOI,
                    focusedLocation,
                    focusedEvent,
                    recenterRequestToken,
                    closeButtonBottomPadding.value,
                )
            },
            update = { viewController ->
                factory.updateNativeMapView(
                    viewController,
                    component,
                    onEventSelected,
                    onPlaceSelected,
                    onPlaceSelectionPoint,
                    selectionRequiresConfirmation,
                    originalPlace,
                    selectedPlace,
                    onPlaceSelectionCleared,
                    canClickPOI,
                    focusedLocation,
                    focusedEvent,
                    recenterRequestToken,
                    closeButtonBottomPadding.value,
                )
            }
        )

        if (onBackPressed != null) {
            MapFloatingActionButton(
                onCloseMap = onBackPressed,
                label = mapActionLabel,
                usePrimaryActionButton = usePrimaryActionButton,
                onLeadingAction = trackedLocation?.let {
                    { recenterRequestToken++ }
                },
                onClearSelection = if (selectionRequiresConfirmation && selectedPlace != null) {
                    onPlaceSelectionCleared
                } else {
                    null
                },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = closeButtonBottomPadding)
            )
        }
    }
}
