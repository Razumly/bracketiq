@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.arkivanov.essenty.lifecycle.doOnDestroy
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.analytics.AnalyticsEvent
import com.razumly.mvp.core.analytics.AnalyticsTracker
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameters
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.isAffiliateEvent
import com.razumly.mvp.core.data.dataTypes.normalizedAffiliateUrl
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.InclusivePriceQuote
import com.razumly.mvp.core.data.repositories.InclusivePriceQuoteDirection
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.IImagesRepository
import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.repositories.ISportsRepository
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.SignerContext
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.TeamJoinQuestion
import com.razumly.mvp.core.data.repositories.TeamRegistrationResult
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.LeagueDivisionStandings
import com.razumly.mvp.core.data.repositories.EventTeamBillCreateRequest
import com.razumly.mvp.core.data.repositories.EventTeamBillingSnapshot
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckout
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckoutRequest
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.userMessage
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.LoadingOperation
import com.razumly.mvp.eventDetail.data.BracketNode
import com.razumly.mvp.eventDetail.data.IMatchRepository
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import io.github.aakira.napier.Napier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultEventDetailComponent(
    componentContext: ComponentContext,
    private val userRepository: IUserRepository,
    fieldRepository: IFieldRepository,
    eventId: String,
    notificationsRepository: IPushNotificationsRepository,
    private val billingRepository: IBillingRepository,
    private val eventRepository: IEventRepository,
    private val matchRepository: IMatchRepository,
    private val teamRepository: ITeamRepository,
    private val sportsRepository: ISportsRepository,
    imageRepository: IImagesRepository,
    private val navigationHandler: INavigationHandler,
    private val currentUserDataSource: CurrentUserDataSource? = null,
    private val apiClient: MvpApiClient? = null,

) : EventDetailComponent, PaymentProcessor(), ComponentContext by componentContext {
    private val event = Event(id = eventId.trim())

    override suspend fun quoteInclusivePrice(
        direction: InclusivePriceQuoteDirection,
        amountCents: Int,
        eventType: String?,
    ): Result<InclusivePriceQuote> = billingRepository.quoteInclusivePrice(
        direction = direction,
        amountCents = amountCents,
        eventType = eventType,
    )

    private companion object {
        const val MATCH_REALTIME_EDIT_PAUSE_REASON = "event-detail-editing"
    }

    private fun canManageMatchEditing(): Boolean =
        canManageEventForUser(
            event = selectedEvent.value,
            user = currentUser.value,
            organization = eventWithRelations.value.organization,
        )

    private fun canManageParticipantData(
        event: Event = selectedEvent.value,
        user: UserData = currentUser.value,
        organization: Organization? = eventWithRelations.value.organization,
    ): Boolean = canManageEventForUser(
        event = event,
        user = user,
        organization = organization,
    )

    private fun canEditMatchesNow(): Boolean = matchEditingCoordinator.canEditNow(canManageMatchEditing())

    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())
    override val currentUser = userRepository.currentUser.map { it.getOrNull() ?: UserData() }
        .stateIn(scope, SharingStarted.Eagerly, UserData())

    private val _currentAccount = userRepository.currentAccount.map { result ->
        result.getOrElse {
            userRepository.getCurrentAccount()
            AuthAccount.empty()
        }
    }.stateIn(scope, SharingStarted.Eagerly, AuthAccount.empty())
    private val _eventStaffInvites = MutableStateFlow<List<Invite>>(emptyList())
    private val _eventStaffRevision = MutableStateFlow<String?>(null)

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()
    private val registrationFlowCoordinator = EventRegistrationFlowCoordinator()
    private val joinExecutionCoordinator = EventJoinExecutionCoordinator(registrationFlowCoordinator)
    private val withdrawalActionCoordinator = EventWithdrawalActionCoordinator(registrationFlowCoordinator)
    private val paymentPlanBillingCoordinator = EventPaymentPlanBillingCoordinator()
    private val purchaseIntentCoordinator = EventPurchaseIntentCoordinator(registrationFlowCoordinator)
    private val signatureExecutionCoordinator = EventSignatureExecutionCoordinator(registrationFlowCoordinator)
    private val joinConfirmationCoordinator = EventJoinConfirmationCoordinator()
    private val eventInviteCoordinator = EventInviteCoordinator()
    private val eventTeamCheckInCoordinator = EventTeamCheckInCoordinator(
        getEventTeamCheckInsRequest = matchRepository::getEventTeamCheckIns,
        checkInEventTeamRequest = matchRepository::checkInEventTeam,
        scope = scope,
    )
    override val suggestedUsers = eventInviteCoordinator.suggestedUsers
    override val inviteTeamSuggestions = eventInviteCoordinator.inviteTeamSuggestions
    override val inviteTeamsLoading = eventInviteCoordinator.inviteTeamsLoading
    override val pendingStaffInvites = eventInviteCoordinator.pendingStaffInvites
    override val billingAddressPrompt = registrationFlowCoordinator.billingAddressPrompt
    override val discountCodePrompt = registrationFlowCoordinator.discountCodePrompt
    override val startingTeamRegistrationId = registrationFlowCoordinator.startingTeamRegistrationId

    private lateinit var loadingHandler: LoadingHandler
    private var registrationPaymentLoadingOperation: LoadingOperation? = null

    override fun setLoadingHandler(loadingHandler: LoadingHandler) {
        this.loadingHandler = loadingHandler
    }

    private fun showRegistrationPaymentLoading(message: String) {
        val operation = registrationPaymentLoadingOperation
            ?: loadingHandler.newOperation().also { created ->
                registrationPaymentLoadingOperation = created
            }
        operation.showLoading(message)
    }

    private fun finishRegistrationPaymentLoading() {
        registrationPaymentLoadingOperation?.hideLoading()
        registrationPaymentLoadingOperation = null
    }

    override fun clearError() {
        _errorState.value = null
    }

    override fun dismissEventTeamCheckInDialog() {
        eventTeamCheckInCoordinator.dismissDialog()
    }

    override fun confirmEventTeamCheckIn() {
        val currentEvent = selectedEvent.value
        eventTeamCheckInCoordinator.confirm(
            event = currentEvent,
            eventTeamId = currentUserManagedEventTeamId.value,
            onFailure = { error ->
                _errorState.value = ErrorMessage("Failed to check in team: ${error.userMessage()}")
            },
        )
    }

    private fun refreshEventTeamCheckInsIfAllowed() {
        val event = selectedEvent.value
        val canViewCheckIns = canManageParticipantData(event = event) ||
            isCurrentUserEventOfficial(currentUser.value.id, event)
        eventTeamCheckInCoordinator.refreshIfAllowed(
            event = event,
            canViewCheckIns = canViewCheckIns,
        )
    }

    private fun evaluateEventTeamCheckInPrompt() {
        val event = selectedEvent.value
        eventTeamCheckInCoordinator.evaluatePrompt(
            event = event,
            eventTeamId = currentUserManagedEventTeamId.value,
        )
    }

    override fun updateEventRegistrationQuestionAnswer(questionId: String, answer: String) {
        if (!registrationFlowCoordinator.updateQuestionAnswer(questionId, answer)) return
        scope.launch {
            registrationLifecycleHandler.saveCurrentRegistrationProgress(step = "questions")
        }
    }

    override fun toggleEventRegistrationQuestionsExpanded() {
        registrationFlowCoordinator.toggleQuestionsExpanded()
    }

    override fun dismissEventRegistrationQuestionDialog() {
        registrationFlowCoordinator.dismissQuestionDialog()
    }

    override fun submitEventRegistrationQuestionDialogAnswers(answers: Map<String, String>) {
        val result = registrationFlowCoordinator.submitQuestionDialogAnswers(answers) ?: return
        result.missingQuestion?.let { missingQuestion ->
            _errorState.value = ErrorMessage("Answer \"${missingQuestion.prompt}\" before continuing.")
            return
        }

        scope.launch {
            registrationLifecycleHandler.saveCurrentRegistrationProgress(step = "questions")
            result.continuation?.invoke()
        }
    }

    override fun registrationHoldExpired() {
        scope.launch {
            registrationLifecycleHandler.clearCurrentRegistrationProgress()
            registrationFlowCoordinator.clearPendingJoinConfirmationTarget()
            registrationFlowCoordinator.clearTeamRegistrationState()
            registrationFlowCoordinator.clearAfterRegistrationHoldExpired()
            _errorState.value = ErrorMessage("Registration hold expired. Start registration again to reserve a new spot.")
        }
    }

    private val editActionCoordinator = EventEditActionCoordinator()
    private val editDraftCoordinator = EventEditDraftCoordinator(
        initialEvent = event,
        canEditInitial = event.state.equals("TEMPLATE", ignoreCase = true) && canEditEventDetails(event),
    )
    override var editedEvent = editDraftCoordinator.editedEvent
    override var isEditing = editDraftCoordinator.isEditing

    override val editableLeagueTimeSlots = editDraftCoordinator.editableLeagueTimeSlots
    override val editableFields = editDraftCoordinator.editableFields
    private val rentalResourcesCoordinator = EventRentalResourcesCoordinator()
    override val availableRentalResources = rentalResourcesCoordinator.availableResources
    override val selectedRentalResourceIds = rentalResourcesCoordinator.selectedResourceIds
    override val editableLeagueScoringConfig = editDraftCoordinator.editableLeagueScoringConfig

    override val backCallback = BackCallback {
        if (isEditing.value) {
            editDraftCoordinator.setEditing(false)
        } else if (showDetails.value) {
            _showDetails.value = false
        } else {
            navigationHandler.navigateBack()
        }
    }

    private val imageCoordinator = EventImageCoordinator(imageRepository, scope)
    override val eventImageIds = imageCoordinator.eventImageIds
    private val notificationCoordinator = EventNotificationCoordinator(notificationsRepository)

    private val organizationTemplatesCoordinator = EventOrganizationTemplatesCoordinator()
    override val organizationTemplates = organizationTemplatesCoordinator.templates
    override val organizationTemplatesLoading = organizationTemplatesCoordinator.loading
    override val organizationTemplatesError = organizationTemplatesCoordinator.error

    private val leagueStandingsCoordinator = EventLeagueStandingsCoordinator()
    override val leagueDivisionStandings = leagueStandingsCoordinator.divisionStandings
    override val leagueDivisionStandingsLoading = leagueStandingsCoordinator.divisionStandingsLoading
    override val leagueStandingsConfirming = leagueStandingsCoordinator.standingsConfirming
    private val sportsCatalogCoordinator = EventSportsCatalogCoordinator()
    private val _eventTags = MutableStateFlow<List<EventTag>>(emptyList())

    private val relationStateCoordinator = EventRelationStateCoordinator(
        initialEvent = event,
        currentUser = currentUser,
        observeEventRelations = eventRepository::getEventWithRelationsFlow,
        observeEventMatches = matchRepository::getCachedMatchesOfTournamentFlow,
        observeEventTeams = teamRepository::getTeamsFlow,
        observeUsers = userRepository::getUsersFlow,
        observeCurrentUserTeams = teamRepository::getTeamsWithPlayersFlow,
        scope = scope,
        onEventRelationsError = { error ->
            _errorState.value = ErrorMessage(error.userMessage())
        },
        onEventMatchesError = { error ->
            _errorState.value = ErrorMessage("Error loading matches: ${error.userMessage()}")
        },
        onEventTeamsError = { error ->
            _errorState.value = ErrorMessage("Failed to load teams: ${error.userMessage()}")
        },
    )

    private val eventRelations = relationStateCoordinator.eventRelations

    override val sports = sportsCatalogCoordinator.sports
    override val eventTags = _eventTags.asStateFlow()
    override val divisionTypeParameters = sportsCatalogCoordinator.divisionTypeParameters

    override val selectedEvent = relationStateCoordinator.selectedEvent

    private val bootstrapResourcesCoordinator = EventBootstrapResourcesCoordinator(
        selectedEvent = selectedEvent,
        eventRelations = eventRelations,
        fieldRepository = fieldRepository,
        eventRepository = eventRepository,
        scope = scope,
    )
    private val eventTimeSlots = bootstrapResourcesCoordinator.eventTimeSlots
    private val eventLeagueScoringConfig = bootstrapResourcesCoordinator.eventLeagueScoringConfig

    override val isHost = selectedEvent.map { it.hostId == currentUser.value.id }
        .stateIn(scope, SharingStarted.Eagerly, false)

    private val selectedEventId = relationStateCoordinator.selectedEventId
    private val eventRelationPlayers = relationStateCoordinator.eventPlayers
    private val eventMatches = relationStateCoordinator.eventMatches
    private val eventTeams = relationStateCoordinator.eventTeams
    private val eventHost = relationStateCoordinator.eventHost

    private val eventOrganization: StateFlow<Organization?> = selectedEvent
        .map { selected -> selected.organizationId?.trim().orEmpty() }
        .distinctUntilChanged()
        .flatMapLatest { organizationId ->
            flow {
                if (organizationId.isBlank()) {
                    emit(null)
                    return@flow
                }
                val organization = billingRepository.getOrganizationsByIds(listOf(organizationId))
                    .getOrElse { error ->
                        Napier.w(
                            "Failed to load organization $organizationId for event ${selectedEvent.value.id}: ${error.message}"
                        )
                        emptyList()
                    }
                    .firstOrNull { organization -> organization.id == organizationId }
                emit(organization)
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, null)

    override val eventWithRelations = combine(
        selectedEvent,
        eventRelationPlayers,
        eventMatches,
        eventTeams,
        sportsCatalogCoordinator.sports,
    ) { selected, players, matches, teams, sports ->
        val sport = selected.sportId
            ?.takeIf(String::isNotBlank)
            ?.let { sportId -> sports.firstOrNull { it.id == sportId } }
        EventWithFullRelations(
            event = selected,
            players = players,
            matches = matches,
            teams = teams,
            sport = sport,
        )
    }.combine(eventOrganization) { relations, organization ->
        relations.copy(organization = organization)
    }.combine(eventHost) { relations, host ->
        relations.copy(host = host)
    }.combine(eventTimeSlots) { relations, timeSlots ->
        relations.copy(timeSlots = timeSlots)
    }.combine(eventLeagueScoringConfig) { relations, leagueScoringConfig ->
        relations.copy(leagueScoringConfig = leagueScoringConfig)
    }.combine(_eventStaffInvites) { relations, staffInvites ->
        relations.copy(staffInvites = staffInvites)
    }.stateIn(
        scope,
        SharingStarted.Eagerly,
        EventWithFullRelations(event, emptyList(), emptyList(), emptyList()),
    )

    private val divisionContentCoordinator = EventDivisionContentCoordinator()
    override val divisionMatches = divisionContentCoordinator.divisionMatches
    override val divisionTeams = divisionContentCoordinator.divisionTeams
    override val selectedDivision = divisionContentCoordinator.selectedDivision

    private val weeklyOccurrenceCoordinator = EventWeeklyOccurrenceCoordinator()
    override val selectedWeeklyOccurrence = weeklyOccurrenceCoordinator.selectedWeeklyOccurrence
    override val selectedWeeklyOccurrenceSummary = weeklyOccurrenceCoordinator.selectedWeeklyOccurrenceSummary
    override val weeklyOccurrenceSummaries = weeklyOccurrenceCoordinator.weeklyOccurrenceSummaries
    override val overviewParticipantSummary = weeklyOccurrenceCoordinator.overviewParticipantSummary

    private val eventFieldIds = combine(
        selectedEvent,
        eventWithRelations.map { relations ->
            relations.matches
                .mapNotNull { match -> match.match.fieldId?.trim()?.takeIf(String::isNotBlank) }
        },
        eventTimeSlots,
    ) { selected, matchFieldIds, timeSlots ->
        val slotFieldIds = timeSlots.flatMap { slot -> slot.normalizedScheduledFieldIds() }
        (selected.fieldIds + matchFieldIds + slotFieldIds)
            .map { fieldId -> fieldId.trim() }
            .filter(String::isNotBlank)
            .distinct()
    }.distinctUntilChanged()

    override val eventFields: StateFlow<List<FieldWithMatches>> = combine(
        selectedEventId,
        eventFieldIds,
        bootstrapResourcesCoordinator.bootstrappedEventIds,
    ) { eventId, fieldIds, bootstrappedEventIds ->
        Triple(eventId, fieldIds, bootstrappedEventIds.contains(eventId))
    }.flatMapLatest { (eventId, fieldIds, bootstrapped) ->
        if (fieldIds.isEmpty()) {
            flowOf(emptyList())
        } else if (bootstrapped) {
            fieldRepository.getFieldsWithMatchesFlow(fieldIds)
        } else {
            flow {
                fieldRepository.getFields(fieldIds).onFailure { error ->
                    Napier.w("Failed to refresh fields for event $eventId: ${error.message}")
                }
                emitAll(fieldRepository.getFieldsWithMatchesFlow(fieldIds))
            }
        }
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    override val divisionFields: StateFlow<List<FieldWithMatches>> = combine(
        eventFields,
        selectedEvent,
        selectedDivision
    ) { fields, selected, activeDivision ->
        fields.filter {
            if (!selected.singleDivision && !activeDivision.isNullOrEmpty()) {
                val normalizedActiveDivision = activeDivision.normalizeDivisionIdentifier()
                val allowedFieldIdSet = selected.divisionDetails
                    .firstOrNull { detail ->
                        detail.id.normalizeDivisionIdentifier() == normalizedActiveDivision
                    }
                    ?.fieldIds
                    .orEmpty()
                    .map { fieldId -> fieldId.trim() }
                    .filter(String::isNotBlank)
                    .toSet()

                allowedFieldIdSet.isEmpty() || allowedFieldIdSet.contains(it.field.id)
            } else {
                true
            }
        }
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _isBracketView = MutableStateFlow(false)
    override val isBracketView = _isBracketView.asStateFlow()

    private val bracketRoundsCoordinator = EventBracketRoundsCoordinator()
    override val rounds = bracketRoundsCoordinator.rounds
    override val losersBracket = bracketRoundsCoordinator.losersBracket

    private val _showDetails = MutableStateFlow(false)
    override val showDetails = _showDetails.asStateFlow()

    private val participantManagementCoordinator = EventParticipantManagementCoordinator(
        eventTeamsAndParticipantsLoadingInitially = false,
    )
    override val eventTeamsAndParticipantsLoading = participantManagementCoordinator.eventTeamsAndParticipantsLoading
    override val participantManagementSnapshot = participantManagementCoordinator.participantManagementSnapshot
    override val participantDivisionWarnings = participantManagementCoordinator.participantDivisionWarnings
    override val participantManagementLoading = participantManagementCoordinator.participantManagementLoading
    override val teamComplianceSummaries = participantManagementCoordinator.teamComplianceSummaries
    override val userComplianceSummaries = participantManagementCoordinator.userComplianceSummaries
    override val participantComplianceLoading = participantManagementCoordinator.participantComplianceLoading

    private val _eventMatchesLoading = MutableStateFlow(false)
    override val eventMatchesLoading = _eventMatchesLoading.asStateFlow()

    private val participantBootstrapCoordinator: EventParticipantBootstrapCoordinator = EventParticipantBootstrapCoordinator(
        selectedEvent = selectedEvent,
        participantManagementCoordinator = participantManagementCoordinator,
        weeklyOccurrenceCoordinator = weeklyOccurrenceCoordinator,
        operations = EventParticipantBootstrapOperations(
            getEvent = eventRepository::getEvent,
            syncCurrentUserRegistrationCacheForEvent = eventRepository::syncCurrentUserRegistrationCacheForEvent,
            syncEventParticipants = eventRepository::syncEventParticipants,
            syncEventDetail = eventRepository::syncEventDetail,
            refreshMatches = matchRepository::getMatchesOfTournament,
            observeParticipantManagementSnapshot = eventRepository::observeEventParticipantManagementSnapshot,
            observeTeamCompliance = eventRepository::observeEventTeamCompliance,
            observeUserCompliance = eventRepository::observeEventUserCompliance,
            loadParticipantManagementSnapshot = eventRepository::getEventParticipantManagementSnapshot,
            loadTeamCompliance = eventRepository::getEventTeamCompliance,
            loadUserCompliance = eventRepository::getEventUserCompliance,
            getEventParticipantsSummary = eventRepository::getEventParticipantsSummary,
        ),
        effects = EventParticipantBootstrapEffects(
            canManageParticipantData = { targetEvent -> canManageParticipantData(targetEvent) },
            refreshCurrentUserMembershipState = ::refreshCurrentUserMembershipState,
            applyBootstrapSyncResult = bootstrapResourcesCoordinator::applyEventDetailSyncResult,
            replaceStaffInvites = { staffInvites, staffRevision ->
                _eventStaffInvites.value = staffInvites
                staffRevision
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                    ?.let { revision -> _eventStaffRevision.value = revision }
            },
            setMatchesLoading = { loading -> _eventMatchesLoading.value = loading },
            showDetails = { _showDetails.value = true },
            setError = { error -> _errorState.value = error },
        ),
        scope = scope,
    )
    private val participantActionHandler = EventParticipantActionHandler(
        scope = scope,
        participantManagementCoordinator = participantManagementCoordinator,
        participantBootstrapCoordinator = participantBootstrapCoordinator,
        eventRepository = eventRepository,
        billingRepository = billingRepository,
        navigationHandler = navigationHandler,
        loadingHandler = { loadingHandler },
        selectedEvent = { selectedEvent.value },
        selectedDivision = ::selectDivision,
        requireSelectedWeeklyOccurrence = { event, errorMessage ->
            requireSelectedWeeklyOccurrence(event, errorMessage)
        },
        setMessage = { message -> _errorState.value = ErrorMessage(message) },
    )
    private val inviteActionHandler = EventInviteActionHandler(
        scope = scope,
        inviteCoordinator = eventInviteCoordinator,
        participantBootstrapCoordinator = participantBootstrapCoordinator,
        userRepository = userRepository,
        teamRepository = teamRepository,
        eventRepository = eventRepository,
        loadingHandler = { loadingHandler },
        selectedEvent = { selectedEvent.value },
        eventWithRelations = { eventWithRelations.value },
        selectedDivisionId = { selectedDivision.value },
        currentUserId = { currentUser.value.id },
        requireSelectedWeeklyOccurrence = { event, errorMessage ->
            requireSelectedWeeklyOccurrence(event, errorMessage)
        },
        setError = { error -> _errorState.value = error },
    )
    private val resourceLifecycleHandler = EventResourceLifecycleHandler(
        scope = scope,
        sportsRepository = sportsRepository,
        eventRepository = eventRepository,
        billingRepository = billingRepository,
        matchRepository = matchRepository,
        editDraftCoordinator = editDraftCoordinator,
        divisionContentCoordinator = divisionContentCoordinator,
        sportsCatalogCoordinator = sportsCatalogCoordinator,
        organizationTemplatesCoordinator = organizationTemplatesCoordinator,
        leagueStandingsCoordinator = leagueStandingsCoordinator,
        loadingHandler = { loadingHandler },
        selectedEvent = { selectedEvent.value },
        selectedDivisionId = { selectedDivision.value },
        selectDivision = ::selectDivision,
        refreshSelectedDivisionContent = ::refreshSelectedDivisionContent,
        setEventTags = { tags -> _eventTags.value = tags },
        setError = { error -> _errorState.value = error },
    )
    private val eventEditActionHandler = EventEditActionHandler(
        scope = scope,
        editActionCoordinator = editActionCoordinator,
        editDraftCoordinator = editDraftCoordinator,
        rentalResourcesCoordinator = rentalResourcesCoordinator,
        sportsCatalogCoordinator = sportsCatalogCoordinator,
        inviteCoordinator = eventInviteCoordinator,
        eventRepository = eventRepository,
        billingRepository = billingRepository,
        matchRepository = matchRepository,
        loadingHandler = { loadingHandler },
        selectedEvent = { selectedEvent.value },
        eventWithRelations = { eventWithRelations.value },
        eventFields = { eventFields.value },
        expectedStaffRevision = { _eventStaffRevision.value },
        setStaffState = { invites, revision ->
            _eventStaffInvites.value = invites
            _eventStaffRevision.value = revision
        },
        loadSports = resourceLifecycleHandler::loadSports,
        refreshLeagueStandingsAfterSchedule = resourceLifecycleHandler::refreshLeagueStandingsAfterSchedule,
        setError = { message -> _errorState.value = ErrorMessage(message) },
    )

    private val userTeams = relationStateCoordinator.currentUserTeams

    override val eventTeamCheckIns = eventTeamCheckInCoordinator.eventTeamCheckIns

    override val showEventTeamCheckInDialog = eventTeamCheckInCoordinator.showEventTeamCheckInDialog

    override val eventTeamCheckInSaving = eventTeamCheckInCoordinator.eventTeamCheckInSaving

    override val currentUserManagedEventTeamId = relationStateCoordinator.currentUserManagedEventTeamId

    private val cachedCurrentUserRegistrations = selectedEvent
        .map { selected -> selected.id.trim() }
        .distinctUntilChanged()
        .flatMapLatest { eventId ->
            if (eventId.isBlank()) {
                flowOf(emptyList())
            } else {
                eventRepository.observeCurrentUserRegistrationsForEvent(eventId)
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _scheduleTrackedUserIds = MutableStateFlow<Set<String>>(emptySet())
    override val scheduleTrackedUserIds = _scheduleTrackedUserIds.asStateFlow()

    private val membershipCoordinator = EventMembershipCoordinator(
        initialEvent = event,
        initialCurrentUserId = currentUser.value.id,
        initialCurrentUserTeamIds = relationStateCoordinator.currentUserTeamIds.value,
        initialWeeklyParentWithoutSelection = isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() == null,
    )

    override val validTeams = combine(
        userTeams,
        eventWithRelations,
        currentUser,
    ) { teams, relations, user ->
        val targetSportName = relations.sport?.name
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: relations.event.sportId
                ?.trim()
                .orEmpty()
        val normalizedTargetSport = targetSportName.lowercase()
        val relevantTeams = if (normalizedTargetSport.isNotBlank()) {
            teams.filter { teamWithPlayers ->
                teamWithPlayers.team.sport
                    ?.trim()
                    ?.lowercase() == normalizedTargetSport
            }
        } else {
            teams
        }
        val currentUserId = user.id.trim()
        relevantTeams.filter { teamWithPlayers ->
            teamWithPlayers.team.managerId?.trim() == currentUserId
        }
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    override val isEventFull = combine(
        eventWithRelations,
        selectedDivision,
        selectedWeeklyOccurrenceSummary,
        overviewParticipantSummary,
    ) { relations, division, weeklySummary, overviewSummary ->
        eventIsFullForRegistration(
            event = relations.event,
            teams = relations.teams,
            preferredDivisionId = division,
            selectedWeeklyOccurrenceSummary = weeklySummary,
            overviewParticipantSummary = overviewSummary,
        )
    }.stateIn(scope, SharingStarted.Eagerly, eventIsFullForRegistration(event, emptyList(), null))

    override val isUserInEvent = membershipCoordinator.isUserInEvent
    override val isRegistrationPaymentPending = membershipCoordinator.isRegistrationPaymentPending
    override val isRegistrationPaymentFailed = membershipCoordinator.isRegistrationPaymentFailed
    override val isUserInWaitlist = membershipCoordinator.isUserInWaitlist
    override val isUserFreeAgent = membershipCoordinator.isUserFreeAgent
    override val isUserCaptain = membershipCoordinator.isUserCaptain

    private val matchEditingCoordinator = EventMatchEditingCoordinator()
    override val isEditingMatches = matchEditingCoordinator.isEditingMatches
    override val editableMatches = matchEditingCoordinator.editableMatches
    override val editableRounds = matchEditingCoordinator.editableRounds
    override val showTeamSelectionDialog = matchEditingCoordinator.showTeamSelectionDialog
    override val showMatchEditDialog = matchEditingCoordinator.showMatchEditDialog
    private val matchEditActionHandler = EventMatchEditActionHandler(
        scope = scope,
        matchEditingCoordinator = matchEditingCoordinator,
        bracketRoundsCoordinator = bracketRoundsCoordinator,
        notificationCoordinator = notificationCoordinator,
        matchRepository = matchRepository,
        loadingHandler = { loadingHandler },
        selectedEvent = { selectedEvent.value },
        selectedDivisionId = { selectedDivision.value },
        eventWithRelations = { eventWithRelations.value },
        divisionFields = { divisionFields.value },
        canManageMatchEditing = ::canManageMatchEditing,
        canEditMatchesNow = ::canEditMatchesNow,
        setError = { message -> _errorState.value = ErrorMessage(message) },
    )

    override val joinChoiceDialog = registrationFlowCoordinator.joinChoiceDialog
    override val childJoinSelectionDialog = registrationFlowCoordinator.childJoinSelectionDialog

    override val teamJoinQuestionDialog = registrationFlowCoordinator.teamJoinQuestionDialog

    override val eventRegistrationQuestionDialog = registrationFlowCoordinator.questionDialog
    override val eventRegistrationQuestions = registrationFlowCoordinator.questions
    override val eventRegistrationQuestionAnswers = registrationFlowCoordinator.answers
    override val eventRegistrationQuestionsExpanded = registrationFlowCoordinator.questionsExpanded
    override val registrationHoldExpiresAt = registrationFlowCoordinator.holdExpiresAt
    override val paymentPlanPreviewDialog = registrationFlowCoordinator.paymentPlanPreviewDialog
    override val withdrawTargets = registrationFlowCoordinator.withdrawTargets
    override val textSignaturePrompt = registrationFlowCoordinator.textSignaturePrompt
    override val webSignaturePrompt = registrationFlowCoordinator.webSignaturePrompt

    private val externalActionHandler = EventExternalActionHandler(
        scope = scope,
        eventRepository = eventRepository,
        billingRepository = billingRepository,
        apiClient = apiClient,
        loadingHandler = { loadingHandler },
        urlHandler = { urlHandler },
        selectedEvent = { selectedEvent.value },
        navigateBack = backCallback::onBack,
        setMessage = { message -> _errorState.value = ErrorMessage(message) },
    )
    private val registrationLifecycleHandler = EventRegistrationLifecycleHandler(
        userRepository = userRepository,
        teamRepository = teamRepository,
        eventRepository = eventRepository,
        billingRepository = billingRepository,
        currentUserDataSource = currentUserDataSource,
        registrationFlowCoordinator = registrationFlowCoordinator,
        divisionContentCoordinator = divisionContentCoordinator,
        membershipCoordinator = membershipCoordinator,
        joinConfirmationCoordinator = joinConfirmationCoordinator,
        participantBootstrapCoordinator = participantBootstrapCoordinator,
        weeklyOccurrenceCoordinator = weeklyOccurrenceCoordinator,
        selectedEvent = { selectedEvent.value },
        selectedDivisionId = { selectedDivision.value },
        currentUser = { currentUser.value },
        cachedCurrentUserRegistrations = { cachedCurrentUserRegistrations.value },
        profileTeamIds = { relationStateCoordinator.currentUserTeamIds.value.toList() },
        currentWeeklyOccurrenceSelection = ::currentWeeklyOccurrenceSelection,
        showPaymentLoading = ::showRegistrationPaymentLoading,
        finishPaymentLoading = ::finishRegistrationPaymentLoading,
        refreshEventDetails = ::refreshEventDetails,
        clearPaymentResult = ::clearPaymentResult,
        setScheduleTrackedUserIds = { ids -> _scheduleTrackedUserIds.value = ids },
        setMessage = { message -> _errorState.value = ErrorMessage(message) },
    )
    private val registrationActionHandler = EventRegistrationActionHandler(
        scope = scope,
        userRepository = userRepository,
        teamRepository = teamRepository,
        eventRepository = eventRepository,
        billingRepository = billingRepository,
        registrationFlowCoordinator = registrationFlowCoordinator,
        joinExecutionCoordinator = joinExecutionCoordinator,
        withdrawalActionCoordinator = withdrawalActionCoordinator,
        paymentPlanBillingCoordinator = paymentPlanBillingCoordinator,
        purchaseIntentCoordinator = purchaseIntentCoordinator,
        signatureExecutionCoordinator = signatureExecutionCoordinator,
        membershipCoordinator = membershipCoordinator,
        weeklyOccurrenceCoordinator = weeklyOccurrenceCoordinator,
        loadingHandler = { loadingHandler },
        showPaymentLoading = ::showRegistrationPaymentLoading,
        finishPaymentLoading = ::finishRegistrationPaymentLoading,
        selectedEvent = { selectedEvent.value },
        selectedDivision = { selectedDivision.value },
        currentUser = { currentUser.value },
        canManageSelectedEvent = { event, user ->
            canManageParticipantData(
                event = event,
                user = user,
                organization = eventWithRelations.value.organization,
            )
        },
        currentAccountEmail = { _currentAccount.value.email },
        isEventFull = { isEventFull.value },
        currentWeeklyOccurrenceSelection = ::currentWeeklyOccurrenceSelection,
        requireSelectedWeeklyOccurrence = ::requireSelectedWeeklyOccurrence,
        loadJoinableChildren = registrationLifecycleHandler::loadJoinableChildren,
        saveCurrentRegistrationProgress = registrationLifecycleHandler::saveCurrentRegistrationProgress,
        clearCurrentRegistrationProgress = registrationLifecycleHandler::clearCurrentRegistrationProgress,
        addCurrentUserToEventWithRegistrationAnswers =
            registrationLifecycleHandler::addCurrentUserToEventWithRegistrationAnswers,
        addTeamToEventWithRegistrationAnswers =
            registrationLifecycleHandler::addTeamToEventWithRegistrationAnswers,
        createPurchaseIntentWithRegistrationAnswers =
            registrationLifecycleHandler::createPurchaseIntentWithRegistrationAnswers,
        refreshEventAfterParticipantMutation = participantBootstrapCoordinator::refreshEventAfterParticipantMutation,
        refreshCurrentUserMembershipState = ::refreshCurrentUserMembershipState,
        refreshEventDetails = ::refreshEventDetails,
        checkIsUserFreeAgent = registrationLifecycleHandler::checkIsUserFreeAgent,
        resolveWithdrawTargetMembership = registrationLifecycleHandler::resolveWithdrawTargetMembership,
        setPaymentIntent = { intent -> setPaymentIntent(intent) },
        clearPaymentResult = ::clearPaymentResult,
        presentPaymentSheet = ::presentPaymentSheet,
        setError = { message -> _errorState.value = ErrorMessage(message) },
    )

    private fun ensureEventRegistrationQuestionsAnswered(onReady: () -> Unit): Boolean {
        return registrationFlowCoordinator.ensureQuestionsAnswered(
            eventName = selectedEvent.value.name,
            onReady = onReady,
        )
    }

    override fun continueFromDiscountCodePrompt(code: String?) {
        registrationFlowCoordinator.continueFromDiscountCodePrompt(code)
    }

    override fun applyDiscountCodePrompt(code: String) {
        registrationFlowCoordinator.applyDiscountCodePrompt(code)
    }

    override fun clearDiscountCodePromptFeedback() {
        registrationFlowCoordinator.clearDiscountCodePromptFeedback()
    }

    override fun dismissDiscountCodePrompt() {
        registrationFlowCoordinator.dismissDiscountCodePrompt()
    }

    private val lifecycleBindings = EventDetailLifecycleBindings(scope)

    init {
        backHandler.register(backCallback)
        lifecycle.doOnDestroy(::finishRegistrationPaymentLoading)
        if (editDraftCoordinator.isEditing.value) {
            resourceLifecycleHandler.loadSports(reportErrors = true)
        }
        resourceLifecycleHandler.loadEventTags()
        lifecycleBindings.bindOrganizationTemplates(
            selectedEvent,
            resourceLifecycleHandler::loadOrganizationTemplates,
        )
        lifecycleBindings.bindSelectedEventResources(selectedEvent) { eventId ->
            participantBootstrapCoordinator.hydrateMobileEventDetail(
                showDetailsOnSuccess = false,
                showLoading = false,
                reportErrors = false,
            )
            eventEditActionHandler.loadAvailableRentalResources(eventId)
        }
        lifecycleBindings.bindScheduleTrackedUser(
            currentUser,
            registrationLifecycleHandler::refreshScheduleTrackedUserIds,
        )
        lifecycleBindings.bindRegistrationScope(
            selectedEvent = selectedEvent,
            currentUser = currentUser,
            selectedWeeklyOccurrence = weeklyOccurrenceCoordinator.selectedWeeklyOccurrence,
            onMissingScope = registrationFlowCoordinator::clearForMissingRegistrationScope,
            onScopeChanged = registrationLifecycleHandler::loadRegistrationLifecycleScope,
        )
        lifecycleBindings.bindSelectedEventMode(
            selectedEvent,
            participantBootstrapCoordinator::onSelectedEventChanged,
        )
        lifecycleBindings.bindEventTeamCheckIns(
            selectedEvent = selectedEvent,
            eventWithRelations = eventWithRelations,
            currentUser = currentUser,
            currentUserManagedEventTeamId = currentUserManagedEventTeamId,
        ) {
            refreshEventTeamCheckInsIfAllowed()
            evaluateEventTeamCheckInPrompt()
        }
        lifecycleBindings.bindWeeklyOccurrence(
            weeklyOccurrenceCoordinator.selectedWeeklyOccurrence,
            participantBootstrapCoordinator::onWeeklyOccurrenceChanged,
        )
        lifecycleBindings.bindParticipantLocalState(
            participantBootstrapCoordinator.participantLocalStateFlow(),
            participantBootstrapCoordinator::applyLocalState,
        )
        lifecycleBindings.bindManagedParticipantBootstrap(
            participantBootstrapCoordinator.managedBootstrapTargetFlow(
                currentUser,
                eventOrganization,
            ) { eventValue, user, organization ->
                canManageParticipantData(
                    event = eventValue,
                    user = user,
                    organization = organization,
                )
            },
            participantBootstrapCoordinator::refreshManagedBootstrap,
        )
        lifecycleBindings.bindMembershipSources(
            registrations = cachedCurrentUserRegistrations,
            currentUserTeams = relationStateCoordinator.currentUserTeamIds,
            selectedEvent = selectedEvent,
            refreshMembership = ::refreshCurrentUserMembershipState,
        )
        lifecycleBindings.bindEditingBackCallback(editDraftCoordinator.isEditing) { isEditing ->
            backCallback.isEnabled = isEditing
        }
        lifecycleBindings.bindDetailsBackCallback(_showDetails) { showDetails ->
            backCallback.isEnabled = showDetails
        }
        lifecycleBindings.bindPaymentResults(
            paymentResult,
            registrationLifecycleHandler::handleRegistrationPaymentResult,
        )
        lifecycleBindings.bindMatchRealtime(
            selectedEventId = selectedEventId,
            isEditing = editDraftCoordinator.isEditing,
            isEditingMatches = matchEditingCoordinator.isEditingMatches,
            resetIgnoredMatch = { matchRepository.setIgnoreMatch(null) },
            subscribe = { eventId -> matchRepository.subscribeToMatches(eventId) },
            setEditingPaused = { paused ->
                matchRepository.setRealtimePaused(MATCH_REALTIME_EDIT_PAUSE_REASON, paused)
            },
            unsubscribe = { matchRepository.unsubscribeFromRealtime() },
        )
        lifecycleBindings.bindEventRelations(
            eventWithRelations,
            resourceLifecycleHandler::handleEventRelationsChanged,
        )
        lifecycleBindings.bindSelectedEventMembership(selectedEvent, ::refreshCurrentUserMembershipState)
        lifecycleBindings.bindDefaultDivision(
            selectedEvent,
            resourceLifecycleHandler::handleDefaultDivisionChanged,
        )
        lifecycleBindings.bindWithdrawTargets(
            selectedEvent,
            selectedWeeklyOccurrence,
            registrationLifecycleHandler::refreshWithdrawTargets,
        )
        lifecycleBindings.bindReadOnlyDraft(
            eventWithRelations,
            eventFields,
            editDraftCoordinator.isEditing,
            resourceLifecycleHandler::handleReadOnlyDraftStateChanged,
        )
        lifecycleBindings.bindSelectedDivision(
            selectedDivision,
            resourceLifecycleHandler::handleSelectedDivisionChanged,
        )
        lifecycleBindings.bindLeagueStandings(
            selectedEvent,
            selectedDivision,
            resourceLifecycleHandler::resolveLeagueStandingsLifecycleTarget,
            resourceLifecycleHandler::loadLeagueStandingsLifecycleTarget,
        )
        lifecycleBindings.bindDivisionMatches(
            divisionContentCoordinator.divisionMatches,
            ::generateRounds,
        )
    }

    override fun onNavigateToChat(user: UserData) {
        navigationHandler.navigateToChat(messageUserId = user.id)
    }

    override fun matchSelected(selectedMatch: MatchWithRelations) {
        navigationHandler.navigateToMatch(
            matchId = selectedMatch.match.id,
            eventId = selectedEvent.value.id,
        )
    }

    override fun selectDivision(division: String) {
        divisionContentCoordinator.selectDivision(
            division = division,
            selectedEvent = selectedEvent.value,
            relations = eventWithRelations.value,
        )
        if (matchEditingCoordinator.isEditingMatches.value) {
            matchEditActionHandler.refreshEditableRounds()
        }
    }

    private fun refreshSelectedDivisionContent() {
        divisionContentCoordinator.refreshSelectedDivisionContent(
            selectedEvent = selectedEvent.value,
            relations = eventWithRelations.value,
        )
        if (matchEditingCoordinator.isEditingMatches.value) {
            matchEditActionHandler.refreshEditableRounds()
        }
    }

    override fun refreshLeagueStandings() = resourceLifecycleHandler.refreshLeagueStandings()

    override fun confirmLeagueStandings(applyReassignment: Boolean) =
        resourceLifecycleHandler.confirmLeagueStandings(applyReassignment)

    override fun onHostCreateAccount() {
        scope.launch {
            val loadingOperation = loadingHandler.newOperation()
            loadingOperation.showLoading("Redirecting to Stripe On Boarding ...")
            try {
                billingRepository.createAccount().onSuccess { onBoardingUrl ->
                    urlHandler?.openUrlInWebView(
                        url = onBoardingUrl,
                    )
                }.onFailure {
                    _errorState.value = ErrorMessage(it.userMessage())
                }
            } finally {
                loadingOperation.hideLoading()
            }
        }
    }

    override fun toggleBracketView() {
        _isBracketView.value = !_isBracketView.value
    }

    override fun toggleLosersBracket() {
        bracketRoundsCoordinator.toggleLosersBracket(divisionContentCoordinator.divisionMatches.value)
        if (matchEditingCoordinator.isEditingMatches.value) {
            matchEditActionHandler.refreshEditableRounds()
        }
    }

    override fun onUploadSelected(photo: GalleryPhotoResult, onRetry: () -> Unit) {
        scope.launch {
            when (val outcome = imageCoordinator.uploadSelected(photo, loadingHandler)) {
                is EventImageUploadOutcome.Success -> Unit
                is EventImageUploadOutcome.Failure -> {
                    _errorState.value = eventImageRetryError(
                        message = eventImageFailureMessage(outcome.reason),
                        onRetry = onRetry,
                    )
                }
            }
        }
    }

    override fun deleteImage(imageId: String, onDeleted: () -> Unit) {
        scope.launch {
            imageCoordinator.deleteImage(imageId, loadingHandler)
                .onSuccess { onDeleted() }
                .onFailure {
                    _errorState.value = eventImageRetryError(
                        message = eventImageFailureMessage(EventImageFailure.DELETE),
                        onRetry = { deleteImage(imageId, onDeleted) },
                    )
                }
        }
    }

    private fun currentWeeklyOccurrenceSelection(): EventOccurrenceSelection? {
        return weeklyOccurrenceCoordinator.currentSelection()
    }

    private fun requireSelectedWeeklyOccurrence(
        event: Event = selectedEvent.value,
        errorMessage: String = "Select an occurrence before continuing.",
    ): EventOccurrenceSelection? {
        if (!isWeeklyParentEvent(event)) {
            return null
        }
        return currentWeeklyOccurrenceSelection() ?: run {
            _errorState.value = ErrorMessage(errorMessage)
            null
        }
    }

    override fun joinEvent() {
        if (openAffiliateEventRegistration(selectedEvent.value)) {
            return
        }
        registrationActionHandler.joinEvent()
    }

    private fun openAffiliateEventRegistration(event: Event): Boolean {
        val affiliateUrl = event.normalizedAffiliateUrl() ?: return false
        val eventProperties = buildMap {
            put("event_id", event.id)
            put("event_type", event.eventType.name)
            put("registration_type", "affiliate")
            put("source", "event_detail")
            put("team_signup", event.teamSignup.toString())
            event.organizationId?.trim()?.takeIf(String::isNotBlank)?.let { put("organization_id", it) }
            event.sportId?.trim()?.takeIf(String::isNotBlank)?.let { put("sport_id", it) }
        }
        AnalyticsTracker.capture(
            AnalyticsEvent.EventOutboundClicked,
            eventProperties + AnalyticsTracker.destinationProperties(affiliateUrl),
        )
        AnalyticsTracker.capture(
            AnalyticsEvent.EventRegistrationStarted,
            eventProperties + mapOf("destination_selected" to "true"),
        )
        scope.launch {
            val result = urlHandler?.openUrlInWebView(affiliateUrl)
            if (result == null) {
                _errorState.value = ErrorMessage("Unable to open registration link.")
                return@launch
            }
            result.onFailure { throwable ->
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Unable to open registration link."),
                )
            }
        }
        return true
    }

    override fun startTeamRegistration(team: TeamWithPlayers) {
        registrationActionHandler.startTeamRegistration(team)
    }

    override fun submitTeamJoinQuestionAnswers(answers: Map<String, String>) {
        registrationActionHandler.submitTeamJoinQuestionAnswers(answers)
    }

    override fun dismissTeamJoinQuestionDialog() {
        registrationActionHandler.dismissTeamJoinQuestionDialog()
    }

    override fun selectWeeklySession(
        sessionStart: Instant,
        sessionEnd: Instant,
        slotId: String?,
        occurrenceDate: String?,
        label: String?,
    ) {
        when (
            val result = weeklyOccurrenceCoordinator.selectWeeklySession(
                isWeeklyParent = isWeeklyParentEvent(selectedEvent.value),
                sessionStart = sessionStart,
                sessionEnd = sessionEnd,
                slotId = slotId,
                occurrenceDate = occurrenceDate,
                label = label,
            )
        ) {
            is WeeklySessionSelectionResult.Rejected -> {
                _errorState.value = ErrorMessage(result.message)
            }
            is WeeklySessionSelectionResult.Selected -> Unit
        }
    }

    override fun prefetchWeeklyOccurrenceSummaries(occurrences: List<EventOccurrenceSelection>) {
        participantBootstrapCoordinator.prefetchWeeklyOccurrenceSummaries(occurrences)
    }

    override fun clearSelectedWeeklySession() {
        participantBootstrapCoordinator.clearSelectedWeeklySession()
    }

    override fun joinEventAsTeam(team: TeamWithPlayers) {
        if (openAffiliateEventRegistration(selectedEvent.value)) {
            return
        }
        registrationActionHandler.joinEventAsTeam(team)
    }

    override fun confirmJoinAsSelf() {
        registrationActionHandler.confirmJoinAsSelf()
    }

    override fun showChildJoinSelection() {
        registrationActionHandler.showChildJoinSelection()
    }

    override fun selectChildForJoin(childUserId: String) {
        registrationActionHandler.selectChildForJoin(childUserId)
    }

    override fun dismissJoinChoiceDialog() {
        registrationActionHandler.dismissJoinChoiceDialog()
    }

    override fun dismissChildJoinSelectionDialog() {
        registrationActionHandler.dismissChildJoinSelectionDialog()
    }

    override fun requestRefund(reason: String, targetUserId: String?) {
        registrationActionHandler.requestRefund(reason, targetUserId)
    }

    override fun withdrawAndRefund(targetUserId: String?) {
        registrationActionHandler.withdrawAndRefund(targetUserId)
    }

    override fun leaveEvent(targetUserId: String?) {
        registrationActionHandler.leaveEvent(targetUserId)
    }

    override fun viewEvent() {
        if (selectedEvent.value.isAffiliateEvent()) {
            return
        }
        _showDetails.value = true
    }

    override fun toggleDetails() {
        if (_showDetails.value) {
            _showDetails.value = false
        } else {
            viewEvent()
        }
    }

    override fun refreshEventDetails() {
        participantBootstrapCoordinator.hydrateMobileEventDetail(
            showDetailsOnSuccess = false,
            showLoading = true,
            reportErrors = true,
        )
    }

    override fun toggleEdit() = eventEditActionHandler.toggleEdit()

    override fun startEditingEvent() = eventEditActionHandler.startEditingEvent()

    override fun cancelEditingEvent() = eventEditActionHandler.cancelEditingEvent()

    override fun editEventField(update: Event.() -> Event) =
        eventEditActionHandler.editEventField(update)

    override fun editTournamentField(update: Event.() -> Event) =
        eventEditActionHandler.editEventField(update)

    override fun searchUsers(query: String) = inviteActionHandler.searchUsers(query)

    override fun searchInviteTeams(query: String) = inviteActionHandler.searchInviteTeams(query)

    override fun inviteTeamToEvent(team: Team) = inviteActionHandler.inviteTeamToEvent(team)

    override fun invitePlayerToEvent(user: UserData) = inviteActionHandler.invitePlayerToEvent(user)

    override fun invitePlayerToEventByEmail(firstName: String, lastName: String, email: String) =
        inviteActionHandler.invitePlayerToEventByEmail(firstName, lastName, email)

    override suspend fun addPendingStaffInvite(
        firstName: String,
        lastName: String,
        email: String,
        roles: Set<EventStaffRole>,
    ): Result<Unit> = inviteActionHandler.addPendingStaffInvite(
        firstName = firstName,
        lastName = lastName,
        email = email,
        roles = roles,
        editedEvent = editDraftCoordinator.editedEvent.value,
    )

    override fun removePendingStaffInvite(email: String, role: EventStaffRole?) {
        inviteActionHandler.removePendingStaffInvite(email, role)
    }

    override fun updateEvent() = eventEditActionHandler.updateEvent()

    override fun rescheduleEvent() = eventEditActionHandler.rescheduleEvent()

    override fun buildBrackets() = eventEditActionHandler.buildBrackets()

    override fun rebuildWithoutPlaceholderTeams() =
        eventEditActionHandler.rebuildWithoutPlaceholderTeams()

    override fun createTemplateFromCurrentEvent() =
        eventEditActionHandler.createTemplateFromCurrentEvent()

    override fun publishEvent() = eventEditActionHandler.publishEvent()

    override fun createNewTeam() = participantActionHandler.createNewTeam()

    override fun inviteFreeAgentToTeam(userId: String) =
        participantActionHandler.inviteFreeAgentToTeam(userId)

    override fun startManagingParticipants() = participantActionHandler.startManagingParticipants()

    override fun stopManagingParticipants() = Unit

    override fun moveTeamParticipantDivision(team: TeamWithPlayers, divisionId: String) =
        participantActionHandler.moveTeamParticipantDivision(team, divisionId)

    override fun removeTeamParticipant(team: TeamWithPlayers) =
        participantActionHandler.removeTeamParticipant(team)

    override fun removeUserParticipant(userId: String) =
        participantActionHandler.removeUserParticipant(userId)

    override suspend fun getParticipantBillingSnapshot(teamId: String): Result<EventTeamBillingSnapshot> =
        participantActionHandler.getParticipantBillingSnapshot(teamId)

    override suspend fun createParticipantBill(
        teamId: String,
        request: EventTeamBillCreateRequest,
    ): Result<Unit> = participantActionHandler.createParticipantBill(teamId, request)

    override suspend fun createParticipantPaymentCheckout(
        teamId: String,
        request: EventTeamPaymentCheckoutRequest,
    ): Result<EventTeamPaymentCheckout> =
        participantActionHandler.createParticipantPaymentCheckout(teamId, request)

    override suspend fun refundParticipantPayment(
        teamId: String,
        billPaymentId: String,
        amountCents: Int,
    ): Result<Unit> =
        participantActionHandler.refundParticipantPayment(teamId, billPaymentId, amountCents)

    override suspend fun reviewParticipantManualPaymentProof(
        billId: String,
        billPaymentId: String,
        proofId: String,
        decision: String,
        amountAcceptedCents: Int?,
        reviewNote: String?,
    ): Result<Unit> = participantActionHandler.reviewParticipantManualPaymentProof(
        billId = billId,
        billPaymentId = billPaymentId,
        proofId = proofId,
        decision = decision,
        amountAcceptedCents = amountAcceptedCents,
        reviewNote = reviewNote,
    )

    override fun selectPlace(place: MVPPlace?) = eventEditActionHandler.selectPlace(place)

    override fun onTypeSelected(type: EventType) = eventEditActionHandler.onTypeSelected(type)

    private fun generateRounds() {
        bracketRoundsCoordinator.refreshRounds(divisionContentCoordinator.divisionMatches.value)
    }

    override fun selectFieldCount(count: Int) = eventEditActionHandler.selectFieldCount(count)

    override fun updateLocalFieldName(index: Int, name: String) =
        eventEditActionHandler.updateLocalFieldName(index, name)

    override fun setRentalResourceSelected(optionId: String, selected: Boolean) =
        eventEditActionHandler.setRentalResourceSelected(optionId, selected)

    override fun updateLeagueScoringConfig(update: LeagueScoringConfigDTO.() -> LeagueScoringConfigDTO) =
        eventEditActionHandler.updateLeagueScoringConfig(update)

    override fun addLeagueTimeSlot() = eventEditActionHandler.addLeagueTimeSlot()

    override fun updateLeagueTimeSlot(index: Int, update: TimeSlot.() -> TimeSlot) =
        eventEditActionHandler.updateLeagueTimeSlot(index, update)

    override fun removeLeagueTimeSlot(index: Int) = eventEditActionHandler.removeLeagueTimeSlot(index)

    override fun checkIsUserWaitListed(event: Event): Boolean =
        registrationLifecycleHandler.checkIsUserWaitListed(event)

    override fun deleteEvent() = externalActionHandler.deleteEvent()

    override fun reportEvent(notes: String?) = externalActionHandler.reportEvent(notes)

    override fun shareEvent() = externalActionHandler.shareEvent()

    override fun shareEventQrCode() = externalActionHandler.shareEventQrCode()

    override fun openEventDirections() = externalActionHandler.openEventDirections()

    override fun checkIsUserFreeAgent(event: Event): Boolean =
        registrationLifecycleHandler.checkIsUserFreeAgent(event)

    private suspend fun refreshCurrentUserMembershipState(event: Event) =
        registrationLifecycleHandler.refreshCurrentUserMembershipState(event)

    override fun dismissPaymentPlanPreviewDialog() {
        registrationActionHandler.dismissPaymentPlanPreviewDialog()
    }

    override fun confirmPaymentPlanPreviewDialog() {
        registrationActionHandler.confirmPaymentPlanPreviewDialog()
    }

    override fun confirmTextSignature() {
        registrationActionHandler.confirmTextSignature()
    }

    override fun dismissTextSignature() {
        registrationActionHandler.dismissTextSignature()
    }

    override fun dismissWebSignaturePrompt() {
        registrationActionHandler.dismissWebSignaturePrompt()
    }

    override fun submitBillingAddress(address: BillingAddressDraft) {
        registrationActionHandler.submitBillingAddress(address)
    }

    override fun dismissBillingAddressPrompt() {
        registrationActionHandler.dismissBillingAddressPrompt()
    }

    override fun startEditingMatches() = matchEditActionHandler.startEditingMatches()

    override fun cancelEditingMatches() = matchEditActionHandler.cancelEditingMatches()

    override fun commitMatchChanges() = matchEditActionHandler.commitMatchChanges()

    override fun updateEditableMatch(matchId: String, updater: (MatchMVP) -> MatchMVP) =
        matchEditActionHandler.updateEditableMatch(matchId, updater)

    override fun setLockForEditableMatches(matchIds: List<String>, locked: Boolean) =
        matchEditActionHandler.setLockForEditableMatches(matchIds, locked)

    override fun addScheduleMatch() = matchEditActionHandler.addScheduleMatch()

    override fun addBracketMatch() = matchEditActionHandler.addBracketMatch()

    override fun addBracketMatchFromAnchor(anchorMatchId: String, slot: BracketAddSlot) =
        matchEditActionHandler.addBracketMatchFromAnchor(anchorMatchId, slot)

    override fun showTeamSelection(matchId: String, position: TeamPosition) =
        matchEditActionHandler.showTeamSelection(matchId, position)

    override fun selectTeamForMatch(matchId: String, position: TeamPosition, teamId: String?) =
        matchEditActionHandler.selectTeamForMatch(matchId, position, teamId)

    override fun dismissTeamSelection() = matchEditActionHandler.dismissTeamSelection()

    override fun showMatchEditDialog(
        match: MatchWithRelations,
        creationContext: MatchCreateContext,
        isCreateMode: Boolean,
    ) = matchEditActionHandler.showMatchEditDialog(match, creationContext, isCreateMode)

    override suspend fun sendNotification(title: String, message: String): Result<Unit> =
        matchEditActionHandler.sendNotification(title, message)

    override fun dismissMatchEditDialog() = matchEditActionHandler.dismissMatchEditDialog()

    override fun deleteMatchFromDialog(matchId: String) =
        matchEditActionHandler.deleteMatchFromDialog(matchId)

    override fun updateMatchFromDialog(updatedMatch: MatchWithRelations) =
        matchEditActionHandler.updateMatchFromDialog(updatedMatch)

}
