package com.razumly.mvp.eventFollowing.presentation

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.MVPRepository
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.eventList.EventListComponent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class FollowingEventListComponent(
    private val componentContext: ComponentContext,
    private val mvpRepository: MVPRepository,
    private val onTournamentSelected: (EventAbs) -> Unit
) : EventListComponent, ComponentContext by componentContext {
    private val _events = MutableStateFlow<List<EventAbs>>(emptyList())
    override val events: StateFlow<List<EventAbs>> = _events.asStateFlow()
    override val currentRadius = MutableStateFlow(50)
    override val selectedEvent = MutableStateFlow<EventAbs?>(null)

    override fun selectEvent(event: EventAbs?) {
        if (event!!.collectionId == "tournaments") {
            onTournamentSelected(event as Tournament)
        }
    }

    private suspend fun getEvents() {
       _events.value = mvpRepository.getEvents()
    }
}
