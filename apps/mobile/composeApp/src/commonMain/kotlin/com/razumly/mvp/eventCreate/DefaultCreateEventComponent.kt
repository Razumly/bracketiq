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
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.IImagesRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentResult
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.presentation.RentalCreateContext
import com.razumly.mvp.core.presentation.util.convertPhotoResultToUploadFile
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.eventCreate.CreateEventComponent.Child
import com.razumly.mvp.eventCreate.CreateEventComponent.Config
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
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
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

interface CreateEventComponent : IPaymentProcessor, ComponentContext {
    val newEventState: StateFlow<Event>
    val currentEventType: StateFlow<EventType>
    val childStack: Value<ChildStack<Config, Child>>
    val canProceed: StateFlow<Boolean>
    val selectedPlace: StateFlow<MVPPlace?>
    val defaultEvent: StateFlow<EventWithRelations>
    val currentUser: StateFlow<UserData?>
    val errorState: StateFlow<ErrorMessage?>
    val eventImageUrls: StateFlow<List<String>>
    val isRentalFlow: StateFlow<Boolean>

    fun onBackClicked()
    fun updateEventField(update: Event.() -> Event)
    fun updateTournamentField(update: Event.() -> Event)
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
    fun onUploadSelected(photo: GalleryPhotoResult)
    fun deleteImage(url: String)

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
    private val eventRepository: IEventRepository,
    private val fieldRepository: IFieldRepository,
    private val billingRepository: IBillingRepository,
    private val imageRepository: IImagesRepository,
    private val rentalContext: RentalCreateContext?,
    val onEventCreated: () -> Unit
) : CreateEventComponent, PaymentProcessor(), ComponentContext by componentContext {
    private val navigation = StackNavigation<Config>()
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    private val _newEventState: MutableStateFlow<Event> = MutableStateFlow(Event())
    override val newEventState = _newEventState.asStateFlow()

    override val defaultEvent =
        MutableStateFlow(
            EventWithRelations(
                Event(),
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

    override val eventImageUrls = imageRepository
        .getUserImageIdsFlow()
        .stateIn(scope, SharingStarted.Eagerly, emptyList())
    private val _isRentalFlow = MutableStateFlow(rentalContext != null)
    override val isRentalFlow = _isRentalFlow.asStateFlow()
    private val _fieldCount = MutableStateFlow(0)
    private val pendingEventAfterPayment = MutableStateFlow<Event?>(null)
    private val awaitingRentalPayment = MutableStateFlow(false)

    private lateinit var loadingHandler: LoadingHandler

    override fun setLoadingHandler(loadingHandler: LoadingHandler) {
        this.loadingHandler = loadingHandler
    }

    override fun onBackClicked() {
        if (childStack.value.backStack.isNotEmpty()) {
            navigation.pop()
        }
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
        applyRentalDefaults()
        scope.launch {
            userRepository.currentUser.collect { currentUser ->
                updateEventField { copy(hostId = currentUser.getOrThrow().id) }
                updateTournamentField { copy(hostId = currentUser.getOrThrow().id) }
            }
        }
        scope.launch {
            paymentResult.collect { result ->
                if (result == null || !awaitingRentalPayment.value) {
                    return@collect
                }

                clearPaymentResult()

                when (result) {
                    PaymentResult.Completed -> {
                        awaitingRentalPayment.value = false
                        val pendingEvent = pendingEventAfterPayment.value
                        pendingEventAfterPayment.value = null

                        if (pendingEvent != null) {
                            createEventAfterPayment(pendingEvent)
                        } else {
                            loadingHandler.hideLoading()
                        }
                    }

                    PaymentResult.Canceled -> {
                        awaitingRentalPayment.value = false
                        pendingEventAfterPayment.value = null
                        _errorState.value = ErrorMessage("Payment canceled.")
                        loadingHandler.hideLoading()
                    }

                    is PaymentResult.Failed -> {
                        awaitingRentalPayment.value = false
                        pendingEventAfterPayment.value = null
                        _errorState.value = ErrorMessage(result.error)
                        loadingHandler.hideLoading()
                    }
                }
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
            val eventDraft = newEventState.value
            if (_isRentalFlow.value) {
                processRentalPaymentBeforeCreate(eventDraft)
            } else {
                createEventAfterPayment(eventDraft)
            }
        }
    }

    override fun createAccount() {
        scope.launch {
            loadingHandler.showLoading("Getting stripe onboarding URL...")
            handleStripeAccountCreation()
            loadingHandler.hideLoading()
        }
    }

    override fun updateEventField(update: Event.() -> Event) {
        scope.launch {
            if (_newEventState.value is Event) {
                _newEventState.value = (_newEventState.value as Event).update()
            }
        }
    }

    override fun onUploadSelected(photo: GalleryPhotoResult) {
        scope.launch {
            loadingHandler.showLoading("Uploading image...")
            imageRepository.uploadImage(convertPhotoResultToUploadFile(photo))
            loadingHandler.hideLoading()
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

    override fun updateTournamentField(update: Event.() -> Event) {
        scope.launch {
            if (_newEventState.value is Event) {
                _newEventState.value = (_newEventState.value as Event).update()
            }
        }
    }

    override fun onTypeSelected(type: EventType) {
        _currentEventType.value = type
        updateEventField { copy(eventType = type) }
    }

    override fun selectPlace(place: MVPPlace?) {
        _selectedPlace.value = place
        updateEventField {
            copy(
                coordinates = place?.coordinates ?: listOf(0.0, 0.0),
                location = place?.name ?: ""
            )
        }
    }

    override fun validateAndUpdatePrice(input: String, onError: (Boolean) -> Unit) {
        val amount = input.toDoubleOrNull()
        if (amount == null || amount < 0) {
            onError(true)
        } else {
            updateEventField { copy(priceCents = (amount * 100).toInt()) }
            onError(false)
        }
    }

    override fun addUserToEvent(add: Boolean) {
        _addUserToEvent.value = add
        if (add) {
            updateEventField { copy(userIds = listOf(currentUser.value?.id!!)) }
        } else {
            updateEventField { copy(userIds = listOf()) }
        }
    }

    override fun deleteImage(url: String) {
        scope.launch {
            loadingHandler.showLoading("Deleting image...")
            imageRepository.deleteImage(url)
            loadingHandler.hideLoading()
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

    private fun applyRentalDefaults() {
        val context = rentalContext ?: return
        val now = Clock.System.now()
        val start = Instant.fromEpochMilliseconds(context.startEpochMillis)
        val end = Instant.fromEpochMilliseconds(context.endEpochMillis)
        val selectedFieldIds = context.selectedFieldIds.ifEmpty { context.organizationFieldIds }
        val selectedTimeSlotIds = context.selectedTimeSlotIds
        val normalizedEnd = if (end > start) {
            end
        } else {
            Instant.fromEpochMilliseconds(context.startEpochMillis + ONE_HOUR_MILLIS)
        }

        _newEventState.value = _newEventState.value.copy(
            name = _newEventState.value.name.ifBlank { "${context.organizationName} Rental Event" },
            location = context.organizationLocation ?: _newEventState.value.location,
            coordinates = context.organizationCoordinates ?: _newEventState.value.coordinates,
            organizationId = context.organizationId,
            fieldIds = selectedFieldIds,
            timeSlotIds = selectedTimeSlotIds,
            priceCents = if (context.rentalPriceCents > 0) {
                context.rentalPriceCents
            } else {
                _newEventState.value.priceCents
            },
            start = if (start == Instant.DISTANT_PAST) now else start,
            end = if (normalizedEnd == Instant.DISTANT_PAST) {
                Instant.fromEpochMilliseconds(now.toEpochMilliseconds() + ONE_HOUR_MILLIS)
            } else {
                normalizedEnd
            },
        )
    }

    private suspend fun processRentalPaymentBeforeCreate(eventDraft: Event) {
        if (eventDraft.priceCents <= 0) {
            _errorState.value = ErrorMessage("Set a rental price before continuing to payment.")
            return
        }

        loadingHandler.showLoading("Creating rental payment...")
        billingRepository.createPurchaseIntent(eventDraft)
            .onSuccess { intent ->
                clearPaymentResult()
                pendingEventAfterPayment.value = eventDraft
                awaitingRentalPayment.value = true
                runCatching {
                    setPaymentIntent(intent)
                    val account = userRepository.currentAccount.value.getOrThrow()
                    val user = userRepository.currentUser.value.getOrThrow()
                    loadingHandler.showLoading("Waiting for payment completion...")
                    presentPaymentSheet(account.email, user.fullName)
                }.onFailure { throwable ->
                    awaitingRentalPayment.value = false
                    pendingEventAfterPayment.value = null
                    _errorState.value = ErrorMessage(throwable.message ?: "Unable to start payment.")
                    loadingHandler.hideLoading()
                }
            }
            .onFailure { throwable ->
                _errorState.value = ErrorMessage(throwable.message ?: "Unable to create rental payment.")
                loadingHandler.hideLoading()
            }
    }

    private suspend fun createEventAfterPayment(eventDraft: Event) {
        loadingHandler.showLoading("Creating event...")
        val eventWithFields = if (_fieldCount.value > 0) {
            fieldRepository.createFields(
                count = _fieldCount.value,
                organizationId = eventDraft.organizationId
            ).fold(
                onSuccess = { createdFields ->
                    eventDraft.copy(fieldIds = createdFields.map { it.id })
                },
                onFailure = { error ->
                    _errorState.value = ErrorMessage(error.message ?: "")
                    eventDraft
                }
            )
        } else {
            eventDraft
        }

        eventRepository.createEvent(eventWithFields)
            .onSuccess {
                loadingHandler.hideLoading()
                onEventCreated()
            }
            .onFailure {
                _errorState.value = ErrorMessage(it.message ?: "")
                loadingHandler.hideLoading()
            }
    }

    private fun createChild(
        config: Config,
        componentContext: ComponentContext
    ): Child = when (config) {
        is Config.EventInfo -> Child.EventInfo
        is Config.Preview -> Child.Preview
    }

    companion object {
        private const val ONE_HOUR_MILLIS = 60L * 60L * 1000L
    }
}
