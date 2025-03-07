package com.razumly.mvp.eventCreate

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.pop
import com.arkivanov.decompose.router.stack.pushNew
import com.arkivanov.decompose.router.stack.replaceCurrent
import com.razumly.mvp.core.data.IMVPRepository
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.enums.EventTypes
import com.razumly.mvp.eventCreate.CreateEventComponent.Child
import com.razumly.mvp.eventCreate.CreateEventComponent.Config
import com.razumly.mvp.eventMap.MapComponent
import dev.icerock.moko.geo.LocationTracker
import dev.icerock.moko.permissions.PermissionsController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin


class DefaultCreateEventComponent(
    componentContext: ComponentContext,
    private val appwriteRepository: IMVPRepository,
    val permissionsController: PermissionsController,
    val locationTracker: LocationTracker
) : CreateEventComponent, ComponentContext by componentContext {
    private val navigation = StackNavigation<Config>()
    private val _koin = getKoin()
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _newEventState = MutableStateFlow(EventImp())
    override val newEventState = _newEventState.asStateFlow()

    private val _newTournamentState = MutableStateFlow(Tournament())
    override val newTournamentState = _newTournamentState.asStateFlow()

    private val _currentStep = MutableStateFlow(0)
    override val currentStep = _currentStep.asStateFlow()

    private val _currentEventType = MutableStateFlow(EventTypes.GENERIC)
    override val currentEventType = _currentEventType.asStateFlow()

    private val _canProceed = MutableStateFlow(false)
    override val canProceed = _canProceed.asStateFlow()

    override val childStack = childStack(
        source = navigation,
        initialConfiguration = Config.Step1,
        serializer = Config.serializer(),
        handleBackButton = true, // Enable built-in back handling logic
        childFactory = ::createChild
    )

    init {
        childStack.subscribe {}
    }

    override fun nextStep(config: Config) {
        navigation.pushNew(config)
    }

    override fun previousStep() {
        navigation.pop()
    }

    override fun createEvent() {
        scope.launch {
            appwriteRepository.createEvent(_newEventState.value)
        }
    }

    override fun createTournament() {
        scope.launch {
            appwriteRepository.createTournament(_newTournamentState.value)
        }
    }

    override fun updateEventField(update: EventImp.() -> EventImp) {
        _newEventState.value = _newEventState.value.update()
        if (currentEventType.value == EventTypes.TOURNAMENT) {
            selectTournamentEvent()
        }
    }

    override fun updateTournamentField(update: Tournament.() -> Tournament) {
        _newTournamentState.value = _newTournamentState.value.update()
    }

    override fun selectEventType(type: EventTypes) {
        _currentEventType.value = type
        when (type) {
            EventTypes.TOURNAMENT -> selectTournamentEvent()
            EventTypes.GENERIC -> {}
        }
    }

    override fun selectTournamentEvent(
    ) {
        _newTournamentState.value.updateTournamentFromEvent(_newEventState.value)
    }

    private fun createChild(
        config: Config,
        componentContext: ComponentContext
    ): Child = when (config) {
        is Config.Step1 -> Child.Step1
        is Config.Step2 -> Child.Step2(
            _koin.inject<MapComponent> {
                parametersOf(
                    componentContext,
                    { navigation.replaceCurrent(Config.Step3)}
                )
            }.value
        )
        is Config.Step3 -> Child.Step3
        is Config.Finished -> Child.Finished
    }
}