@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.pop
import com.arkivanov.decompose.router.stack.pushNew
import com.arkivanov.decompose.value.Value
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameters
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.addOfficialUser
import com.razumly.mvp.core.data.dataTypes.removeOfficialPosition
import com.razumly.mvp.core.data.dataTypes.removeOfficialUser
import com.razumly.mvp.core.data.dataTypes.shouldReplaceOfficialPositionsWithSportDefaults
import com.razumly.mvp.core.data.dataTypes.syncEventTypeTagsForEventType
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
import com.razumly.mvp.core.data.dataTypes.usesTeamOfficialScheduling
import com.razumly.mvp.core.data.dataTypes.withDoTeamsOfficiate
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.ChatTermsConsentState
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.IImagesRepository
import com.razumly.mvp.core.data.repositories.SeededEventTemplateDraft
import com.razumly.mvp.core.data.repositories.RentalResourceOption
import com.razumly.mvp.core.data.repositories.ISportsRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.presentation.util.convertPhotoResultToUploadFile
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.core.util.resolvedTimeZone
import com.razumly.mvp.core.util.toTimeZoneOrUtc
import com.razumly.mvp.eventCreate.CreateEventComponent.Child
import com.razumly.mvp.eventCreate.CreateEventComponent.Config
import com.razumly.mvp.eventDetail.assignedUserIdsForRole
import com.razumly.mvp.eventDetail.conflictListLabel
import com.razumly.mvp.eventDetail.EventStaffRole
import com.razumly.mvp.eventDetail.PendingStaffInviteDraft
import com.razumly.mvp.eventDetail.mergePendingStaffInviteDraft
import com.razumly.mvp.eventDetail.normalizeStaffInviteEmail
import com.razumly.mvp.eventDetail.reconcileEventStaffInvites
import com.razumly.mvp.eventDetail.resolveEffectiveLeagueSlotDivisionIds
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.toLocalDateTime
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
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
    val sports: StateFlow<List<Sport>>
    val eventTags: StateFlow<List<EventTag>>
    val divisionTypeParameters: StateFlow<DivisionTypeParameters>
    val organizationTemplates: StateFlow<List<OrganizationTemplateDocument>>
    val organizationTemplatesLoading: StateFlow<Boolean>
    val organizationTemplatesError: StateFlow<String?>
    val localFields: StateFlow<List<Field>>
    val leagueSlots: StateFlow<List<TimeSlot>>
    val useManualTimeSlots: StateFlow<Boolean>
    val availableRentalResources: StateFlow<List<RentalResourceOption>>
    val selectedRentalResourceIds: StateFlow<Set<String>>
    val leagueScoringConfig: StateFlow<LeagueScoringConfigDTO>
    val suggestedUsers: StateFlow<List<UserData>>
    val pendingStaffInvites: StateFlow<List<PendingStaffInviteDraft>>
    val termsConsentState: StateFlow<ChatTermsConsentState>
    val termsConsentLoading: StateFlow<Boolean>

    fun onBackClicked()
    fun updateEventField(update: Event.() -> Event)
    fun updateTournamentField(update: Event.() -> Event)
    fun updateHostId(hostId: String)
    fun updateAssistantHostIds(assistantHostIds: List<String>)
    fun updateDoTeamsOfficiate(doTeamsOfficiate: Boolean)
    fun updateTeamOfficialsMaySwap(teamOfficialsMaySwap: Boolean)
    fun addOfficialId(officialId: String)
    fun removeOfficialId(officialId: String)
    fun setPaymentPlansEnabled(enabled: Boolean)
    fun setInstallmentCount(count: Int)
    fun updateInstallmentAmount(index: Int, amountCents: Int)
    fun updateInstallmentDueDate(index: Int, dueDate: String)
    fun addInstallmentRow()
    fun removeInstallmentRow(index: Int)
    fun searchUsers(query: String)
    suspend fun ensureUserByEmail(email: String): Result<UserData>
    suspend fun addPendingStaffInvite(
        firstName: String,
        lastName: String,
        email: String,
        roles: Set<EventStaffRole>,
    ): Result<Unit>
    fun removePendingStaffInvite(email: String, role: EventStaffRole? = null)
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
    fun setRentalResourceSelected(optionId: String, selected: Boolean)
    fun setUseManualTimeSlots(enabled: Boolean)
    fun addLeagueTimeSlot()
    fun updateLeagueTimeSlot(index: Int, update: TimeSlot.() -> TimeSlot)
    fun removeLeagueTimeSlot(index: Int)
    fun updateLeagueScoringConfig(update: LeagueScoringConfigDTO.() -> LeagueScoringConfigDTO)
    fun createAccount()
    fun acceptTermsConsent()
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
    private val sportsRepository: ISportsRepository,
    private val billingRepository: IBillingRepository,
    private val imageRepository: IImagesRepository,
    private val initialSeed: SeededEventTemplateDraft? = null,
    val onEventCreated: (Event) -> Unit
) : CreateEventComponent, PaymentProcessor(), ComponentContext by componentContext {
    private val navigation = StackNavigation<Config>()
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())
    private val initialEventDraft = initialSeed?.event
        ?: createInitialEventDraft(initialHostId = resolveCurrentUserId())

    private val _newEventState: MutableStateFlow<Event> = MutableStateFlow(initialEventDraft)
    override val newEventState = _newEventState.asStateFlow()

    override val defaultEvent =
        MutableStateFlow(
            EventWithRelations(
                initialEventDraft,
                userRepository.currentUser.value.getOrNull() ?: UserData()
            )
        )

    private val _currentEventType = MutableStateFlow(initialEventDraft.eventType)
    override val currentEventType = _currentEventType.asStateFlow()

    private val _canProceed = MutableStateFlow(false)
    override val canProceed = _canProceed.asStateFlow()

    private val _selectedPlace = MutableStateFlow<MVPPlace?>(null)
    override val selectedPlace = _selectedPlace.asStateFlow()

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()
    private val _addUserToEvent = MutableStateFlow(false)

    override val currentUser = userRepository.currentUser.map { it.getOrNull() }
        .stateIn(scope, SharingStarted.Eagerly, null)
    private val _suggestedUsers = MutableStateFlow<List<UserData>>(emptyList())
    override val suggestedUsers = _suggestedUsers.asStateFlow()
    private val _pendingStaffInvites = MutableStateFlow<List<PendingStaffInviteDraft>>(emptyList())
    override val pendingStaffInvites = _pendingStaffInvites.asStateFlow()
    override val termsConsentState = userRepository.chatTermsConsentState
    override val termsConsentLoading = userRepository.chatTermsConsentLoading

    override val eventImageUrls = imageRepository
        .getUserImageIdsFlow()
        .stateIn(scope, SharingStarted.Eagerly, emptyList())
    private val _sports = MutableStateFlow<List<Sport>>(emptyList())
    override val sports = _sports.asStateFlow()
    private val _eventTags = MutableStateFlow<List<EventTag>>(emptyList())
    override val eventTags = _eventTags.asStateFlow()
    private val _divisionTypeParameters = MutableStateFlow(DivisionTypeParameters())
    override val divisionTypeParameters = _divisionTypeParameters.asStateFlow()
    private val _organizationTemplates = MutableStateFlow<List<OrganizationTemplateDocument>>(emptyList())
    override val organizationTemplates = _organizationTemplates.asStateFlow()
    private val _organizationTemplatesLoading = MutableStateFlow(false)
    override val organizationTemplatesLoading = _organizationTemplatesLoading.asStateFlow()
    private val _organizationTemplatesError = MutableStateFlow<String?>(null)
    override val organizationTemplatesError = _organizationTemplatesError.asStateFlow()
    private val _localFields = MutableStateFlow(initialSeed?.fields.orEmpty())
    override val localFields = _localFields.asStateFlow()
    private val _leagueSlots = MutableStateFlow(initialSeed?.timeSlots.orEmpty())
    override val leagueSlots = _leagueSlots.asStateFlow()
    private val _useManualTimeSlots = MutableStateFlow(initialSeed?.timeSlots?.isNotEmpty() == true)
    override val useManualTimeSlots = _useManualTimeSlots.asStateFlow()
    private val _availableRentalResources = MutableStateFlow<List<RentalResourceOption>>(emptyList())
    override val availableRentalResources = _availableRentalResources.asStateFlow()
    private val _selectedRentalResourceIds = MutableStateFlow<Set<String>>(emptySet())
    override val selectedRentalResourceIds = _selectedRentalResourceIds.asStateFlow()
    private val _leagueScoringConfig = MutableStateFlow(initialSeed?.leagueScoringConfig ?: LeagueScoringConfigDTO())
    override val leagueScoringConfig = _leagueScoringConfig.asStateFlow()
    private val _fieldCount = MutableStateFlow(initialSeed?.fields?.size ?: 0)
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
        loadSports()
        loadEventTags()
        loadAvailableRentalResources()
        scope.launch {
            _newEventState
                .map { draft -> draft.organizationId?.trim().orEmpty() }
                .distinctUntilChanged()
                .collect { organizationId ->
                    loadOrganizationTemplates(organizationId)
                }
        }
        scope.launch {
            userRepository.currentUser.collect { result ->
                result.getOrNull()?.let { user ->
                    val normalizedUserId = user.id.trim()
                    if (normalizedUserId.isNotEmpty()) {
                        val currentDraft = _newEventState.value
                        val syncedDraft = currentDraft.withRequiredHost(normalizedUserId)
                        if (syncedDraft != currentDraft) {
                            _newEventState.value = syncedDraft
                        }
                    }
                    defaultEvent.value = defaultEvent.value.copy(
                        host = user,
                        event = defaultEvent.value.event.withRequiredHost(user.id),
                    )
                }
            }
        }
    }

    override fun acceptTermsConsent() {
        scope.launch {
            userRepository.acceptChatTermsConsent()
                .onSuccess { }
                .onFailure { throwable ->
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Failed to record Terms and EULA consent.")
                    )
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
            val currentUserId = resolveCurrentUserId()
            if (currentUserId.isBlank()) {
                _errorState.value = ErrorMessage("Unable to create event until your user profile is ready.")
                return@launch
            }
            val hostSyncedDraft = newEventState.value.withRequiredHost(currentUserId)
            if (hostSyncedDraft != newEventState.value) {
                _newEventState.value = hostSyncedDraft
            }
            val eventDraft = hostSyncedDraft.applyCreateSelectionRules()
            val validationError = validateCreateEventDraft(eventDraft)
            if (validationError != null) {
                _errorState.value = ErrorMessage(validationError)
                return@launch
            }
            createEventAfterPayment(eventDraft)
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
                .applyCreateSelectionRules()
                .withSportRules()
            val normalized = syncOfficialStaffingForSportTransition(
                previous = previous,
                updated = updated,
            )
            val sportChanged = previous.sportId != normalized.sportId

            _newEventState.value = normalized
            if (sportChanged) {
                _leagueScoringConfig.value = defaultLeagueScoringConfigForSport(normalized.sportId)
            }
            syncLeagueSlotDefaultStartDates(previousEvent = previous, updatedEvent = normalized)
            syncLeagueSlotDefaultEndDates(previousEvent = previous, updatedEvent = normalized)
            syncLocalFieldsForEvent(previous, normalized)
        }
    }

    private fun updateEventFieldWithoutSelectionRules(update: Event.() -> Event) {
        scope.launch {
            val previous = _newEventState.value
            val updated = previous
                .update()
                .withSportRules()
            val normalized = syncOfficialStaffingForSportTransition(
                previous = previous,
                updated = updated,
            )
            val sportChanged = previous.sportId != normalized.sportId

            _newEventState.value = normalized
            if (sportChanged) {
                _leagueScoringConfig.value = defaultLeagueScoringConfigForSport(normalized.sportId)
            }
            syncLeagueSlotDefaultStartDates(previousEvent = previous, updatedEvent = normalized)
            syncLeagueSlotDefaultEndDates(previousEvent = previous, updatedEvent = normalized)
            syncLocalFieldsForEvent(previous, normalized)
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
                _errorState.value = ErrorMessage(error.userMessage("Failed to upload image."))
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
            _errorState.value = ErrorMessage(error.userMessage())
        }
    }

    override fun updateTournamentField(update: Event.() -> Event) {
        scope.launch {
            val previous = _newEventState.value
            val updated = previous
                .update()
                .applyCreateSelectionRules()
                .withSportRules()
            val normalized = syncOfficialStaffingForSportTransition(
                previous = previous,
                updated = updated,
            )

            _newEventState.value = normalized
            syncLeagueSlotDefaultStartDates(previousEvent = previous, updatedEvent = normalized)
            syncLeagueSlotDefaultEndDates(previousEvent = previous, updatedEvent = normalized)
            syncLocalFieldsForEvent(previous, normalized)
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

    override fun updateDoTeamsOfficiate(doTeamsOfficiate: Boolean) {
        updateEventField {
            withDoTeamsOfficiate(doTeamsOfficiate)
        }
    }

    override fun updateTeamOfficialsMaySwap(teamOfficialsMaySwap: Boolean) {
        updateEventField {
            copy(
                teamOfficialsMaySwap = if (usesTeamOfficialScheduling()) teamOfficialsMaySwap else false,
            )
        }
    }

    override fun addOfficialId(officialId: String) {
        val normalizedOfficialId = officialId.trim()
        if (normalizedOfficialId.isEmpty()) return
        updateEventField {
            addOfficialUser(
                userId = normalizedOfficialId,
                sport = resolveSport(sportId),
            )
        }
    }

    override fun removeOfficialId(officialId: String) {
        val normalizedOfficialId = officialId.trim()
        if (normalizedOfficialId.isEmpty()) return
        updateEventField {
            removeOfficialUser(
                userId = normalizedOfficialId,
                sport = resolveSport(sportId),
            )
        }
    }

    override fun setPaymentPlansEnabled(enabled: Boolean) {
        updateEventFieldWithoutSelectionRules {
            if (!enabled) {
                copy(
                    allowPaymentPlans = false,
                    installmentCount = null,
                    installmentDueDates = emptyList(),
                    installmentDueRelativeDays = emptyList(),
                    installmentAmounts = emptyList(),
                )
            } else {
                val targetCount = currentInstallmentCount().coerceAtLeast(1)
                val (amounts, dueDates) = normalizeInstallments(targetCount)
                val relativeDueDays = normalizeInstallmentDueRelativeDays(targetCount)
                val useRelativeDueDates = eventType == EventType.WEEKLY_EVENT
                copy(
                    allowPaymentPlans = true,
                    installmentCount = targetCount,
                    installmentDueDates = if (useRelativeDueDates) emptyList() else dueDates,
                    installmentDueRelativeDays = if (useRelativeDueDates) relativeDueDays else emptyList(),
                    installmentAmounts = amounts,
                )
            }
        }
    }

    override fun setInstallmentCount(count: Int) {
        val targetCount = count.coerceAtLeast(1)
        updateEventFieldWithoutSelectionRules {
            val (amounts, dueDates) = normalizeInstallments(targetCount)
            val relativeDueDays = normalizeInstallmentDueRelativeDays(targetCount)
            val useRelativeDueDates = eventType == EventType.WEEKLY_EVENT
            copy(
                allowPaymentPlans = true,
                installmentCount = targetCount,
                installmentDueDates = if (useRelativeDueDates) emptyList() else dueDates,
                installmentDueRelativeDays = if (useRelativeDueDates) relativeDueDays else emptyList(),
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
                installmentDueDates = if (eventType == EventType.WEEKLY_EVENT) emptyList() else dueDates,
                installmentDueRelativeDays = if (eventType == EventType.WEEKLY_EVENT) {
                    normalizeInstallmentDueRelativeDays(targetCount)
                } else {
                    emptyList()
                },
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
                installmentDueDates = if (eventType == EventType.WEEKLY_EVENT) emptyList() else updatedDueDates,
                installmentDueRelativeDays = if (eventType == EventType.WEEKLY_EVENT) {
                    normalizeInstallmentDueRelativeDays(targetCount)
                } else {
                    emptyList()
                },
            )
        }
    }

    override fun addInstallmentRow() {
        updateEventFieldWithoutSelectionRules {
            val targetCount = currentInstallmentCount().coerceAtLeast(0) + 1
            val (amounts, dueDates) = normalizeInstallments(targetCount)
            val relativeDueDays = normalizeInstallmentDueRelativeDays(targetCount)
            val useRelativeDueDates = eventType == EventType.WEEKLY_EVENT
            copy(
                allowPaymentPlans = true,
                installmentCount = targetCount,
                installmentAmounts = amounts,
                installmentDueDates = if (useRelativeDueDates) emptyList() else dueDates,
                installmentDueRelativeDays = if (useRelativeDueDates) relativeDueDays else emptyList(),
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
                    installmentDueRelativeDays = emptyList(),
                )
            } else {
                val updatedRelativeDueDays = normalizeInstallmentDueRelativeDays(targetCount)
                    .toMutableList()
                    .apply {
                        if (index in indices) removeAt(index)
                    }
                copy(
                    allowPaymentPlans = true,
                    installmentCount = updatedAmounts.size,
                    installmentAmounts = updatedAmounts,
                    installmentDueDates = if (eventType == EventType.WEEKLY_EVENT) emptyList() else updatedDueDates,
                    installmentDueRelativeDays = if (eventType == EventType.WEEKLY_EVENT) {
                        updatedRelativeDueDays
                    } else {
                        emptyList()
                    },
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
                    _errorState.value = ErrorMessage(error.userMessage("Unable to search users."))
                    emptyList()
                }
        }
    }

    override suspend fun ensureUserByEmail(email: String): Result<UserData> {
        val normalizedEmail = email.trim()
        if (normalizedEmail.isEmpty()) {
            return Result.failure(IllegalArgumentException("Email is required."))
        }

        return userRepository.ensureUserByEmail(normalizedEmail)
            .onFailure { error ->
                _errorState.value = ErrorMessage(error.userMessage("Unable to invite by email."))
            }
    }

    override suspend fun addPendingStaffInvite(
        firstName: String,
        lastName: String,
        email: String,
        roles: Set<EventStaffRole>,
    ): Result<Unit> = runCatching {
        val normalizedDraft = PendingStaffInviteDraft(
            firstName = firstName.trim(),
            lastName = lastName.trim(),
            email = normalizeStaffInviteEmail(email),
            roles = roles,
        )
        if (normalizedDraft.email.isBlank()) error("Email is required.")
        if (normalizedDraft.roles.isEmpty()) error("Select at least one role.")

        val existingDraft = _pendingStaffInvites.value.firstOrNull { draft ->
            normalizeStaffInviteEmail(draft.email) == normalizedDraft.email
        }
        if (existingDraft != null && normalizedDraft.roles.all(existingDraft.roles::contains)) {
            error("That email is already added for the selected role.")
        }

        val event = _newEventState.value
        val assignedUserIds = normalizedDraft.roles
            .flatMap { role -> event.assignedUserIdsForRole(role) }
            .distinct()
        if (assignedUserIds.isNotEmpty()) {
            val matches = userRepository.findEmailMembership(
                emails = listOf(normalizedDraft.email),
                userIds = assignedUserIds,
            ).getOrThrow()
            normalizedDraft.roles.forEach { role ->
                val roleUserIds = event.assignedUserIdsForRole(role)
                if (matches.any { match -> roleUserIds.contains(match.userId) }) {
                    error("${normalizedDraft.email} is already added in the ${role.conflictListLabel()}.")
                }
            }
        }

        _pendingStaffInvites.value = mergePendingStaffInviteDraft(
            existing = _pendingStaffInvites.value,
            draft = normalizedDraft,
        )
    }.onFailure { error ->
        _errorState.value = ErrorMessage(error.userMessage("Unable to add staff invite."))
    }

    override fun removePendingStaffInvite(email: String, role: EventStaffRole?) {
        val normalizedEmail = normalizeStaffInviteEmail(email)
        if (normalizedEmail.isBlank()) {
            return
        }
        _pendingStaffInvites.value = _pendingStaffInvites.value.mapNotNull { draft ->
            if (normalizeStaffInviteEmail(draft.email) != normalizedEmail) {
                draft
            } else if (role == null) {
                null
            } else {
                val updatedRoles = draft.roles - role
                if (updatedRoles.isEmpty()) {
                    null
                } else {
                    draft.copy(roles = updatedRoles)
                }
            }
        }
    }

    override fun onTypeSelected(type: EventType) {
        val previousType = _newEventState.value.eventType
        _currentEventType.value = type
        updateEventField {
            when (type) {
                EventType.LEAGUE, EventType.TOURNAMENT -> copy(
                    eventType = type,
                    teamSignup = true,
                    noFixedEndDateTime = true,
                )

                EventType.WEEKLY_EVENT -> copy(
                    eventType = type,
                    noFixedEndDateTime = true,
                )

                EventType.EVENT -> copy(
                    eventType = type,
                    noFixedEndDateTime = false,
                    end = end.takeIf { it > start } ?: defaultEventEnd(start),
                )
            }.syncEventTypeTagsForEventType()
        }
        when (type) {
            EventType.LEAGUE, EventType.TOURNAMENT -> {
                if (previousType != EventType.LEAGUE && previousType != EventType.TOURNAMENT) {
                    _useManualTimeSlots.value = false
                }
            }

            EventType.WEEKLY_EVENT -> _useManualTimeSlots.value = true
            EventType.EVENT -> _useManualTimeSlots.value = false
        }
        if (type == EventType.LEAGUE || type == EventType.TOURNAMENT || type == EventType.WEEKLY_EVENT) {
            if (_fieldCount.value <= 0) {
                val selectedCount = when {
                    _localFields.value.isNotEmpty() -> _localFields.value.size
                    newEventState.value.fieldIds.isNotEmpty() -> newEventState.value.fieldIds.size
                    else -> 1
                }.coerceAtLeast(1)
                selectFieldCount(selectedCount)
            }
        }
        if ((type == EventType.LEAGUE || type == EventType.TOURNAMENT || type == EventType.WEEKLY_EVENT) && _leagueSlots.value.isEmpty()) {
            _leagueSlots.value = listOf(createDefaultLeagueSlot())
        }
    }

    override fun setUseManualTimeSlots(enabled: Boolean) {
        _useManualTimeSlots.value = enabled
        if (enabled && _leagueSlots.value.isEmpty()) {
            _leagueSlots.value = listOf(createDefaultLeagueSlot())
        }
    }

    override fun selectPlace(place: MVPPlace?) {
        _selectedPlace.value = place
        updateEventField {
            copy(
                coordinates = place?.coordinates ?: listOf(0.0, 0.0),
                location = place?.name ?: "",
                address = place?.address,
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
            val userId = currentUser.value?.id?.trim().orEmpty()
            if (userId.isNotEmpty()) {
                updateEventField { copy(userIds = listOf(userId)) }
            } else {
                _errorState.value = ErrorMessage("Unable to add current user before profile is ready.")
            }
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
        if (shouldRestrictLocalResourceCreationForRentalEvent()) {
            syncSelectedRentalResourcesIntoDraft()
            return
        }
        val rentalFields = selectedRentalResourceFields()
        val rentalFieldIds = rentalFields.map { field -> field.id }.toSet()
        val normalized = count.coerceAtLeast(rentalFields.size)
        _fieldCount.value = normalized

        val currentEvent = newEventState.value
        val currentFields = _localFields.value
        val editableFields = currentFields.filterNot { field -> rentalFieldIds.contains(field.id) }
        val editableTargetCount = (normalized - rentalFields.size).coerceAtLeast(0)
        val resized = rentalFields.toMutableList()
        resized += editableFields
            .take(editableTargetCount)
            .take(normalized)
            .mapIndexed { index, field ->
                field.copy(
                    id = if (field.id.isBlank()) newId() else field.id,
                    fieldNumber = rentalFields.size + index + 1,
                    divisions = field.divisions
                        .normalizeDivisionIdentifiers()
                        .ifEmpty { defaultFieldDivisions(currentEvent) },
                    location = eventFieldLocationDefault(field, currentEvent),
                    organizationId = currentEvent.organizationId,
                )
            }

        while (resized.size < normalized) {
            val fieldNumber = resized.size + 1
            resized += Field(
                fieldNumber = fieldNumber,
                organizationId = currentEvent.organizationId,
                id = newId(),
            ).copy(
                name = "Field $fieldNumber",
                divisions = defaultFieldDivisions(currentEvent),
                location = defaultFieldLocation(currentEvent),
            )
        }
        _localFields.value = resized
        _newEventState.value = _newEventState.value.copy(
            fieldIds = resized.map { field -> field.id },
        )

        val validFieldIds = resized.map { it.id }.toSet()
        _leagueSlots.value = _leagueSlots.value.map { slot ->
            if (slot.isRentalBacked()) {
                return@map normalizeRentalSlotResourceSelection(slot, validFieldIds)
            }
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

    override fun setRentalResourceSelected(optionId: String, selected: Boolean) {
        val normalizedOptionId = optionId.trim()
        if (normalizedOptionId.isEmpty()) return
        _availableRentalResources.value.firstOrNull { candidate -> candidate.id == normalizedOptionId } ?: return
        val nextSelected = if (selected) {
            _selectedRentalResourceIds.value + normalizedOptionId
        } else {
            _selectedRentalResourceIds.value - normalizedOptionId
        }
        if (nextSelected == _selectedRentalResourceIds.value) {
            return
        }
        _selectedRentalResourceIds.value = nextSelected
        syncSelectedRentalResourcesIntoDraft()
    }

    private fun loadAvailableRentalResources() {
        scope.launch {
            billingRepository.listRentalResourceOptions()
                .onSuccess { options ->
                    _availableRentalResources.value = options
                    val availableIds = options.map { option -> option.id }.toSet()
                    val normalizedSelection = _selectedRentalResourceIds.value.filter(availableIds::contains).toSet()
                    if (normalizedSelection != _selectedRentalResourceIds.value) {
                        _selectedRentalResourceIds.value = normalizedSelection
                        syncSelectedRentalResourcesIntoDraft()
                    } else if (options.isNotEmpty()) {
                        syncSelectedRentalResourcesIntoDraft()
                    }
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.userMessage("Unable to load your rented resources."))
                }
        }
    }

    private fun syncSelectedRentalResourcesIntoDraft() {
        val selectedOptions = selectedRentalResourceOptions()
        val rentalFieldIds = selectedOptions
            .map { option -> option.field.id.trim() }
            .filter(String::isNotBlank)
            .distinct()
        val rentalFieldIdSet = rentalFieldIds.toSet()
        val rentalFields = selectedRentalResourceFields(selectedOptions)
        val restrictLocalResourceCreation = shouldRestrictLocalResourceCreationForRentalEvent()
        val customFields = if (restrictLocalResourceCreation) {
            emptyList()
        } else {
            _localFields.value.filterNot { field -> rentalFieldIdSet.contains(field.id.trim()) }
        }
        val nextFields = (rentalFields + customFields)
            .distinctBy { field -> field.id.trim() }
            .mapIndexed { index, field -> field.copy(fieldNumber = index + 1) }

        val validFieldIds = nextFields.map { field -> field.id }.toSet()
        val rentalSlots = selectedOptions.map { option ->
            val baseSlot = option.toRentalTimeSlot(_newEventState.value)
            val previousSlot = _leagueSlots.value.firstOrNull { slot ->
                slot.isRentalBacked() &&
                    (
                        slot.rentalBookingItemId == option.bookingItemId ||
                            slot.id == baseSlot.id
                        )
            }
            val additionalRegularFieldIds = previousSlot
                ?.normalizedScheduledFieldIds()
                ?.filter { fieldId ->
                    fieldId != option.field.id &&
                        !rentalFieldIdSet.contains(fieldId) &&
                        validFieldIds.contains(fieldId)
                }
                .orEmpty()
            baseSlot.copy(
                scheduledFieldId = option.field.id,
                scheduledFieldIds = (listOf(option.field.id) + additionalRegularFieldIds).distinct(),
            )
        }
        val rentalSlotIds = rentalSlots.map { slot -> slot.id }.toSet()
        val customSlots = if (restrictLocalResourceCreation) {
            emptyList()
        } else {
            _leagueSlots.value
                .filterNot { slot -> slot.isRentalBacked() || rentalSlotIds.contains(slot.id) }
                .map { slot ->
                    val remainingFieldIds = slot.normalizedScheduledFieldIds().filter { fieldId ->
                        validFieldIds.contains(fieldId) && !rentalFieldIdSet.contains(fieldId)
                    }
                    slot.copy(
                        scheduledFieldId = remainingFieldIds.firstOrNull(),
                        scheduledFieldIds = remainingFieldIds,
                    )
                }
                .filter { slot ->
                    slot.normalizedScheduledFieldIds().isNotEmpty() ||
                        (_newEventState.value.eventType != EventType.LEAGUE && _newEventState.value.eventType != EventType.TOURNAMENT)
                }
        }

        _localFields.value = nextFields
        _fieldCount.value = nextFields.size
        _leagueSlots.value = (rentalSlots + customSlots).sortedWith(
            compareBy<TimeSlot> { slot -> slot.startDate }
                .thenBy { slot -> slot.startTimeMinutes ?: Int.MAX_VALUE }
                .thenBy { slot -> slot.id }
        )
        _newEventState.value = _newEventState.value.copy(
            fieldIds = nextFields.map { field -> field.id },
            timeSlotIds = _leagueSlots.value.map { slot -> slot.id },
        )
    }

    private fun shouldRestrictLocalResourceCreationForRentalEvent(): Boolean {
        return _newEventState.value.eventType == EventType.EVENT &&
            _availableRentalResources.value.isNotEmpty()
    }

    private fun rentalOptionMatchesSlot(option: RentalResourceOption, slot: TimeSlot): Boolean {
        if (slot.rentalBookingItemId == option.bookingItemId) {
            return true
        }
        return !slot.repeating &&
            slot.startDate == option.start &&
            slot.endDate == option.end
    }

    private fun normalizeRentalSlotResourceSelection(
        slot: TimeSlot,
        validFieldIds: Set<String> = _localFields.value.map { field -> field.id }.toSet(),
    ): TimeSlot {
        if (!slot.isRentalBacked()) {
            val rentalFieldIds = _availableRentalResources.value
                .map { option -> option.field.id.trim() }
                .filter(String::isNotBlank)
                .toSet()
            if (rentalFieldIds.isEmpty()) {
                return slot
            }
            val retainedFieldIds = slot.normalizedScheduledFieldIds().filter { fieldId ->
                (validFieldIds.isEmpty() || fieldId in validFieldIds) && fieldId !in rentalFieldIds
            }
            return slot.copy(
                scheduledFieldId = retainedFieldIds.firstOrNull(),
                scheduledFieldIds = retainedFieldIds,
            )
        }

        val availableRentalOptions = _availableRentalResources.value
        val rentalOptionsByFieldId = availableRentalOptions
            .mapNotNull { option ->
                option.field.id.trim().takeIf(String::isNotBlank)?.let { fieldId -> fieldId to option }
            }
            .toMap()
        val primaryRentalFieldId = availableRentalOptions
            .firstOrNull { option -> slot.rentalBookingItemId == option.bookingItemId }
            ?.field
            ?.id
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: slot.scheduledFieldId?.trim()?.takeIf(String::isNotBlank)

        val selectedFieldIds = slot.normalizedScheduledFieldIds()
        val retainedFieldIds = selectedFieldIds.filter { fieldId ->
            if (validFieldIds.isNotEmpty() && fieldId !in validFieldIds) {
                return@filter false
            }
            val rentalOption = rentalOptionsByFieldId[fieldId]
            rentalOption == null || rentalOptionMatchesSlot(rentalOption, slot)
        }
        val normalizedFieldIds = (listOfNotNull(primaryRentalFieldId) + retainedFieldIds).distinct()
        return slot.copy(
            scheduledFieldId = normalizedFieldIds.firstOrNull(),
            scheduledFieldIds = normalizedFieldIds,
        )
    }

    private fun selectedRentalResourceOptions(): List<RentalResourceOption> {
        val selectedIds = _selectedRentalResourceIds.value
        if (selectedIds.isEmpty()) {
            return emptyList()
        }
        return _availableRentalResources.value.filter { option -> selectedIds.contains(option.id) }
    }

    private fun selectedRentalResourceFields(
        options: List<RentalResourceOption> = selectedRentalResourceOptions(),
    ): List<Field> {
        return options
            .map { option -> option.field }
            .filter { field -> field.id.isNotBlank() }
            .distinctBy { field -> field.id.trim() }
            .mapIndexed { index, field -> field.copy(fieldNumber = index + 1) }
    }

    override fun addLeagueTimeSlot() {
        _leagueSlots.value = _leagueSlots.value + createDefaultLeagueSlot()
    }

    override fun updateLeagueTimeSlot(index: Int, update: TimeSlot.() -> TimeSlot) {
        val slots = _leagueSlots.value.toMutableList()
        if (index !in slots.indices) return
        val validFieldIds = _localFields.value.map { field -> field.id }.toSet()
        slots[index] = normalizeRentalSlotResourceSelection(slots[index].update(), validFieldIds)
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

    private suspend fun createEventAfterPayment(eventDraft: Event) {
        loadingHandler.showLoading("Creating event...")
        val preparedEvent = prepareEventForCreation(eventDraft).getOrElse { error ->
            _errorState.value = ErrorMessage(error.userMessage("Failed to prepare event setup."))
            loadingHandler.hideLoading()
            return
        }

        val requiredTemplateIds = preparedEvent.event.requiredTemplateIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()

        eventRepository.createEvent(
            preparedEvent.event,
            requiredTemplateIds = requiredTemplateIds,
            leagueScoringConfig = _leagueScoringConfig.value
                .takeIf { preparedEvent.event.eventType == EventType.LEAGUE },
            fields = preparedEvent.fields,
            timeSlots = preparedEvent.timeSlots,
        )
            .onSuccess { createdEvent ->
                val syncedEvent = syncEventStaffAssignments(createdEvent)
                    .onFailure { error ->
                        _errorState.value = ErrorMessage(
                            error.userMessage("Event created, but staff invites failed to sync."),
                        )
                    }
                    .getOrDefault(createdEvent)
                loadingHandler.hideLoading()
                onEventCreated(syncedEvent)
            }
            .onFailure {
                _errorState.value = ErrorMessage(it.userMessage())
                loadingHandler.hideLoading()
            }
    }

    private suspend fun syncEventStaffAssignments(createdEvent: Event): Result<Event> = runCatching {
        val shouldSyncStaff = createdEvent.assistantHostIds.isNotEmpty() ||
            createdEvent.officialIds.isNotEmpty() ||
            _pendingStaffInvites.value.isNotEmpty()
        if (!shouldSyncStaff) {
            return@runCatching createdEvent
        }

        val saveOutcome = reconcileEventStaffInvites(
            userRepository = userRepository,
            event = createdEvent,
            pendingStaffInvites = _pendingStaffInvites.value,
            existingStaffInvites = emptyList(),
            createdByUserId = currentUser.value?.id,
        ).getOrThrow()

        _pendingStaffInvites.value = emptyList()

        if (saveOutcome.event == createdEvent) {
            saveOutcome.event
        } else {
            eventRepository.updateEvent(saveOutcome.event).getOrThrow()
        }
    }

    private data class PreparedEventForCreation(
        val event: Event,
        val fields: List<Field>,
        val timeSlots: List<TimeSlot>,
    )

    private suspend fun prepareEventForCreation(eventDraft: Event): Result<PreparedEventForCreation> = runCatching {
        var preparedEvent = eventDraft
        var preparedFields = emptyList<Field>()
        var preparedTimeSlots = emptyList<TimeSlot>()

        val shouldManageLocalFields =
            (preparedEvent.eventType == EventType.LEAGUE || preparedEvent.eventType == EventType.TOURNAMENT) &&
            _fieldCount.value > 0

        val selectedRentalFieldIds = selectedRentalResourceFields()
            .map { field -> field.id.trim() }
            .filter(String::isNotBlank)
            .distinct()
        val selectedRentalFieldIdSet = selectedRentalFieldIds.toSet()
        val fieldIdReplacements = mutableMapOf<String, String>()
        if (shouldManageLocalFields) {
            val existingFields = _localFields.value
                .filterNot { field -> selectedRentalFieldIdSet.contains(field.id.trim()) }
                .take((_fieldCount.value - selectedRentalFieldIds.size).coerceAtLeast(0))
            preparedFields = buildFieldDrafts(
                event = preparedEvent,
                targetCount = _fieldCount.value,
                excludedFieldIds = selectedRentalFieldIdSet,
            )
            existingFields.zip(preparedFields).forEach { (existingField, preparedField) ->
                if (existingField.id.isNotBlank()) {
                    fieldIdReplacements[existingField.id] = preparedField.id
                }
            }
            preparedEvent = preparedEvent.copy(
                fieldIds = selectedRentalFieldIds + preparedFields.map { it.id },
            )
        }

        val hasRentalBackedSlots = _leagueSlots.value.any { slot -> slot.isRentalBacked() }
        val shouldPersistManagedSlots = if (hasRentalBackedSlots) {
            preparedEvent.eventType == EventType.EVENT ||
                preparedEvent.eventType == EventType.LEAGUE ||
                preparedEvent.eventType == EventType.TOURNAMENT
        } else {
            preparedEvent.eventType == EventType.LEAGUE || preparedEvent.eventType == EventType.TOURNAMENT
        }
        if (shouldPersistManagedSlots) {
            preparedTimeSlots = if (shouldUseConfiguredLeagueSlots(event = preparedEvent)) {
                buildLeagueSlotDrafts(
                    event = preparedEvent,
                    fieldIdReplacements = fieldIdReplacements,
                )
            } else {
                buildAutomaticEventRangeSlotDrafts(
                    event = preparedEvent,
                    fieldIds = preparedFields.map(Field::id).ifEmpty { preparedEvent.fieldIds.normalizeDistinctIds() },
                )
            }

            preparedEvent = preparedEvent.copy(timeSlotIds = preparedTimeSlots.map { it.id })
        }

        PreparedEventForCreation(
            event = preparedEvent,
            fields = preparedFields,
            timeSlots = preparedTimeSlots,
        )
    }

    private fun validateCreateEventDraft(event: Event): String? {
        val hasRentalBackedEventSlots = event.eventType == EventType.EVENT &&
            _leagueSlots.value.any { slot -> slot.isRentalBacked() }
        if (hasRentalBackedEventSlots) {
            return null
        }
        val selectedDivisionIds = event.divisions.normalizeDivisionIdentifiers()
        if (selectedDivisionIds.isEmpty()) {
            return "Add at least one division before creating this event."
        }
        return null
    }

    private fun buildFieldDrafts(
        event: Event,
        targetCount: Int,
        excludedFieldIds: Set<String> = emptySet(),
    ): List<Field> {
        val normalizedCount = (targetCount - excludedFieldIds.size).coerceAtLeast(0)
        val drafts = _localFields.value
            .filterNot { field -> excludedFieldIds.contains(field.id.trim()) }
            .take(normalizedCount)
            .mapIndexed { index, field ->
                field.copy(
                    id = if (field.id.isBlank()) newId() else field.id,
                    fieldNumber = index + 1,
                    name = field.name?.takeIf { it.isNotBlank() } ?: "Field ${index + 1}",
                    divisions = field.divisions
                        .normalizeDivisionIdentifiers()
                        .ifEmpty { defaultFieldDivisions(event) },
                    location = eventFieldLocationDefault(field, event),
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
                location = defaultFieldLocation(event),
            )
        }

        return drafts
    }

    private fun buildLeagueSlotDrafts(
        event: Event,
        fieldIdReplacements: Map<String, String>,
    ): List<TimeSlot> {
        val selectedDivisionIds = event.divisions.normalizeDivisionIdentifiers()
        return _leagueSlots.value.mapNotNull { rawSlot ->
            val slot = normalizeRentalSlotResourceSelection(rawSlot)
            val mappedFieldIds = slot.normalizedScheduledFieldIds()
                .mapNotNull { fieldId ->
                    (fieldIdReplacements[fieldId] ?: fieldId).takeIf { it.isNotBlank() }
                }
                .distinct()
            val effectiveDivisionIds = resolveEffectiveLeagueSlotDivisionIds(
                singleDivision = event.singleDivision,
                selectedDivisionIds = selectedDivisionIds,
                slotDivisionIds = slot.normalizedDivisionIds(),
            )
            val normalizedDays = slot.normalizedDaysOfWeek()
            val startMinutes = slot.startTimeMinutes
            val endMinutes = slot.endTimeMinutes

            if (mappedFieldIds.isEmpty()) {
                return@mapNotNull null
            }

            if (!slot.repeating) {
                val slotTimeZone = slot.timeZone.toTimeZoneOrUtc(event.resolvedTimeZone())
                val slotStartDate = slot.startDate.takeUnless { it == Instant.DISTANT_PAST } ?: event.start
                val slotEndDate = slot.endDate ?: return@mapNotNull null
                if (slotEndDate <= slotStartDate) {
                    return@mapNotNull null
                }
                val slotDayOfWeek = slotStartDate.toMondayFirstDay(slotTimeZone)
                return@mapNotNull slot.copy(
                    id = slot.id.ifBlank { newId() },
                    dayOfWeek = slotDayOfWeek,
                    daysOfWeek = listOf(slotDayOfWeek),
                    divisions = effectiveDivisionIds,
                    scheduledFieldId = mappedFieldIds.first(),
                    scheduledFieldIds = mappedFieldIds,
                    startDate = slotStartDate,
                    endDate = slotEndDate,
                    startTimeMinutes = slotStartDate.toMinutesOfDay(slotTimeZone),
                    endTimeMinutes = slotEndDate.toMinutesOfDay(slotTimeZone),
                    repeating = false,
                )
            }

            if (normalizedDays.isEmpty() || startMinutes == null || endMinutes == null) {
                return@mapNotNull null
            }
            if (endMinutes <= startMinutes) {
                return@mapNotNull null
            }
            val slotStartDate = slot.startDate.takeUnless { it == Instant.DISTANT_PAST } ?: event.start
            val repeatingEndDate = if (event.eventType == EventType.WEEKLY_EVENT) {
                null
            } else if (event.noFixedEndDateTime) {
                null
            } else {
                slot.endDate?.toDateOnlyInstant(slot.timeZone.toTimeZoneOrUtc(event.resolvedTimeZone()))
            }
            slot.copy(
                id = slot.id.ifBlank { newId() },
                dayOfWeek = normalizedDays.first(),
                daysOfWeek = normalizedDays,
                divisions = effectiveDivisionIds,
                scheduledFieldId = mappedFieldIds.first(),
                scheduledFieldIds = mappedFieldIds,
                startDate = slotStartDate,
                endDate = repeatingEndDate,
                repeating = true,
            )
        }
    }

    private fun shouldUseConfiguredLeagueSlots(event: Event): Boolean {
        if (_leagueSlots.value.any { slot -> slot.isRentalBacked() }) {
            return true
        }
        if (event.eventType == EventType.WEEKLY_EVENT) {
            return true
        }
        if (event.eventType != EventType.LEAGUE && event.eventType != EventType.TOURNAMENT) {
            return false
        }
        if (event.noFixedEndDateTime) {
            return true
        }
        return _useManualTimeSlots.value
    }

    private fun buildAutomaticEventRangeSlotDrafts(
        event: Event,
        fieldIds: List<String>,
    ): List<TimeSlot> {
        val normalizedFieldIds = fieldIds.normalizeDistinctIds()
        if (normalizedFieldIds.isEmpty()) {
            return emptyList()
        }
        val slotStart = event.start
        val slotEnd = event.end.takeIf { it > slotStart } ?: defaultEventEnd(slotStart)
        val eventTimeZone = event.resolvedTimeZone()
        val slotDayOfWeek = slotStart.toMondayFirstDay(eventTimeZone)
        return listOf(
            TimeSlot(
                id = newId(),
                dayOfWeek = slotDayOfWeek,
                daysOfWeek = listOf(slotDayOfWeek),
                divisions = defaultFieldDivisions(event),
                startTimeMinutes = slotStart.toMinutesOfDay(eventTimeZone),
                endTimeMinutes = slotEnd.toMinutesOfDay(eventTimeZone),
                startDate = slotStart,
                timeZone = event.timeZone,
                repeating = false,
                endDate = slotEnd,
                scheduledFieldId = normalizedFieldIds.first(),
                scheduledFieldIds = normalizedFieldIds,
                price = null,
            ),
        )
    }

    private fun RentalResourceOption.toRentalTimeSlot(event: Event): TimeSlot {
        val eventTimeZone = timeZone.toTimeZoneOrUtc(event.resolvedTimeZone())
        val slotDay = start.toMondayFirstDay(eventTimeZone)
        val slotId = eventTimeSlotId
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: "rental-slot-${bookingItemId.trim().ifBlank { id }}".replace(Regex("[^A-Za-z0-9_-]"), "-")
        return TimeSlot(
            id = slotId,
            dayOfWeek = slotDay,
            daysOfWeek = listOf(slotDay),
            divisions = defaultFieldDivisions(event),
            startTimeMinutes = start.toMinutesOfDay(eventTimeZone),
            endTimeMinutes = end.toMinutesOfDay(eventTimeZone),
            startDate = start,
            timeZone = timeZone,
            repeating = false,
            endDate = end,
            scheduledFieldId = field.id,
            scheduledFieldIds = listOf(field.id),
            price = null,
            requiredTemplateIds = requiredTemplateIds.normalizeDistinctIds(),
            hostRequiredTemplateIds = hostRequiredTemplateIds.normalizeDistinctIds(),
            sourceType = "RENTAL_BOOKING",
            rentalBookingId = bookingId,
            rentalBookingItemId = bookingItemId,
            rentalLocked = true,
        )
    }

    private fun TimeSlot.isRentalBacked(): Boolean {
        return rentalLocked == true ||
            !rentalBookingId.isNullOrBlank() ||
            sourceType?.trim()?.equals("RENTAL_BOOKING", ignoreCase = true) == true
    }

    private fun syncLeagueSlotDefaultStartDates(previousEvent: Event, updatedEvent: Event) {
        if (previousEvent.start == updatedEvent.start) {
            return
        }
        _leagueSlots.value = _leagueSlots.value.map { slot ->
            if (slot.repeating && slot.startDate == previousEvent.start) {
                slot.copy(startDate = updatedEvent.start)
            } else {
                slot
            }
        }
    }

    private fun syncLeagueSlotDefaultEndDates(
        previousEvent: Event,
        updatedEvent: Event,
    ) {
        val previousDefaultEnd = previousEvent.defaultLeagueSlotEndDate()
        val updatedDefaultEnd = updatedEvent.defaultLeagueSlotEndDate()
        val forceRepeatingEndReset = previousEvent.eventType != updatedEvent.eventType &&
            updatedEvent.eventType != EventType.EVENT
        if (!forceRepeatingEndReset && previousDefaultEnd == updatedDefaultEnd) {
            return
        }
        _leagueSlots.value = _leagueSlots.value.map { slot ->
            if (!slot.repeating) {
                slot
            } else if (forceRepeatingEndReset || slot.endDate == previousDefaultEnd) {
                slot.copy(endDate = updatedDefaultEnd)
            } else {
                slot
            }
        }
    }

    private fun syncLocalFieldsForEvent(previousEvent: Event, event: Event) {
        val currentFields = _localFields.value
        if (currentFields.isEmpty()) return

        _localFields.value = currentFields.mapIndexed { index, field ->
            field.copy(
                fieldNumber = index + 1,
                divisions = field.divisions
                    .normalizeDivisionIdentifiers()
                    .ifEmpty { defaultFieldDivisions(event) },
                location = eventFieldLocationDefault(field, event, previousEvent),
                organizationId = event.organizationId,
            )
        }
    }

    private fun loadSports() {
        scope.launch {
            sportsRepository.getSports()
                .onSuccess { loadedSports ->
                    _sports.value = loadedSports
                    _newEventState.value = syncOfficialStaffingForSportTransition(
                        previous = _newEventState.value,
                        updated = _newEventState.value.withSportRules(),
                    )
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.userMessage("Failed to load sports."))
                }
            sportsRepository.getDivisionTypeParameters()
                .onSuccess { parameters ->
                    _divisionTypeParameters.value = parameters
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.userMessage("Failed to load division options."))
                }
        }
    }

    private fun loadEventTags() {
        scope.launch {
            eventRepository.getEventTags()
                .onSuccess { tags ->
                    _eventTags.value = tags
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage("Failed to load event tags: ${error.userMessage()}")
                }
        }
    }

    private suspend fun loadOrganizationTemplates(organizationId: String) {
        if (organizationId.isBlank()) {
            _organizationTemplates.value = emptyList()
            _organizationTemplatesError.value = null
            _organizationTemplatesLoading.value = false
            return
        }

        _organizationTemplatesLoading.value = true
        _organizationTemplatesError.value = null
        billingRepository.listOrganizationTemplates(organizationId)
            .onSuccess { templates ->
                _organizationTemplates.value = templates
            }
            .onFailure { throwable ->
                _organizationTemplates.value = emptyList()
                _organizationTemplatesError.value = throwable.userMessage("Failed to load templates.")
            }
        _organizationTemplatesLoading.value = false
    }

    private fun usesSetScoringForSport(sportId: String?): Boolean = sportId
        ?.let { selectedSportId -> _sports.value.firstOrNull { it.id == selectedSportId } }
        ?.usePointsPerSetWin
        ?: false

    private fun resolveSport(sportId: String?): Sport? = sportId
        ?.let { selectedSportId -> _sports.value.firstOrNull { it.id == selectedSportId } }

    private fun syncOfficialStaffingForSportTransition(previous: Event, updated: Event): Event {
        val previousSport = resolveSport(previous.sportId)
        val nextSport = resolveSport(updated.sportId)
        val shouldReplaceDefaults = previous.sportId != updated.sportId &&
            previous.shouldReplaceOfficialPositionsWithSportDefaults(
                previousSport = previousSport,
                nextSport = nextSport,
            )
        return updated.syncOfficialStaffing(
            sport = nextSport,
            replacePositionsWithSportDefaults = shouldReplaceDefaults,
        )
    }

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
            EventType.EVENT, EventType.WEEKLY_EVENT -> this
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
                matchDurationMinutes = null,
            )
        } else {
            copy(
                usesSets = false,
                setsPerMatch = null,
                setDurationMinutes = null,
                pointsToVictory = emptyList(),
                matchDurationMinutes = matchDurationMinutes,
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
                usesSets = false,
                setDurationMinutes = null,
                matchDurationMinutes = matchDurationMinutes,
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
                usesSets = true,
                setDurationMinutes = setDurationMinutes ?: 20,
                matchDurationMinutes = null,
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
        val endDate = event.defaultLeagueSlotEndDate()
        return TimeSlot(
            id = newId(),
            dayOfWeek = null,
            daysOfWeek = emptyList(),
            divisions = defaultFieldDivisions(event),
            startTimeMinutes = null,
            endTimeMinutes = null,
            startDate = startDate,
            timeZone = event.timeZone,
            repeating = true,
            endDate = endDate,
            scheduledFieldId = null,
            scheduledFieldIds = emptyList(),
            price = null,
        )
    }

    private fun defaultFieldDivisions(event: Event): List<String> {
        val eventDivisions = event.divisions.normalizeDivisionIdentifiers()
        return eventDivisions
    }

    private fun defaultFieldLocation(event: Event): String? {
        return event.location.trim().takeIf(String::isNotBlank)
    }

    private fun eventFieldLocationDefault(
        field: Field,
        event: Event,
        previousEvent: Event? = null,
    ): String? {
        val currentLocation = field.location?.trim()?.takeIf(String::isNotBlank)
        val previousDefault = previousEvent?.let(::defaultFieldLocation)
        val eventDefault = defaultFieldLocation(event)
        return when {
            currentLocation == null -> eventDefault
            previousDefault != null && currentLocation == previousDefault -> eventDefault
            else -> currentLocation
        }
    }

    private fun Event.defaultLeagueSlotEndDate(): Instant? {
        if (eventType == EventType.WEEKLY_EVENT || noFixedEndDateTime) {
            return null
        }
        return end
            .takeIf { value -> value > start }
            ?.toDateOnlyInstant(resolvedTimeZone())
    }

    private fun Instant.toDateOnlyInstant(timezone: TimeZone): Instant {
        val localDate = toLocalDateTime(timezone).date
        return localDate.atStartOfDayIn(timezone)
    }

    private fun Instant.toMinutesOfDay(timezone: TimeZone): Int {
        val localTime = toLocalDateTime(timezone).time
        return localTime.hour * 60 + localTime.minute
    }

    private fun Instant.toMondayFirstDay(timezone: TimeZone): Int {
        val isoDay = toLocalDateTime(timezone).date.dayOfWeek.isoDayNumber
        return (isoDay - 1).mod(7)
    }

    private fun Event.currentInstallmentCount(): Int {
        return maxOf(
            installmentCount ?: 0,
            installmentAmounts.size,
            installmentDueDates.size,
            installmentDueRelativeDays.size,
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

    private fun Event.normalizeInstallmentDueRelativeDays(targetCount: Int): List<Int> {
        val normalizedCount = targetCount.coerceAtLeast(0)
        return List(normalizedCount) { index ->
            installmentDueRelativeDays.getOrNull(index) ?: 0
        }
    }

    private fun List<String>.normalizeDistinctIds(): List<String> {
        return this
            .map { value -> value.trim() }
            .filter(String::isNotBlank)
            .distinct()
    }

    private fun resolveCurrentUserId(): String =
        userRepository.currentUser.value.getOrNull()?.id?.trim().orEmpty()

    private fun Event.withRequiredHost(hostUserId: String): Event {
        val normalizedHostId = hostUserId.trim()
        if (normalizedHostId.isEmpty()) {
            return this
        }
        val normalizedAssistantHostIds = assistantHostIds
            .normalizeDistinctIds()
            .filterNot { assistantHostId -> assistantHostId == normalizedHostId }
        val currentNormalizedHostId = hostId.trim()
        val currentNormalizedAssistantHostIds = assistantHostIds.normalizeDistinctIds()
        if (
            currentNormalizedHostId == normalizedHostId &&
            currentNormalizedAssistantHostIds == normalizedAssistantHostIds
        ) {
            return this
        }
        return copy(
            hostId = normalizedHostId,
            assistantHostIds = normalizedAssistantHostIds,
        )
    }

    private fun createInitialEventDraft(
        now: Instant = Clock.System.now(),
        initialHostId: String = "",
    ): Event {
        val start = roundedStartAtLeastOneHourFrom(now)
        return Event(
            start = start,
            end = defaultEventEnd(start),
            timeZone = TimeZone.currentSystemDefault().id,
            hostId = initialHostId.trim(),
            singleDivision = false,
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
        _componentContext: ComponentContext,
    ): Child = when (config) {
        is Config.EventInfo -> Child.EventInfo
        is Config.Preview -> Child.Preview
    }

    companion object {
        private const val ONE_HOUR_MILLIS = 60L * 60L * 1000L
    }
}
