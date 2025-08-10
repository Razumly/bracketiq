@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventCreate

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.pop
import com.arkivanov.decompose.router.stack.pushNew
import com.arkivanov.decompose.value.Value
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventAbsRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.eventCreate.CreateEventComponent.Child
import com.razumly.mvp.eventCreate.CreateEventComponent.Config
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime

interface CreateEventComponent: IPaymentProcessor {
    val newEventState: StateFlow<EventAbs>
    val currentEventType: StateFlow<EventType>
    val childStack: Value<ChildStack<Config, Child>>
    val canProceed: StateFlow<Boolean>
    val selectedPlace: StateFlow<MVPPlace?>
    val defaultEvent: StateFlow<EventWithRelations>
    val currentUser: StateFlow<UserData?>
    val errorState: StateFlow<ErrorMessage?>

    fun updateEventField(update: EventImp.() -> EventImp)
    fun updateTournamentField(update: Tournament.() -> Tournament)
    fun setLoadingHandler(loadingHandler: LoadingHandler)
    fun createEvent()
    fun nextStep()
    fun previousStep()
    fun onTypeSelected(type: EventType)
    fun selectPlace(place: MVPPlace?)
    fun validateAndUpdatePrice(input: String, onError: (Boolean) -> Unit)
    fun validateAndUpdateTeamSize(input: String, onError: (Boolean) -> Unit)
    fun validateAndUpdateMaxPlayers(input: String, onError: (Boolean) -> Unit)
    fun addUserToEvent(add: Boolean)
    fun selectFieldCount(count: Int)
    fun createAccount()

    sealed class Child {
        data object EventInfo : Child()
        data object Preview : Child()
    }

    @Serializable
    sealed class Config {
        @Serializable
        data object EventInfo : Config()

        @Serializable
        data object Preview : Config()
    }
}

class DefaultCreateEventComponent(
    componentContext: ComponentContext,
    private val userRepository: IUserRepository,
    private val eventRepository: IEventAbsRepository,
    private val fieldRepository: IFieldRepository,
    private val billingRepository: IBillingRepository,
    val onEventCreated: () -> Unit
) : CreateEventComponent, PaymentProcessor(), ComponentContext by componentContext {
    private val navigation = StackNavigation<Config>()
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    private val _newEventState: MutableStateFlow<EventAbs> = MutableStateFlow(EventImp())
    override val newEventState = _newEventState.asStateFlow()

    override val defaultEvent =
        MutableStateFlow(
            EventWithRelations(
                EventImp(),
                userRepository.currentUser.value.getOrThrow()
            )
        )

    private val _currentEventType = MutableStateFlow(EventType.EVENT)
    override val currentEventType = _currentEventType.asStateFlow()

    private val _canProceed = MutableStateFlow(false)
    override val canProceed = _canProceed.asStateFlow()

    private val _selectedPlace = MutableStateFlow<MVPPlace?>(null)
    override val selectedPlace = _selectedPlace.asStateFlow()

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()

    private val _addUserToEvent = MutableStateFlow(false)

    override val currentUser = userRepository.currentUser.map { it.getOrThrow() }
        .stateIn(scope, SharingStarted.Eagerly, null)

    private val _fieldCount = MutableStateFlow(0)

    private lateinit var loadingHandler: LoadingHandler

    override fun setLoadingHandler(loadingHandler: LoadingHandler) {
        this.loadingHandler = loadingHandler
    }

    override val childStack = childStack(
        source = navigation,
        initialConfiguration = Config.EventInfo,
        serializer = Config.serializer(),
        handleBackButton = true,
        childFactory = ::createChild
    )

    init {
        childStack.subscribe {}
        scope.launch {
            userRepository.currentUser.collect { currentUser ->
                updateEventField { copy(hostId = currentUser.getOrThrow().id) }
                updateTournamentField { copy(hostId = currentUser.getOrThrow().id) }
            }
        }
    }

    override fun nextStep() {
        navigation.pushNew(Config.Preview)
    }

    override fun previousStep() {
        navigation.pop()
    }

    override fun createEvent() {
        scope.launch {
            loadingHandler.showLoading("Creating event...")
            eventRepository.createEvent(newEventState.value).onSuccess {
                onEventCreated()
                if (_fieldCount.value > 0) {
                    fieldRepository.createFields(newEventState.value.id, _fieldCount.value)
                }
            }.onFailure {
                _errorState.value = ErrorMessage(it.message ?: "")
            }
            loadingHandler.hideLoading()
        }
    }

    override fun createAccount() {
        scope.launch {
            handleStripeAccountCreation()
        }
    }

    override fun updateEventField(update: EventImp.() -> EventImp) {
        when (_newEventState.value) {
            is EventImp -> _newEventState.value = (_newEventState.value as EventImp).update()
            is Tournament -> _newEventState.value =
                (_newEventState.value as Tournament).updateTournamentFromEvent(
                    (_newEventState.value as Tournament).toEvent().update()
                )
        }
    }

    private suspend fun handleStripeAccountCreation() {
        billingRepository.createAccount().onSuccess { onboardingUrl ->
            urlHandler?.openUrlInWebView(
                url = onboardingUrl,
            )
        }.onFailure { error ->
            _errorState.value = ErrorMessage(error.message ?: "")
        }
    }

    override fun updateTournamentField(update: Tournament.() -> Tournament) {
        if (_newEventState.value is Tournament) {
            _newEventState.value = (_newEventState.value as Tournament).update()
        }
    }

    override fun onTypeSelected(type: EventType) {
        _newEventState.value = when (type) {
            EventType.TOURNAMENT -> {
                Tournament().updateTournamentFromEvent(_newEventState.value as EventImp)
            }

            EventType.EVENT -> {
                (_newEventState.value as Tournament).toEvent()
            }
        }
    }

    override fun selectPlace(place: MVPPlace?) {
        _selectedPlace.value = place
        updateEventField {
            copy(
                lat = place?.lat ?: 0.0,
                long = place?.long ?: 0.0,
                location = place?.name ?: ""
            )
        }
    }

    override fun validateAndUpdatePrice(input: String, onError: (Boolean) -> Unit) {
        val amount = input.toDoubleOrNull()
        if (amount == null || amount < 0) {
            onError(true)
        } else {
            updateEventField { copy(price = amount) }
            onError(false)
        }
    }

    override fun addUserToEvent(add: Boolean) {
        _addUserToEvent.value = add
        if (add) {
            updateEventField { copy(playerIds = listOf(currentUser.value?.id!!)) }
        } else {
            updateEventField { copy(playerIds = listOf()) }
        }
    }

    override fun validateAndUpdateTeamSize(input: String, onError: (Boolean) -> Unit) {
        val teamSize = input.toIntOrNull()
        if (teamSize == null || teamSize !in 2..6) {
            onError(true)
        } else {
            updateEventField { copy(teamSizeLimit = teamSize) }
            onError(false)
        }
    }

    override fun validateAndUpdateMaxPlayers(input: String, onError: (Boolean) -> Unit) {
        val players = input.toIntOrNull()
        if (players == null || players <= 0) {
            onError(true)
        } else {
            updateEventField { copy(maxParticipants = players) }
            onError(false)
        }
    }

    override fun selectFieldCount(count: Int) {
        _fieldCount.value = count
    }

    private fun createChild(
        config: Config,
        componentContext: ComponentContext
    ): Child = when (config) {
        is Config.EventInfo -> Child.EventInfo
        is Config.Preview -> Child.Preview
    }
}