package com.razumly.mvp.eventFollowing.presentation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import com.razumly.mvp.eventList.EventList

@Composable
fun EventFollowingScreen(component: FollowingEventListComponent){
    val events = component.events.collectAsState()

    EventList(
        component,
        events.value,
    )
}