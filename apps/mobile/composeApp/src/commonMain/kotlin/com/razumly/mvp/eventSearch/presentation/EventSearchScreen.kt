package com.razumly.mvp.eventSearch.presentation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import com.razumly.mvp.eventList.EventList
import dev.icerock.moko.geo.compose.BindLocationTrackerEffect

@Composable
fun EventSearchScreen(component: SearchEventListComponent) {
    val events = component.events.collectAsState()
    BindLocationTrackerEffect(component.locationTracker)
    EventList(events = events.value, onEventSelected = component::selectEvent)
}