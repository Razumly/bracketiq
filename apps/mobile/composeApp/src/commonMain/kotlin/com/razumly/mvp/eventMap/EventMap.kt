package com.razumly.mvp.eventMap

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import dev.icerock.moko.geo.LatLng

@Composable
expect fun EventMap(
    component: MapComponent,
    onEventSelected: (event: Event) -> Unit,
    onPlaceSelected: (place: MVPPlace) -> Unit,
    onPlaceSelectionPoint: (x: Float, y: Float) -> Unit = { _, _ -> },
    selectionRequiresConfirmation: Boolean = false,
    originalPlace: MVPPlace? = null,
    selectedPlace: MVPPlace? = null,
    onPlaceSelectionCleared: () -> Unit = {},
    canClickPOI: Boolean,
    modifier: Modifier = Modifier,
    focusedLocation: LatLng,
    focusedEvent: Event?,
    mapActionLabel: String = "Close Map",
    usePrimaryActionButton: Boolean = false,
    onBackPressed: (() -> Unit)? = null
)
