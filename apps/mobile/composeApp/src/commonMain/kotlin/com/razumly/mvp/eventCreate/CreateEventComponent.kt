package com.razumly.mvp.eventCreate

import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.value.Value
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.enums.EventTypes
import com.razumly.mvp.eventCreate.CreateEventComponent.Config.EventLocation
import com.razumly.mvp.eventMap.MapComponent
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable

interface CreateEventComponent {
    val newEventState: StateFlow<EventImp?>
    val newTournamentState: StateFlow<Tournament?>
    val currentStep: StateFlow<Int>
    val currentEventType: StateFlow<EventTypes>
    val childStack: Value<ChildStack<Config, Child>>
    val canProceed: StateFlow<Boolean>
    val selectedPlace: StateFlow<MVPPlace?>

    fun updateEventField(update: EventImp.() -> EventImp)
    fun updateTournamentField(update: Tournament.() -> Tournament)
    fun createEvent()
    fun selectTournamentEvent()
    fun nextStep(config: Config)
    fun previousStep()
    fun selectEventType(type: EventTypes)
    fun selectPlace(place: MVPPlace)

    sealed class Child(val nextStep: Config?, val step: Int) {
        companion object {
            const val STEPS = 5
        }
        data object EventBasicInfo : Child(EventLocation, 1)
        data class EventLocation(val component: MapComponent) : Child(Config.EventImage, 2)
        data object EventImage : Child(Config.TournamentInfo, 3)
        data object TournamentInfo : Child(Config.Preview, 4)
        data object Preview : Child(null, 5)
    }

    @Serializable
    sealed class Config {
        @Serializable
        data object Step1: Config()
        @Serializable
        data object EventLocation: Config()
        @Serializable
        data object EventImage: Config()
        @Serializable
        data object TournamentInfo: Config()
        @Serializable
        data object Preview: Config()
    }
}

