package com.razumly.mvp.eventManagement

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.repositories.IEventAbsRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

interface EventManagementComponent {
    val events: StateFlow<List<EventAbs>>
    val onEventSelected: (event: EventAbs) -> Unit
    val onBack: () -> Unit
}

class DefaultEventManagementComponent(
    componentContext: ComponentContext,
    override val onEventSelected: (event: EventAbs) -> Unit,
    private val eventAbsRepository: IEventAbsRepository,
    override val onBack: () -> Unit
) : ComponentContext by componentContext, EventManagementComponent {
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    private val _events = MutableStateFlow<List<EventAbs>>(emptyList())
    override val events = _events.asStateFlow()

    init {
        scope.launch {
            eventAbsRepository.getUsersEvents().onSuccess {
                _events.value = it
            }.onFailure {
                _events.value = emptyList()
            }
        }
    }
}