package com.razumly.mvp.eventFollowing

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.MVPRepository
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.enums.EventTypes
import com.razumly.mvp.eventList.EventListComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class FollowingEventListComponent(
    private val componentContext: ComponentContext,
    private val mvpRepository: MVPRepository,
    private val onTournamentSelected: (EventAbs) -> Unit,

) : EventListComponent, ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val _events = MutableStateFlow<List<EventAbs>>(emptyList())
    override val events: StateFlow<List<EventAbs>> = _events.asStateFlow()
    override val currentRadius = MutableStateFlow(50.0)
    override val selectedEvent = MutableStateFlow<EventAbs?>(null)

    override fun selectEvent(event: EventAbs?) {
        if (event == null) return
        if (event.eventType == EventTypes.TOURNAMENT) {
            onTournamentSelected(event as Tournament)
        }
    }

    private suspend fun getEvents() {
       _events.value = mvpRepository.getEvents()
    }

    init {
        scope.launch {
            getEvents()
        }
    }
}
