package com.razumly.mvp.eventCreate

import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.value.Value
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.enums.EventTypes
import com.razumly.mvp.eventCreate.CreateEventComponent.Config.Step2
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

    fun updateEventField(update: EventImp.() -> EventImp)
    fun updateTournamentField(update: Tournament.() -> Tournament)
    fun createEvent()
    fun createTournament()
    fun selectTournamentEvent()
    fun nextStep(config: Config)
    fun previousStep()
    fun selectEventType(type: EventTypes)

    sealed class Child(val nextStep: Config?, val step: Int) {
        companion object {
            const val STEPS = 4
        }
        data object Step1 : Child(Step2, 1)
        data class Step2(val component: MapComponent) : Child(Config.Step3, 2)
        data object Step3 : Child(Config.Finished, 3)
        data object Finished : Child(null, 4)
    }

    @Serializable
    sealed class Config {
        @Serializable
        data object Step1: Config()
        @Serializable
        data object Step2: Config()
        @Serializable
        data object Step3: Config()
        @Serializable
        data object Finished: Config()
    }
}

