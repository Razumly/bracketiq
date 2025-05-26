package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.eventMap.MapComponent
import dev.icerock.moko.geo.LatLng
import kotlinx.cinterop.CValue
import kotlinx.cinterop.ExperimentalForeignApi
import platform.CoreGraphics.CGPoint
import platform.CoreGraphics.CGPointMake
import platform.UIKit.UIViewController
import kotlin.native.internal.NativePtr

interface NativeViewFactory {
    fun createNativeMapView(
        component: MapComponent,
        onEventSelected: (event: EventAbs) -> Unit,
        onPlaceSelected: (place: MVPPlace) -> Unit,
        canClickPOI: Boolean,
        focusedLocation: LatLng?,
        focusedEvent: EventAbs?,
        revealCenterX: Double,
        revealCenterY: Double
    ): UIViewController
}