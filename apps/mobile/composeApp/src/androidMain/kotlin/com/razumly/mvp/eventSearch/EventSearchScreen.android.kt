package com.razumly.mvp.eventSearch

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.presentation.composables.PermissionPrimerDialog
import com.razumly.mvp.eventMap.MapComponent

@Composable
actual fun EventSearchScreen(
    component: EventSearchComponent,
    mapComponent: MapComponent,
) {
    val permissionPrimer by component.locationPermissionPrimer.collectAsState()

    LaunchedEffect(component) {
        component.onDiscoverVisible()
    }

    Box(Modifier.fillMaxSize()) {
        ComposeEventSearchScreen(component, mapComponent)
        permissionPrimer?.let { state ->
            PermissionPrimerDialog(
                state = state,
                onDoNotAskAgainChanged = component::setLocationPermissionDoNotAskAgain,
                onNext = component::requestLocationPermission,
                onNotNow = component::dismissLocationPermissionPrimer,
                onOpenSettings = component::openLocationPermissionSettings,
            )
        }
    }
}
