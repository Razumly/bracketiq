package com.razumly.mvp.eventMap

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import dev.icerock.moko.geo.LatLng

@Composable
expect fun EventMap(
    component: MapComponent,
    onEventSelected: (event: Event) -> Unit,
    onPlaceSelected: (place: MVPPlace) -> Unit,
    canClickPOI: Boolean,
    modifier: Modifier = Modifier,
    focusedLocation: LatLng,
    focusedEvent: Event?,
    revealCenter: Offset,
    onBackPressed: (() -> Unit)? = null
)
