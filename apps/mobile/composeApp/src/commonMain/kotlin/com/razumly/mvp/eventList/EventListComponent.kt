package com.razumly.mvp.eventList

import com.razumly.mvp.core.data.dataTypes.EventAbs
import kotlinx.coroutines.flow.StateFlow

interface EventListComponent {
    val events: StateFlow<List<EventAbs>>
    val currentRadius: StateFlow<Double>
    val selectedEvent: StateFlow<EventAbs?>
    fun selectEvent(event: EventAbs?)
}