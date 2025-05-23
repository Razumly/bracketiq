package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.eventMap.MapComponent
import dev.icerock.moko.geo.LatLng
import platform.UIKit.UIViewController

interface NativeViewFactory {
    fun createNativeMapView(
        component: MapComponent,
        onEventSelected: (event: EventAbs) -> Unit,
        onPlaceSelected: (place: MVPPlace) -> Unit,
        canClickPOI: Boolean,
        focusedLocation: LatLng?,
        focusedEvent: EventAbs?
    ): UIViewController
}