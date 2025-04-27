package com.razumly.mvp.eventCreate

import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.value.Value
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable

interface CreateEventComponent {
    val newEventState: StateFlow<EventAbs>
    val currentEventType: StateFlow<EventType>
    val childStack: Value<ChildStack<Config, Child>>
    val canProceed: StateFlow<Boolean>
    val selectedPlace: StateFlow<MVPPlace?>
    val errorMessage: StateFlow<String?>
    val defaultEvent: StateFlow<EventWithRelations>

    fun updateEventField(update: EventImp.() -> EventImp)
    fun updateTournamentField(update: Tournament.() -> Tournament)
    fun createEvent()
    fun nextStep()
    fun previousStep()
    fun onTypeSelected(type: EventType)
    fun selectPlace(place: MVPPlace)
    fun validateAndUpdatePrice(input: String, onError: (Boolean) -> Unit)
    fun validateAndUpdateTeamSize(input: String, onError: (Boolean) -> Unit)
    fun validateAndUpdateMaxPlayers(input: String, onError: (Boolean) -> Unit)
    fun addUserToEvent(add: Boolean)

    sealed class Child {
        data object EventInfo : Child()
        data object Preview : Child()
    }

    @Serializable
    sealed class Config {
        @Serializable
        data object EventInfo: Config()
        @Serializable
        data object Preview: Config()
    }
}

