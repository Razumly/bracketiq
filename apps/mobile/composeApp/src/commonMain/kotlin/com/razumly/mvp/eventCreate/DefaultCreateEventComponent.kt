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
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.IImagesRepository
import com.razumly.mvp.core.data.repositories.ISportsRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentResult
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.presentation.RentalCreateContext
import com.razumly.mvp.core.presentation.util.convertPhotoResultToUploadFile
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.eventCreate.CreateEventComponent.Child
import com.razumly.mvp.eventCreate.CreateEventComponent.Config
import com.razumly.mvp.eventDetail.data.IMatchRepository
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
import kotlin.time.Duration.Companion.seconds
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
    val sports: StateFlow<List<Sport>>
    val localFields: StateFlow<List<Field>>
    val leagueSlots: StateFlow<List<TimeSlot>>
    val leagueScoringConfig: StateFlow<LeagueScoringConfigDTO>
    val suggestedUsers: StateFlow<List<UserData>>

    fun onBackClicked()
    fun updateEventField(update: Event.() -> Event)
    fun updateTournamentField(update: Event.() -> Event)
    fun updateHostId(hostId: String)
    fun updateAssistantHostIds(assistantHostIds: List<String>)
    fun updateDoTeamsRef(doTeamsRef: Boolean)
    fun updateTeamRefsMaySwap(teamRefsMaySwap: Boolean)
    fun addRefereeId(refereeId: String)
    fun removeRefereeId(refereeId: String)
    fun setPaymentPlansEnabled(enabled: Boolean)
    fun setInstallmentCount(count: Int)
    fun updateInstallmentAmount(index: Int, amountCents: Int)
    fun updateInstallmentDueDate(index: Int, dueDate: String)
    fun addInstallmentRow()
    fun removeInstallmentRow(index: Int)
    fun searchUsers(query: String)
    suspend fun ensureUserByEmail(email: String): Result<UserData>
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
    fun updateLocalFieldName(index: Int, name: String)
    fun updateLocalFieldDivisions(index: Int, divisions: List<String>)
    fun addLeagueTimeSlot()
    fun updateLeagueTimeSlot(index: Int, update: TimeSlot.() -> TimeSlot)
    fun removeLeagueTimeSlot(index: Int)
    fun updateLeagueScoringConfig(update: LeagueScoringConfigDTO.() -> LeagueScoringConfigDTO)
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
    private val matchRepository: IMatchRepository,
    private val fieldRepository: IFieldRepository,
    private val sportsRepository: ISportsRepository,
    private val billingRepository: IBillingRepository,
    private val imageRepository: IImagesRepository,
    private val rentalContext: RentalCreateContext?,
    val onEventCreated: (Event) -> Unit
) : CreateEventComponent, PaymentProcessor(), ComponentContext by componentContext {
    private val navigation = StackNavigation<Config>()
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())
    private val initialEventDraft = createInitialEventDraft()

    private val _newEventState: MutableStateFlow<Event> = MutableStateFlow(initialEventDraft)
    override val newEventState = _newEventState.asStateFlow()

    override val defaultEvent =
        MutableStateFlow(
            EventWithRelations(
                initialEventDraft,
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
    private val _suggestedUsers = MutableStateFlow<List<UserData>>(emptyList())
    override val suggestedUsers = _suggestedUsers.asStateFlow()

    override val eventImageUrls = imageRepository
        .getUserImageIdsFlow()
        .stateIn(scope, SharingStarted.Eagerly, emptyList())
    private val _isRentalFlow = MutableStateFlow(rentalContext != null)
    override val isRentalFlow = _isRentalFlow.asStateFlow()
    private val _sports = MutableStateFlow<List<Sport>>(emptyList())
    override val sports = _sports.asStateFlow()
    private val _localFields = MutableStateFlow<List<Field>>(emptyList())
    override val localFields = _localFields.asStateFlow()
    private val _leagueSlots = MutableStateFlow<List<TimeSlot>>(emptyList())
    override val leagueSlots = _leagueSlots.asStateFlow()
    private val _leagueScoringConfig = MutableStateFlow(LeagueScoringConfigDTO())
    override val leagueScoringConfig = _leagueScoringConfig.asStateFlow()
    private val _fieldCount = MutableStateFlow(0)
    private val pendingEventAfterPayment = MutableStateFlow<Event?>(null)
    private val awaitingRentalPayment = MutableStateFlow(false)
    private var activeRentalLockKeys: List<String> = emptyList()

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
        loadSports()
        scope.launch {
            userRepository.currentUser.collect { currentUser ->
                updateHostId(currentUser.getOrThrow().id)
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
                        releaseRentalCheckoutLocks()
                        _errorState.value = ErrorMessage("Payment canceled.")
                        loadingHandler.hideLoading()
                    }

                    is PaymentResult.Failed -> {
                        awaitingRentalPayment.value = false
                        pendingEventAfterPayment.value = null
                        releaseRentalCheckoutLocks()
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
            val eventDraft = applyRentalConstraints(
                newEventState.value.applyCreateSelectionRules(_isRentalFlow.value)
            )
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
            val previous = _newEventState.value
            val updated = previous
                .update()
                .applyCreateSelectionRules(_isRentalFlow.value)
                .withSportRules()
            val normalized = applyRentalConstraints(updated)
            val sportChanged = previous.sportId != normalized.sportId

            _newEventState.value = normalized
            if (sportChanged) {
                _leagueScoringConfig.value = defaultLeagueScoringConfigForSport(normalized.sportId)
            }
            syncLocalFieldsForEvent(normalized)
        }
    }

    private fun updateEventFieldWithoutSelectionRules(update: Event.() -> Event) {
        scope.launch {
            val previous = _newEventState.value
            val updated = previous
                .update()
                .withSportRules()
            val normalized = applyRentalConstraints(updated)
            val sportChanged = previous.sportId != normalized.sportId

            _newEventState.value = normalized
            if (sportChanged) {
                _leagueScoringConfig.value = defaultLeagueScoringConfigForSport(normalized.sportId)
            }
            syncLocalFieldsForEvent(normalized)
        }
    }

    override fun onUploadSelected(photo: GalleryPhotoResult) {
        scope.launch {
            loadingHandler.showLoading("Uploading image...")
            try {
                val uploadedImageId = imageRepository.uploadImage(
                    convertPhotoResultToUploadFile(photo)
                ).getOrThrow()

                updateEventField {
                    copy(imageId = uploadedImageId)
                }
            } catch (error: Throwable) {
                _errorState.value = ErrorMessage(error.message ?: "Failed to upload image.")
            } finally {
                loadingHandler.hideLoading()
            }
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
            val previous = _newEventState.value
            val updated = previous
                .update()
                .applyCreateSelectionRules(_isRentalFlow.value)
                .withSportRules()
            val normalized = applyRentalConstraints(updated)

            _newEventState.value = normalized
            syncLocalFieldsForEvent(normalized)
        }
    }

    override fun updateHostId(hostId: String) {
        val normalizedHostId = hostId.trim()
        if (normalizedHostId.isEmpty()) return
        updateEventField {
            copy(
                hostId = normalizedHostId,
                assistantHostIds = assistantHostIds
                    .normalizeDistinctIds()
                    .filterNot { assistantHostId -> assistantHostId == normalizedHostId },
            )
        }
    }

    override fun updateAssistantHostIds(assistantHostIds: List<String>) {
        updateEventField {
            val normalizedHostId = hostId.trim()
            copy(
                assistantHostIds = assistantHostIds
                    .normalizeDistinctIds()
                    .filterNot { assistantHostId -> assistantHostId == normalizedHostId },
            )
        }
    }

    override fun updateDoTeamsRef(doTeamsRef: Boolean) {
        updateEventField {
            copy(
                doTeamsRef = doTeamsRef,
                teamRefsMaySwap = if (doTeamsRef) teamRefsMaySwap else false,
            )
        }
    }

    override fun updateTeamRefsMaySwap(teamRefsMaySwap: Boolean) {
        updateEventField {
            copy(
                teamRefsMaySwap = if (doTeamsRef == true) teamRefsMaySwap else false,
            )
        }
    }

    override fun addRefereeId(refereeId: String) {
        val normalizedRefereeId = refereeId.trim()
        if (normalizedRefereeId.isEmpty()) return
        updateEventField {
            copy(refereeIds = (refereeIds + normalizedRefereeId).normalizeDistinctIds())
        }
    }

    override fun removeRefereeId(refereeId: String) {
        val normalizedRefereeId = refereeId.trim()
        if (normalizedRefereeId.isEmpty()) return
        updateEventField {
            copy(refereeIds = refereeIds.filterNot { existingId -> existingId == normalizedRefereeId })
        }
    }

    override fun setPaymentPlansEnabled(enabled: Boolean) {
        updateEventFieldWithoutSelectionRules {
            if (!enabled) {
                copy(
                    allowPaymentPlans = false,
                    installmentCount = null,
                    installmentDueDates = emptyList(),
                    installmentAmounts = emptyList(),
                )
            } else {
                val targetCount = currentInstallmentCount().coerceAtLeast(1)
                val (amounts, dueDates) = normalizeInstallments(targetCount)
                copy(
                    allowPaymentPlans = true,
                    installmentCount = targetCount,
                    installmentDueDates = dueDates,
                    installmentAmounts = amounts,
                )
            }
        }
    }

    override fun setInstallmentCount(count: Int) {
        val targetCount = count.coerceAtLeast(1)
        updateEventFieldWithoutSelectionRules {
            val (amounts, dueDates) = normalizeInstallments(targetCount)
            copy(
                allowPaymentPlans = true,
                installmentCount = targetCount,
                installmentDueDates = dueDates,
                installmentAmounts = amounts,
            )
        }
    }

    override fun updateInstallmentAmount(index: Int, amountCents: Int) {
        if (index < 0) return
        updateEventFieldWithoutSelectionRules {
            val targetCount = currentInstallmentCount().coerceAtLeast(index + 1).coerceAtLeast(1)
            val (amounts, dueDates) = normalizeInstallments(targetCount)
            if (index !in amounts.indices) {
                return@updateEventFieldWithoutSelectionRules this
            }
            val updatedAmounts = amounts.toMutableList().apply {
                this[index] = amountCents.coerceAtLeast(0)
            }
            copy(
                allowPaymentPlans = true,
                installmentCount = targetCount,
                installmentAmounts = updatedAmounts,
                installmentDueDates = dueDates,
            )
        }
    }

    override fun updateInstallmentDueDate(index: Int, dueDate: String) {
        if (index < 0) return
        updateEventFieldWithoutSelectionRules {
            val targetCount = currentInstallmentCount().coerceAtLeast(index + 1).coerceAtLeast(1)
            val (amounts, dueDates) = normalizeInstallments(targetCount)
            if (index !in dueDates.indices) {
                return@updateEventFieldWithoutSelectionRules this
            }
            val updatedDueDates = dueDates.toMutableList().apply {
                this[index] = dueDate.trim()
            }
            copy(
                allowPaymentPlans = true,
                installmentCount = targetCount,
                installmentAmounts = amounts,
                installmentDueDates = updatedDueDates,
            )
        }
    }

    override fun addInstallmentRow() {
        updateEventFieldWithoutSelectionRules {
            val targetCount = currentInstallmentCount().coerceAtLeast(0) + 1
            val (amounts, dueDates) = normalizeInstallments(targetCount)
            copy(
                allowPaymentPlans = true,
                installmentCount = targetCount,
                installmentAmounts = amounts,
                installmentDueDates = dueDates,
            )
        }
    }

    override fun removeInstallmentRow(index: Int) {
        if (index < 0) return
        updateEventFieldWithoutSelectionRules {
            val targetCount = currentInstallmentCount().coerceAtLeast(1)
            val (amounts, dueDates) = normalizeInstallments(targetCount)
            if (index !in amounts.indices || index !in dueDates.indices) {
                return@updateEventFieldWithoutSelectionRules this
            }
            val updatedAmounts = amounts.toMutableList().apply { removeAt(index) }
            val updatedDueDates = dueDates.toMutableList().apply { removeAt(index) }
            if (updatedAmounts.isEmpty()) {
                copy(
                    allowPaymentPlans = false,
                    installmentCount = null,
                    installmentAmounts = emptyList(),
                    installmentDueDates = emptyList(),
                )
            } else {
                copy(
                    allowPaymentPlans = true,
                    installmentCount = updatedAmounts.size,
                    installmentAmounts = updatedAmounts,
                    installmentDueDates = updatedDueDates,
                )
            }
        }
    }

    override fun searchUsers(query: String) {
        val normalizedQuery = query.trim()
        if (normalizedQuery.isEmpty()) {
            _suggestedUsers.value = emptyList()
            return
        }

        scope.launch {
            _suggestedUsers.value = userRepository.searchPlayers(normalizedQuery)
                .getOrElse { error ->
                    _errorState.value = ErrorMessage(error.message ?: "Unable to search users.")
                    emptyList()
                }
                .filterNot { suggested -> suggested.id == _newEventState.value.hostId }
        }
    }

    override suspend fun ensureUserByEmail(email: String): Result<UserData> {
        val normalizedEmail = email.trim()
        if (normalizedEmail.isEmpty()) {
            return Result.failure(IllegalArgumentException("Email is required."))
        }

        return userRepository.ensureUserByEmail(normalizedEmail)
            .onFailure { error ->
                _errorState.value = ErrorMessage(error.message ?: "Unable to invite by email.")
            }
    }

    override fun onTypeSelected(type: EventType) {
        _currentEventType.value = type
        updateEventField {
            when (type) {
                EventType.LEAGUE, EventType.TOURNAMENT -> copy(
                    eventType = type,
                    teamSignup = true,
                    singleDivision = true,
                    noFixedEndDateTime = true,
                )

                EventType.EVENT -> copy(
                    eventType = type,
                    noFixedEndDateTime = false,
                    end = end.takeIf { it > start } ?: defaultEventEnd(start),
                )
            }
        }
        if (type == EventType.LEAGUE || type == EventType.TOURNAMENT) {
            if (_fieldCount.value <= 0) {
                val selectedCount = (newEventState.value.fieldCount ?: 1).coerceAtLeast(1)
                selectFieldCount(selectedCount)
            }
        }
        if ((type == EventType.LEAGUE || type == EventType.TOURNAMENT) && _leagueSlots.value.isEmpty()) {
            _leagueSlots.value = listOf(createDefaultLeagueSlot())
        }
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
        if (teamSize == null || teamSize < 1) {
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
        val normalized = count.coerceAtLeast(0)
        _fieldCount.value = normalized
        updateEventField {
            copy(fieldCount = normalized.takeIf { it > 0 })
        }

        val currentEvent = newEventState.value
        val currentFields = _localFields.value
        val resized = currentFields
            .take(normalized)
            .mapIndexed { index, field ->
                field.copy(
                    id = if (field.id.isBlank()) newId() else field.id,
                    fieldNumber = index + 1,
                    divisions = field.divisions
                        .normalizeDivisionIdentifiers()
                        .ifEmpty { defaultFieldDivisions(currentEvent) },
                    organizationId = currentEvent.organizationId,
                )
            }
            .toMutableList()

        while (resized.size < normalized) {
            val fieldNumber = resized.size + 1
            resized += Field(
                fieldNumber = fieldNumber,
                organizationId = currentEvent.organizationId,
                id = newId(),
            ).copy(
                name = "Field $fieldNumber",
                divisions = defaultFieldDivisions(currentEvent),
            )
        }
        _localFields.value = resized

        val validFieldIds = resized.map { it.id }.toSet()
        _leagueSlots.value = _leagueSlots.value.map { slot ->
            val remainingFieldIds = slot.normalizedScheduledFieldIds().filter(validFieldIds::contains)
            slot.copy(
                scheduledFieldId = remainingFieldIds.firstOrNull(),
                scheduledFieldIds = remainingFieldIds,
            )
        }
    }

    override fun updateLocalFieldName(index: Int, name: String) {
        val fields = _localFields.value.toMutableList()
        if (index !in fields.indices) return
        fields[index] = fields[index].copy(name = name)
        _localFields.value = fields
    }

    override fun updateLocalFieldDivisions(index: Int, divisions: List<String>) {
        val fields = _localFields.value.toMutableList()
        if (index !in fields.indices) return
        fields[index] = fields[index].copy(
            // Keep explicit empties so fallback resolves against the latest event divisions
            // when fields are synchronized or finalized for creation.
            divisions = divisions.normalizeDivisionIdentifiers()
        )
        _localFields.value = fields
    }

    override fun addLeagueTimeSlot() {
        _leagueSlots.value = _leagueSlots.value + createDefaultLeagueSlot()
    }

    override fun updateLeagueTimeSlot(index: Int, update: TimeSlot.() -> TimeSlot) {
        val slots = _leagueSlots.value.toMutableList()
        if (index !in slots.indices) return
        slots[index] = slots[index].update()
        _leagueSlots.value = slots
    }

    override fun removeLeagueTimeSlot(index: Int) {
        val slots = _leagueSlots.value.toMutableList()
        if (index !in slots.indices) return
        slots.removeAt(index)
        _leagueSlots.value = slots
    }

    override fun updateLeagueScoringConfig(update: LeagueScoringConfigDTO.() -> LeagueScoringConfigDTO) {
        _leagueScoringConfig.value = _leagueScoringConfig.value.update()
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

        _newEventState.value = applyRentalConstraints(_newEventState.value.copy(
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
        ).applyCreateSelectionRules(_isRentalFlow.value))
    }

    private fun rentalRequiredTemplateIds(): List<String> {
        return rentalContext?.requiredTemplateIds
            ?.map { templateId -> templateId.trim() }
            ?.filter { templateId -> templateId.isNotEmpty() }
            ?.distinct()
            ?: emptyList()
    }

    private fun applyRentalConstraints(event: Event): Event {
        if (!_isRentalFlow.value) {
            return event
        }
        val context = rentalContext ?: return event

        val contextStart = Instant.fromEpochMilliseconds(context.startEpochMillis)
        val contextEnd = Instant.fromEpochMilliseconds(context.endEpochMillis)
        val normalizedStart = if (contextStart == Instant.DISTANT_PAST) {
            event.start
        } else {
            contextStart
        }
        val minimumEnd = Instant.fromEpochMilliseconds(normalizedStart.toEpochMilliseconds() + ONE_HOUR_MILLIS)
        val normalizedEnd = when {
            contextEnd > normalizedStart -> contextEnd
            event.end > normalizedStart -> event.end
            else -> minimumEnd
        }

        val lockedFieldIds = context.selectedFieldIds
            .ifEmpty { context.organizationFieldIds }
            .map { fieldId -> fieldId.trim() }
            .filter(String::isNotEmpty)
            .distinct()
        val lockedTimeSlotIds = context.selectedTimeSlotIds
            .map { slotId -> slotId.trim() }
            .filter(String::isNotEmpty)
            .distinct()
        val lockedPrice = context.rentalPriceCents.takeIf { it > 0 } ?: event.priceCents

        var next = event.copy(
            eventType = EventType.EVENT,
            noFixedEndDateTime = false,
            organizationId = context.organizationId,
            start = normalizedStart,
            end = normalizedEnd,
            priceCents = lockedPrice,
        )
        if (lockedFieldIds.isNotEmpty()) {
            next = next.copy(fieldIds = lockedFieldIds)
        }
        if (lockedTimeSlotIds.isNotEmpty()) {
            next = next.copy(timeSlotIds = lockedTimeSlotIds)
        }
        return next
    }

    private suspend fun processRentalPaymentBeforeCreate(eventDraft: Event) {
        if (eventDraft.priceCents <= 0) {
            _errorState.value = ErrorMessage("Set a rental price before continuing to payment.")
            return
        }

        if (!reserveRentalCheckoutLocks(eventDraft)) {
            _errorState.value = ErrorMessage(
                "Selected fields are temporarily locked. Please wait a few seconds and try again."
            )
            return
        }

        loadingHandler.showLoading("Checking field availability...")
        val overlappingEvents = findOverlappingRentalEvents(eventDraft)
            .getOrElse { throwable ->
                releaseRentalCheckoutLocks()
                _errorState.value = ErrorMessage(
                    throwable.message ?: "Unable to verify field availability."
                )
                loadingHandler.hideLoading()
                return
            }
        if (overlappingEvents.isNotEmpty()) {
            releaseRentalCheckoutLocks()
            _errorState.value = ErrorMessage(buildOverlapConflictMessage(overlappingEvents.first()))
            loadingHandler.hideLoading()
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
                    releaseRentalCheckoutLocks()
                    _errorState.value = ErrorMessage(throwable.message ?: "Unable to start payment.")
                    loadingHandler.hideLoading()
                }
            }
            .onFailure { throwable ->
                releaseRentalCheckoutLocks()
                _errorState.value = ErrorMessage(throwable.message ?: "Unable to create rental payment.")
                loadingHandler.hideLoading()
            }
    }

    private suspend fun createEventAfterPayment(eventDraft: Event) {
        loadingHandler.showLoading("Creating event...")
        val eventWithFields = prepareEventForCreation(eventDraft).getOrElse { error ->
            releaseRentalCheckoutLocks()
            _errorState.value = ErrorMessage(error.message ?: "Failed to prepare event setup.")
            loadingHandler.hideLoading()
            return
        }

        if (_isRentalFlow.value) {
            val overlappingEvents = findOverlappingRentalEvents(eventWithFields)
                .getOrElse { throwable ->
                    releaseRentalCheckoutLocks()
                    _errorState.value = ErrorMessage(
                        throwable.message ?: "Unable to recheck field availability."
                    )
                    loadingHandler.hideLoading()
                    return
                }

            if (overlappingEvents.isNotEmpty()) {
                releaseRentalCheckoutLocks()
                _errorState.value = ErrorMessage(buildOverlapConflictMessage(overlappingEvents.first()))
                loadingHandler.hideLoading()
                return
            }
        }

        eventRepository.createEvent(
            eventWithFields,
            requiredTemplateIds = rentalRequiredTemplateIds(),
            leagueScoringConfig = _leagueScoringConfig.value
                .takeIf { eventWithFields.eventType == EventType.LEAGUE },
        )
            .onSuccess { createdEvent ->
                releaseRentalCheckoutLocks()
                loadingHandler.hideLoading()
                onEventCreated(createdEvent)
            }
            .onFailure {
                releaseRentalCheckoutLocks()
                _errorState.value = ErrorMessage(it.message ?: "")
                loadingHandler.hideLoading()
            }
    }

    private suspend fun prepareEventForCreation(eventDraft: Event): Result<Event> = runCatching {
        var preparedEvent = eventDraft

        val shouldManageLocalFields = !_isRentalFlow.value &&
            (preparedEvent.eventType == EventType.LEAGUE || preparedEvent.eventType == EventType.TOURNAMENT) &&
            _fieldCount.value > 0

        val fieldIdReplacements = mutableMapOf<String, String>()
        if (shouldManageLocalFields) {
            val fieldDrafts = buildFieldDrafts(preparedEvent, _fieldCount.value)
            val createdFields = mutableListOf<Field>()
            fieldDrafts.forEach { draft ->
                val createdField = fieldRepository.createField(draft).getOrElse { error ->
                    throw IllegalStateException(
                        error.message ?: "Failed to create field ${draft.name ?: draft.fieldNumber}.",
                        error
                    )
                }
                createdFields += createdField
                fieldIdReplacements[draft.id] = createdField.id
            }
            preparedEvent = preparedEvent.copy(
                fieldIds = createdFields.map { it.id },
                fieldCount = createdFields.size,
            )
        }

        if (
            !_isRentalFlow.value &&
            (preparedEvent.eventType == EventType.LEAGUE || preparedEvent.eventType == EventType.TOURNAMENT)
        ) {
            val slotDrafts = buildLeagueSlotDrafts(
                event = preparedEvent,
                fieldIdReplacements = fieldIdReplacements,
            )

            if (slotDrafts.isNotEmpty()) {
                val createdSlots = mutableListOf<TimeSlot>()
                slotDrafts.forEach { slotDraft ->
                    val createdSlot = fieldRepository.createTimeSlot(slotDraft).getOrElse { error ->
                        throw IllegalStateException(
                            error.message ?: "Failed to create a schedule timeslot.",
                            error
                        )
                    }
                    createdSlots += createdSlot
                }
                preparedEvent = preparedEvent.copy(timeSlotIds = createdSlots.map { it.id })
            } else {
                preparedEvent = preparedEvent.copy(timeSlotIds = emptyList())
            }
        }

        preparedEvent
    }

    private fun buildFieldDrafts(event: Event, targetCount: Int): List<Field> {
        val normalizedCount = targetCount.coerceAtLeast(0)
        val drafts = _localFields.value
            .take(normalizedCount)
            .mapIndexed { index, field ->
                field.copy(
                    id = if (field.id.isBlank()) newId() else field.id,
                    fieldNumber = index + 1,
                    name = field.name?.takeIf { it.isNotBlank() } ?: "Field ${index + 1}",
                    divisions = field.divisions
                        .normalizeDivisionIdentifiers()
                        .ifEmpty { defaultFieldDivisions(event) },
                    organizationId = event.organizationId,
                )
            }
            .toMutableList()

        while (drafts.size < normalizedCount) {
            val number = drafts.size + 1
            drafts += Field(
                fieldNumber = number,
                organizationId = event.organizationId,
                id = newId(),
            ).copy(
                name = "Field $number",
                divisions = defaultFieldDivisions(event),
            )
        }

        return drafts
    }

    private fun buildLeagueSlotDrafts(
        event: Event,
        fieldIdReplacements: Map<String, String>,
    ): List<TimeSlot> {
        val selectedDivisionIds = event.divisions.normalizeDivisionIdentifiers()
            .ifEmpty { listOf(DEFAULT_DIVISION) }
        return _leagueSlots.value.flatMap { slot ->
            val mappedFieldIds = slot.normalizedScheduledFieldIds()
                .mapNotNull { fieldId ->
                    (fieldIdReplacements[fieldId] ?: fieldId).takeIf { it.isNotBlank() }
                }
                .distinct()
            val mappedDivisionIds = slot.normalizedDivisionIds()
                .mapNotNull { divisionId ->
                    divisionId.takeIf { it.isNotBlank() }
                }
                .distinct()
            val effectiveDivisionIds = if (event.singleDivision) {
                selectedDivisionIds
            } else {
                mappedDivisionIds.ifEmpty { selectedDivisionIds }
            }
            val normalizedDays = slot.normalizedDaysOfWeek()
            val startMinutes = slot.startTimeMinutes
            val endMinutes = slot.endTimeMinutes

            if (mappedFieldIds.isEmpty() || normalizedDays.isEmpty() || startMinutes == null || endMinutes == null) {
                return@flatMap emptyList()
            }
            if (endMinutes <= startMinutes) {
                return@flatMap emptyList()
            }

            val expandedSlots = mutableListOf<TimeSlot>()
            normalizedDays.forEachIndexed { dayIndex, day ->
                mappedFieldIds.forEachIndexed { fieldIndex, fieldId ->
                    expandedSlots += slot.copy(
                        id = if (normalizedDays.size == 1 && mappedFieldIds.size == 1 && dayIndex == 0 && fieldIndex == 0) {
                            slot.id.ifBlank { newId() }
                        } else {
                            newId()
                        },
                        dayOfWeek = day,
                        daysOfWeek = listOf(day),
                        divisions = effectiveDivisionIds,
                        scheduledFieldId = fieldId,
                        scheduledFieldIds = listOf(fieldId),
                        startDate = event.start,
                        endDate = event.end.takeIf { it > event.start },
                    )
                }
            }
            expandedSlots
        }
    }

    private fun syncLocalFieldsForEvent(event: Event) {
        val currentFields = _localFields.value
        if (currentFields.isEmpty()) return

        _localFields.value = currentFields.mapIndexed { index, field ->
            field.copy(
                fieldNumber = index + 1,
                divisions = field.divisions
                    .normalizeDivisionIdentifiers()
                    .ifEmpty { defaultFieldDivisions(event) },
                organizationId = event.organizationId,
            )
        }
    }

    private fun loadSports() {
        scope.launch {
            sportsRepository.getSports()
                .onSuccess { loadedSports ->
                    _sports.value = loadedSports
                    _newEventState.value = _newEventState.value.withSportRules()
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.message ?: "Failed to load sports.")
                }
        }
    }

    private fun usesSetScoringForSport(sportId: String?): Boolean = sportId
        ?.let { selectedSportId -> _sports.value.firstOrNull { it.id == selectedSportId } }
        ?.usePointsPerSetWin
        ?: false

    private fun defaultLeagueScoringConfigForSport(sportId: String?): LeagueScoringConfigDTO {
        val defaults = LeagueScoringConfigDTO()
        return if (usesSetScoringForSport(sportId)) {
            defaults.copy(
                pointsForWin = null,
                pointsForDraw = null,
                pointsForLoss = null,
            )
        } else {
            defaults.copy(
                pointsPerSetWin = null,
                pointsPerSetLoss = null,
            )
        }
    }

    private fun Event.withSportRules(): Event {
        val requiresSets = usesSetScoringForSport(sportId)
        return when (eventType) {
            EventType.EVENT -> this
            EventType.LEAGUE -> applyLeagueSportRules(requiresSets)
            EventType.TOURNAMENT -> applyTournamentSportRules(requiresSets)
        }
    }

    private fun Event.applyLeagueSportRules(requiresSets: Boolean): Event {
        return if (requiresSets) {
            val allowedSetCounts = setOf(1, 3, 5)
            val normalizedSets = setsPerMatch?.takeIf { allowedSetCounts.contains(it) } ?: 1
            val normalizedPoints = pointsToVictory
                .take(normalizedSets)
                .toMutableList()
                .apply {
                    while (size < normalizedSets) add(21)
                }
            copy(
                usesSets = true,
                setsPerMatch = normalizedSets,
                setDurationMinutes = setDurationMinutes ?: 20,
                pointsToVictory = normalizedPoints,
                matchDurationMinutes = 60,
            )
        } else {
            copy(
                usesSets = false,
                setsPerMatch = null,
                setDurationMinutes = null,
                pointsToVictory = emptyList(),
                matchDurationMinutes = matchDurationMinutes ?: 60,
                winnerSetCount = 1,
                loserSetCount = 1,
                winnerBracketPointsToVictory = winnerBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
                loserBracketPointsToVictory = loserBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
            )
        }
    }

    private fun Event.applyTournamentSportRules(requiresSets: Boolean): Event {
        return if (!requiresSets) {
            copy(
                winnerSetCount = 1,
                loserSetCount = 1,
                winnerBracketPointsToVictory = winnerBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
                loserBracketPointsToVictory = loserBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
            )
        } else {
            val allowedSetCounts = setOf(1, 3, 5)
            val winnerSets = winnerSetCount.takeIf { allowedSetCounts.contains(it) } ?: 1
            val loserSets = loserSetCount.takeIf { allowedSetCounts.contains(it) } ?: 1
            copy(
                winnerSetCount = winnerSets,
                loserSetCount = loserSets,
                winnerBracketPointsToVictory = winnerBracketPointsToVictory
                    .take(winnerSets)
                    .toMutableList()
                    .apply {
                        while (size < winnerSets) add(21)
                    },
                loserBracketPointsToVictory = loserBracketPointsToVictory
                    .take(loserSets)
                    .toMutableList()
                    .apply {
                        while (size < loserSets) add(21)
                    },
            )
        }
    }

    private fun createDefaultLeagueSlot(): TimeSlot {
        val event = newEventState.value
        val startDate = if (event.start == Instant.DISTANT_PAST) Clock.System.now() else event.start
        val endDate = event.end.takeIf { it > event.start }
        return TimeSlot(
            id = newId(),
            dayOfWeek = null,
            daysOfWeek = emptyList(),
            divisions = defaultFieldDivisions(event),
            startTimeMinutes = null,
            endTimeMinutes = null,
            startDate = startDate,
            repeating = true,
            endDate = endDate,
            scheduledFieldId = null,
            scheduledFieldIds = emptyList(),
            price = null,
        )
    }

    private fun defaultFieldDivisions(event: Event): List<String> {
        val eventDivisions = event.divisions.normalizeDivisionIdentifiers()
        return eventDivisions.ifEmpty { listOf(DEFAULT_DIVISION) }
    }

    private fun Event.currentInstallmentCount(): Int {
        return maxOf(
            installmentCount ?: 0,
            installmentAmounts.size,
            installmentDueDates.size,
        ).coerceAtLeast(0)
    }

    private fun Event.normalizeInstallments(targetCount: Int): Pair<List<Int>, List<String>> {
        val normalizedCount = targetCount.coerceAtLeast(0)
        val amounts = List(normalizedCount) { index ->
            installmentAmounts.getOrNull(index)?.coerceAtLeast(0) ?: 0
        }
        val dueDates = List(normalizedCount) { index ->
            installmentDueDates.getOrNull(index)?.trim().orEmpty()
        }
        return amounts to dueDates
    }

    private fun List<String>.normalizeDistinctIds(): List<String> {
        return this
            .map { value -> value.trim() }
            .filter(String::isNotBlank)
            .distinct()
    }

    private fun reserveRentalCheckoutLocks(eventDraft: Event): Boolean {
        if (!_isRentalFlow.value) {
            return true
        }

        val organizationId = eventDraft.organizationId?.trim().orEmpty()
        val fieldIds = eventDraft.fieldIds
            .map { fieldId -> fieldId.trim() }
            .filter(String::isNotBlank)
            .distinct()
        if (organizationId.isEmpty() || fieldIds.isEmpty()) {
            return true
        }
        if (eventDraft.end <= eventDraft.start) {
            return false
        }

        val now = Clock.System.now()
        val expiresAt = now + 10.seconds
        rentalCheckoutLocks.entries.removeAll { (_, lockExpiry) -> lockExpiry <= now }

        val lockKeys = fieldIds.map { fieldId ->
            buildRentalLockKey(
                organizationId = organizationId,
                fieldId = fieldId,
                start = eventDraft.start,
                end = eventDraft.end,
            )
        }
        val hasActiveLock = lockKeys.any { lockKey ->
            val lockExpiry = rentalCheckoutLocks[lockKey]
            lockExpiry != null && lockExpiry > now
        }
        if (hasActiveLock) {
            return false
        }

        lockKeys.forEach { lockKey ->
            rentalCheckoutLocks[lockKey] = expiresAt
        }
        activeRentalLockKeys = lockKeys
        return true
    }

    private fun releaseRentalCheckoutLocks() {
        if (activeRentalLockKeys.isEmpty()) {
            return
        }
        activeRentalLockKeys.forEach { lockKey ->
            rentalCheckoutLocks.remove(lockKey)
        }
        activeRentalLockKeys = emptyList()
    }

    private suspend fun findOverlappingRentalEvents(eventDraft: Event): Result<List<Event>> {
        val organizationId = eventDraft.organizationId?.trim().orEmpty()
        if (organizationId.isEmpty()) {
            return Result.success(emptyList())
        }

        val selectedFieldIds = eventDraft.fieldIds
            .map { fieldId -> fieldId.trim() }
            .filter(String::isNotBlank)
            .distinct()
        if (selectedFieldIds.isEmpty()) {
            return Result.success(emptyList())
        }
        if (eventDraft.end <= eventDraft.start) {
            return Result.failure(IllegalArgumentException("Selected rental time range is invalid."))
        }

        val selectedFieldSet = selectedFieldIds.toSet()
        return eventRepository.getEventsByOrganization(
            organizationId = organizationId,
            limit = 400,
        ).mapCatching { organizationEvents ->
            organizationEvents.filter { existingEvent ->
                existingEvent.id != eventDraft.id
            }.filter { existingEvent ->
                doesScheduledEventOverlapRentalWindow(
                    scheduledEvent = existingEvent,
                    selectedFieldSet = selectedFieldSet,
                    selectedStart = eventDraft.start,
                    selectedEnd = eventDraft.end,
                )
            }
        }
    }

    private suspend fun doesScheduledEventOverlapRentalWindow(
        scheduledEvent: Event,
        selectedFieldSet: Set<String>,
        selectedStart: Instant,
        selectedEnd: Instant,
    ): Boolean {
        if (selectedEnd <= selectedStart) {
            return false
        }

        return when (scheduledEvent.eventType) {
            EventType.EVENT -> {
                val eventFieldIds = scheduledEvent.fieldIds
                    .map { fieldId -> fieldId.trim() }
                    .filter(String::isNotBlank)
                    .distinct()
                if (eventFieldIds.intersect(selectedFieldSet).isEmpty()) {
                    false
                } else {
                    rangesOverlap(
                        firstStart = selectedStart,
                        firstEnd = selectedEnd,
                        secondStart = scheduledEvent.start,
                        secondEnd = scheduledEvent.end,
                    )
                }
            }

            EventType.LEAGUE, EventType.TOURNAMENT -> {
                val matches = matchRepository.getMatchesOfTournament(scheduledEvent.id).getOrElse { error ->
                    throw IllegalStateException(
                        "Failed to load matches for ${scheduledEvent.name.ifBlank { "event" }}: ${error.message}",
                        error
                    )
                }

                matches.any { match ->
                    val fieldId = match.fieldId?.trim()
                    val matchStart = match.start ?: return@any false
                    val matchEnd = match.end
                    !fieldId.isNullOrBlank() &&
                        selectedFieldSet.contains(fieldId) &&
                        matchEnd != null &&
                        matchEnd > matchStart &&
                        rangesOverlap(
                            firstStart = selectedStart,
                            firstEnd = selectedEnd,
                            secondStart = matchStart,
                            secondEnd = matchEnd,
                        )
                }
            }
        }
    }

    private fun buildOverlapConflictMessage(existingEvent: Event): String {
        val eventName = existingEvent.name.ifBlank { "Another event" }
        return "$eventName was registered for one of these fields and times. Checkout was stopped; choose different slots."
    }

    private fun buildRentalLockKey(
        organizationId: String,
        fieldId: String,
        start: Instant,
        end: Instant,
    ): String {
        return "$organizationId:$fieldId:${start.toEpochMilliseconds()}:${end.toEpochMilliseconds()}"
    }

    private fun rangesOverlap(
        firstStart: Instant,
        firstEnd: Instant,
        secondStart: Instant,
        secondEnd: Instant,
    ): Boolean {
        if (firstEnd <= firstStart || secondEnd <= secondStart) {
            return false
        }
        return firstStart < secondEnd && secondStart < firstEnd
    }

    private fun createInitialEventDraft(now: Instant = Clock.System.now()): Event {
        val start = roundedStartAtLeastOneHourFrom(now)
        return Event(
            start = start,
            end = defaultEventEnd(start),
        )
    }

    private fun roundedStartAtLeastOneHourFrom(now: Instant): Instant {
        val earliestStartMillis = now.toEpochMilliseconds() + ONE_HOUR_MILLIS
        val roundedMillis =
            ((earliestStartMillis + ONE_HOUR_MILLIS - 1) / ONE_HOUR_MILLIS) * ONE_HOUR_MILLIS
        return Instant.fromEpochMilliseconds(roundedMillis)
    }

    private fun defaultEventEnd(start: Instant): Instant {
        return Instant.fromEpochMilliseconds(start.toEpochMilliseconds() + ONE_HOUR_MILLIS)
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
        private val rentalCheckoutLocks = mutableMapOf<String, Instant>()
    }
}
