package com.razumly.mvp.eventSearch

import androidx.compose.runtime.Composable
import com.razumly.mvp.eventMap.MapComponent

@Composable
expect fun EventSearchScreen(
    component: EventSearchComponent,
    mapComponent: MapComponent,
)
