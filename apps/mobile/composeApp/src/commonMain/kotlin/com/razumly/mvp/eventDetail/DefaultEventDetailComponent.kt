@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameters
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.isPaymentPending
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.FeeBreakdown
import com.razumly.mvp.core.data.repositories.FamilyChild
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.IImagesRepository
import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.repositories.ISportsRepository
import com.razumly.mvp.core.data.repositories.SelfRegistrationResult
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.SignerContext
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.TeamJoinQuestion
import com.razumly.mvp.core.data.repositories.TeamRegistrationResult
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.LeagueDivisionStandings
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.data.repositories.RentalResourceOption
import com.razumly.mvp.core.data.repositories.EventTeamBillCreateRequest
import com.razumly.mvp.core.data.repositories.EventTeamBillingSnapshot
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckout
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckoutRequest
import com.razumly.mvp.core.data.repositories.EventComplianceUserSummary
import com.razumly.mvp.core.data.repositories.EventDetailSyncResult
import com.razumly.mvp.core.data.repositories.EventParticipantManagementSnapshot
import com.razumly.mvp.core.data.repositories.EventParticipantDivisionWarning
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantsSummary
import com.razumly.mvp.core.data.repositories.EventParticipantsSyncResult
import com.razumly.mvp.core.data.repositories.EventTeamComplianceSummary
import com.razumly.mvp.core.data.repositories.UserVisibilityContext
import com.razumly.mvp.core.data.repositories.userMessage
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.presentation.PaymentResult
import com.razumly.mvp.core.presentation.util.ShareServiceProvider
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.eventDetail.data.BracketNode
import com.razumly.mvp.eventDetail.data.IMatchRepository
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import io.github.aakira.napier.Napier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
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
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private data class WithdrawTargetsRefreshKey(
    val eventId: String,
    val occurrenceKey: String?,
    val teamSignup: Boolean,
    val eventType: EventType,
    val playerIds: List<String>,
    val waitListIds: List<String>,
    val freeAgentIds: List<String>,
    val teamIds: List<String>,
)

private fun FamilyChild.toJoinChildOption(): JoinChildOption {
    val normalizedFirstName = firstName.trim()
    val normalizedLastName = lastName.trim()
    val fullName = listOf(normalizedFirstName, normalizedLastName)
        .filter { it.isNotBlank() }
        .joinToString(" ")
        .ifBlank { "Child" }
    val normalizedEmail = email?.trim()?.takeIf(String::isNotBlank)
    return JoinChildOption(
        userId = userId,
        fullName = fullName,
        email = normalizedEmail,
        hasEmail = hasEmail ?: (normalizedEmail != null),
    )
}

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultEventDetailComponent(
    componentContext: ComponentContext,
    private val userRepository: IUserRepository,
    fieldRepository: IFieldRepository,
    event: Event,
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

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()
    private val registrationFlowCoordinator = EventRegistrationFlowCoordinator()
    private val joinExecutionCoordinator = EventJoinExecutionCoordinator(registrationFlowCoordinator)
    private val withdrawalActionCoordinator = EventWithdrawalActionCoordinator(registrationFlowCoordinator)
    private val paymentPlanBillingCoordinator = EventPaymentPlanBillingCoordinator()
    private val purchaseIntentCoordinator = EventPurchaseIntentCoordinator(registrationFlowCoordinator)
    private val signatureExecutionCoordinator = EventSignatureExecutionCoordinator(registrationFlowCoordinator)
    private val detailHydrationCoordinator = EventDetailHydrationCoordinator()
    private val joinConfirmationCoordinator = EventJoinConfirmationCoordinator()
    private val eventInviteCoordinator = EventInviteCoordinator()
    override val suggestedUsers = eventInviteCoordinator.suggestedUsers
    override val inviteTeamSuggestions = eventInviteCoordinator.inviteTeamSuggestions
    override val inviteTeamsLoading = eventInviteCoordinator.inviteTeamsLoading
    override val pendingStaffInvites = eventInviteCoordinator.pendingStaffInvites
    override val billingAddressPrompt = registrationFlowCoordinator.billingAddressPrompt
    override val startingTeamRegistrationId = registrationFlowCoordinator.startingTeamRegistrationId

    private lateinit var loadingHandler: LoadingHandler

    override fun setLoadingHandler(loadingHandler: LoadingHandler) {
        this.loadingHandler = loadingHandler
    }

    override fun clearError() {
        _errorState.value = null
    }

    override fun updateEventRegistrationQuestionAnswer(questionId: String, answer: String) {
        if (!registrationFlowCoordinator.updateQuestionAnswer(questionId, answer)) return
        scope.launch {
            saveCurrentRegistrationProgress(step = "questions")
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
            saveCurrentRegistrationProgress(step = "questions")
            result.continuation?.invoke()
        }
    }

    override fun registrationHoldExpired() {
        scope.launch {
            clearCurrentRegistrationProgress()
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
    private var sportsLoadJob: Job? = null
    private val sportsCatalogCoordinator = EventSportsCatalogCoordinator()

    private val eventRelations: StateFlow<EventWithRelations> =
        eventRepository.getCachedEventWithRelationsFlow(event.id).map { result ->
            result.getOrElse {
                _errorState.value = ErrorMessage(it.userMessage())
                EventWithRelations(event, null)
            }
        }.stateIn(
            scope,
            SharingStarted.Eagerly,
            EventWithRelations(event, null)
        )

    override val sports = sportsCatalogCoordinator.sports
    override val divisionTypeParameters = sportsCatalogCoordinator.divisionTypeParameters

    override val selectedEvent: StateFlow<Event> =
        eventRelations.map { it.event }.stateIn(scope, SharingStarted.Eagerly, event)

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

    private val selectedEventId: StateFlow<String> = selectedEvent
        .map { selected -> selected.id.trim() }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.Eagerly, event.id.trim())

    private val eventRelationPlayers: StateFlow<List<UserData>> = eventRelations
        .map { relations -> relations.players }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val eventRelationHost: StateFlow<UserData?> = eventRelations
        .map { relations -> relations.host }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.Eagerly, eventRelations.value.host)

    private val eventRelationTeamIds: StateFlow<List<String>> = combine(
        selectedEvent,
        eventRelations,
    ) { selected, relations ->
        val registeredTeamIds = selected.teamIds.normalizedTeamIds()
        if (selected.teamSignup) {
            registeredTeamIds
        } else {
            (registeredTeamIds + relations.teams.map { team -> team.id }).normalizedTeamIds()
        }
    }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.Eagerly, event.teamIds.normalizedTeamIds())

    private val eventMatches: StateFlow<List<MatchWithRelations>> = selectedEventId
        .flatMapLatest { eventId ->
            if (eventId.isBlank()) {
                flowOf(emptyList())
            } else {
                matchRepository.getCachedMatchesOfTournamentFlow(eventId).map { result ->
                    result.getOrElse {
                        _errorState.value = ErrorMessage("Error loading matches: ${it.userMessage()}")
                        emptyList()
                    }
                }
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val eventTeams: StateFlow<List<TeamWithPlayers>> = eventRelationTeamIds
        .flatMapLatest { relationTeamIds ->
            if (relationTeamIds.isEmpty()) {
                flowOf(emptyList())
            } else {
                teamRepository.getTeamsFlow(relationTeamIds).map { result ->
                    result.getOrElse {
                        _errorState.value = ErrorMessage("Failed to load teams: ${it.userMessage()}")
                        emptyList()
                    }
                }
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val eventHost: StateFlow<UserData?> = combine(
        selectedEvent
            .map { selected -> selected.id to selected.hostId.trim() }
            .distinctUntilChanged(),
        eventRelationHost,
    ) { (eventId, hostId), host ->
        Triple(eventId, hostId, host)
    }.flatMapLatest { (eventId, hostId, host) ->
        if (host != null || hostId.isBlank()) {
            flowOf(host)
        } else {
            userRepository.getUsersFlow(
                userIds = listOf(hostId),
                visibilityContext = UserVisibilityContext(eventId = eventId),
            ).map { result ->
                result.getOrElse { emptyList() }.firstOrNull()
            }
        }
    }.stateIn(scope, SharingStarted.Eagerly, eventRelations.value.host)

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
        if (fieldIds.isEmpty() || !bootstrapped) {
            flowOf(emptyList())
        } else {
            fieldRepository.getFieldsWithMatchesFlow(fieldIds)
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
        eventTeamsAndParticipantsLoadingInitially = event.id.isNotBlank() && event.eventType != EventType.WEEKLY_EVENT,
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

    private var eventDetailHydrationJob: Job? = null
    private var weeklyOccurrenceSummaryPrefetchJob: Job? = null

    override val showFeeBreakdown = registrationFlowCoordinator.showFeeBreakdown
    override val currentFeeBreakdown = registrationFlowCoordinator.currentFeeBreakdown

    private val _userTeams = currentUser.flatMapLatest {
        teamRepository.getTeamsWithPlayersFlow(it.id).map { result ->
            result.getOrElse {
                emptyList()
            }
        }
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

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
        initialCurrentUserTeamIds = currentUser.value.teamIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .toSet(),
        initialWeeklyParentWithoutSelection = isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() == null,
    )

    override val validTeams = combine(
        _userTeams,
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

    private val shareServiceProvider = ShareServiceProvider()
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
        selectedEvent = { selectedEvent.value },
        selectedDivision = { selectedDivision.value },
        currentUser = { currentUser.value },
        currentAccountEmail = { _currentAccount.value.email },
        isEventFull = { isEventFull.value },
        currentWeeklyOccurrenceSelection = ::currentWeeklyOccurrenceSelection,
        requireSelectedWeeklyOccurrence = ::requireSelectedWeeklyOccurrence,
        loadJoinableChildren = ::loadJoinableChildren,
        saveCurrentRegistrationProgress = { step, registrationId, holdExpiresAt ->
            saveCurrentRegistrationProgress(
                step = step,
                registrationId = registrationId,
                holdExpiresAt = holdExpiresAt,
            )
        },
        clearCurrentRegistrationProgress = ::clearCurrentRegistrationProgress,
        addCurrentUserToEventWithRegistrationAnswers = ::addCurrentUserToEventWithRegistrationAnswers,
        addTeamToEventWithRegistrationAnswers = ::addTeamToEventWithRegistrationAnswers,
        createPurchaseIntentWithRegistrationAnswers = ::createPurchaseIntentWithRegistrationAnswers,
        refreshEventAfterParticipantMutation = ::refreshEventAfterParticipantMutation,
        refreshCurrentUserMembershipState = ::refreshCurrentUserMembershipState,
        refreshEventDetails = ::refreshEventDetails,
        checkIsUserFreeAgent = ::checkIsUserFreeAgent,
        resolveWithdrawTargetMembership = ::resolveWithdrawTargetMembership,
        setPaymentIntent = { intent -> setPaymentIntent(intent) },
        clearPaymentResult = ::clearPaymentResult,
        presentPaymentSheet = ::presentPaymentSheet,
        setError = { message -> _errorState.value = ErrorMessage(message) },
    )

    private fun currentRegistrationProgressScope(): EventRegistrationProgressScope =
        EventRegistrationProgressScope(
            userId = currentUser.value.id,
            eventId = selectedEvent.value.id,
            occurrence = currentWeeklyOccurrenceSelection(),
        )

    private suspend fun saveCurrentRegistrationProgress(
        step: String? = null,
        registrationId: String? = null,
        holdExpiresAt: String? = registrationFlowCoordinator.holdExpiresAt.value,
    ) {
        registrationFlowCoordinator.saveRegistrationProgress(
            scope = currentRegistrationProgressScope(),
            selectedDivisionId = selectedDivision.value,
            step = step,
            registrationId = registrationId,
            holdExpiresAt = holdExpiresAt,
        ) { key, draft ->
            currentUserDataSource?.saveRegistrationProgress(
                key = key,
                draft = draft,
            )
        }
    }

    private suspend fun loadCurrentRegistrationProgress() {
        registrationFlowCoordinator.loadRegistrationProgress(
            scope = currentRegistrationProgressScope(),
        ) { key ->
            currentUserDataSource?.loadRegistrationProgress(key)
        }
            ?.let { restoredDivisionId ->
                divisionContentCoordinator.restoreSelectedDivision(restoredDivisionId)
            }
    }

    private suspend fun clearCurrentRegistrationProgress() {
        registrationFlowCoordinator.clearRegistrationProgress(
            scope = currentRegistrationProgressScope(),
        ) { key ->
            currentUserDataSource?.clearRegistrationProgress(key)
        }
    }

    private fun ensureEventRegistrationQuestionsAnswered(onReady: () -> Unit): Boolean {
        return registrationFlowCoordinator.ensureQuestionsAnswered(
            eventName = selectedEvent.value.name,
            onReady = onReady,
        )
    }

    private suspend fun addCurrentUserToEventWithRegistrationAnswers(
        event: Event,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> {
        return registrationFlowCoordinator.addCurrentUserToEventWithRegistrationAnswers(
            event = event,
            preferredDivisionId = preferredDivisionId,
            occurrence = occurrence,
            addWithoutAnswers = eventRepository::addCurrentUserToEvent,
            addWithAnswers = eventRepository::addCurrentUserToEvent,
        )
    }

    private suspend fun addTeamToEventWithRegistrationAnswers(
        event: Event,
        team: Team,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> {
        return registrationFlowCoordinator.addTeamToEventWithRegistrationAnswers(
            event = event,
            team = team,
            preferredDivisionId = preferredDivisionId,
            occurrence = occurrence,
            addWithoutAnswers = eventRepository::addTeamToEvent,
            addWithAnswers = eventRepository::addTeamToEvent,
        )
    }

    private suspend fun createPurchaseIntentWithRegistrationAnswers(
        event: Event,
        teamId: String? = null,
        priceCents: Int,
        occurrence: EventOccurrenceSelection?,
        divisionId: String?,
    ): Result<PurchaseIntent> {
        return registrationFlowCoordinator.createPurchaseIntentWithRegistrationAnswers(
            event = event,
            teamId = teamId,
            priceCents = priceCents,
            occurrence = occurrence,
            divisionId = divisionId,
            createWithoutAnswers = { targetEvent, targetTeamId, targetPriceCents, selectedOccurrence, targetDivisionId ->
                billingRepository.createPurchaseIntent(
                    event = targetEvent,
                    teamId = targetTeamId,
                    priceCents = targetPriceCents,
                    occurrence = selectedOccurrence,
                    divisionId = targetDivisionId,
                )
            },
            createWithAnswers = { targetEvent, targetTeamId, targetPriceCents, selectedOccurrence, targetDivisionId, answers ->
                billingRepository.createPurchaseIntent(
                    event = targetEvent,
                    teamId = targetTeamId,
                    priceCents = targetPriceCents,
                    occurrence = selectedOccurrence,
                    divisionId = targetDivisionId,
                    answers = answers,
                )
            },
        )
    }

    init {
        backHandler.register(backCallback)
        if (editDraftCoordinator.isEditing.value) {
            loadSports(reportErrors = true)
        }
        scope.launch {
            selectedEvent
                .map { selected -> selected.organizationId?.trim().orEmpty() }
                .distinctUntilChanged()
                .collect { organizationId ->
                    loadOrganizationTemplates(organizationId)
                }
        }
        scope.launch {
            selectedEvent
                .map { selected -> selected.id.trim() }
                .distinctUntilChanged()
                .collectLatest { eventId ->
                    loadAvailableRentalResources(eventId)
                }
        }
        scope.launch {
            currentUser
                .map { user -> user.id }
                .distinctUntilChanged()
                .collect {
                    refreshScheduleTrackedUserIds()
                }
        }
        scope.launch {
            combine(
                selectedEvent.map { selected -> selected.id.trim() },
                currentUser.map { user -> user.id.trim() },
                weeklyOccurrenceCoordinator.selectedWeeklyOccurrence,
            ) { eventId, userId, occurrence ->
                Triple(eventId, userId, occurrence)
            }
                .distinctUntilChanged()
                .collectLatest { (eventId, userId, _) ->
                    if (eventId.isBlank() || userId.isBlank()) {
                        registrationFlowCoordinator.clearForMissingRegistrationScope()
                        return@collectLatest
                    }
                    eventRepository.getRegistrationQuestions("EVENT", eventId)
                        .onSuccess { questions ->
                            registrationFlowCoordinator.replaceRegistrationQuestions(questions)
                        }
                        .onFailure { throwable ->
                            Napier.w("Failed to load event registration questions.", throwable)
                            registrationFlowCoordinator.clearRegistrationQuestionsAfterLoadFailure()
                        }
                    loadCurrentRegistrationProgress()
                }
        }
        scope.launch {
            selectedEvent
                .map { selected -> selected.id to isWeeklyParentEvent(selected) }
                .distinctUntilChanged()
                .collect { (_, weeklyParent) ->
                    weeklyOccurrenceSummaryPrefetchJob?.cancel()
                    weeklyOccurrenceCoordinator.handleSelectedEventChanged(weeklyParent)
                }
        }
        scope.launch {
            selectedEvent
                .map { selected -> selected.id.trim() to isWeeklyParentEvent(selected) }
                .distinctUntilChanged()
                .collectLatest { (eventId, weeklyParent) ->
                    if (eventId.isEmpty() || weeklyParent) {
                        participantManagementCoordinator.setEventTeamsAndParticipantsLoading(false)
                        return@collectLatest
                    }
                    weeklyOccurrenceCoordinator.clearOverviewParticipantSummary()
                    participantManagementCoordinator.setEventTeamsAndParticipantsLoading(true)
                    try {
                        prefetchNonWeeklyParticipants(selectedEvent.value)
                    } finally {
                        participantManagementCoordinator.setEventTeamsAndParticipantsLoading(false)
                    }
                }
        }
        scope.launch {
            weeklyOccurrenceCoordinator.selectedWeeklyOccurrence
                .collectLatest { selectedOccurrence ->
                    val targetEvent = selectedEvent.value
                    weeklyOccurrenceCoordinator.updateSelectedSummaryFromCache(
                        isWeeklyParent = isWeeklyParentEvent(targetEvent),
                        selection = selectedOccurrence,
                    )
                    if (!isWeeklyParentEvent(targetEvent)) return@collectLatest
                    refreshCurrentUserMembershipState(targetEvent)
                    participantManagementCoordinator.setEventTeamsAndParticipantsLoading(true)
                    try {
                        syncSelectedWeeklyOccurrenceParticipants(targetEvent)
                    } finally {
                        participantManagementCoordinator.setEventTeamsAndParticipantsLoading(false)
                    }
                }
        }
        scope.launch {
            combine(selectedEvent, weeklyOccurrenceCoordinator.selectedWeeklyOccurrence) { eventValue, occurrenceState ->
                participantManagementRoomTarget(
                    event = eventValue,
                    occurrence = occurrenceState?.let { selectedOccurrence ->
                        EventOccurrenceSelection(
                            slotId = selectedOccurrence.slotId,
                            occurrenceDate = selectedOccurrence.occurrenceDate,
                            label = selectedOccurrence.label,
                        )
                    },
                )
            }
                .distinctUntilChanged()
                .flatMapLatest { target ->
                    if (target == null) {
                        flowOf(ParticipantManagementLocalState())
                    } else {
                        val occurrence = target.toOccurrence()
                        val snapshotFlow = eventRepository.observeEventParticipantManagementSnapshot(
                            eventId = target.eventId,
                            occurrence = occurrence,
                        )
                        val complianceFlow = if (target.teamSignup) {
                            eventRepository.observeEventTeamCompliance(
                                eventId = target.eventId,
                                occurrence = occurrence,
                            ).map { summaries ->
                                ParticipantManagementLocalState(
                                    teamSummaries = summaries.associateBy(EventTeamComplianceSummary::teamId),
                                )
                            }
                        } else {
                            eventRepository.observeEventUserCompliance(
                                eventId = target.eventId,
                                occurrence = occurrence,
                            ).map { summaries ->
                                ParticipantManagementLocalState(
                                    userSummaries = summaries.associateBy(EventComplianceUserSummary::userId),
                                )
                            }
                        }
                        combine(snapshotFlow, complianceFlow) { snapshot, compliance ->
                            compliance.copy(snapshot = snapshot)
                        }
                    }
                }
                .collect { localState ->
                    participantManagementCoordinator.applyLocalState(localState)
                }
        }
        scope.launch {
            combine(
                selectedEvent,
                currentUser,
                eventWithRelations.map { relations -> relations.organization }.distinctUntilChanged(),
                weeklyOccurrenceCoordinator.selectedWeeklyOccurrence,
            ) { eventValue, user, organization, occurrenceState ->
                val occurrence = occurrenceState?.let { selectedOccurrence ->
                    EventOccurrenceSelection(
                        slotId = selectedOccurrence.slotId,
                        occurrenceDate = selectedOccurrence.occurrenceDate,
                        label = selectedOccurrence.label,
                    )
                }
                participantManagementRoomTarget(eventValue, occurrence)
                    ?.takeIf {
                        canManageParticipantData(
                            event = eventValue,
                            user = user,
                            organization = organization,
                        )
                    }
            }
                .distinctUntilChanged()
                .collectLatest { target ->
                    if (!participantManagementCoordinator.beginManagedDetailBootstrap(target)) return@collectLatest
                    val bootstrapTarget = target ?: return@collectLatest
                    try {
                        eventRepository.syncEventDetail(
                            event = selectedEvent.value,
                            occurrence = bootstrapTarget.toOccurrence(),
                            manage = true,
                        ).onSuccess { result ->
                            applyEventDetailSyncResult(result)
                        }.onFailure { throwable ->
                            participantManagementCoordinator.clearManagedBootstrapRequestIfCurrent(bootstrapTarget)
                            Napier.w("Failed to refresh event detail management bootstrap.", throwable)
                        }
                    } finally {
                        participantManagementCoordinator.finishManagedDetailBootstrap()
                    }
                }
        }
        scope.launch {
            cachedCurrentUserRegistrations.collect {
                refreshCurrentUserMembershipState(selectedEvent.value)
            }
        }
        scope.launch {
            editDraftCoordinator.isEditing.collect { isEditing ->
                backCallback.isEnabled = isEditing
            }
        }
        scope.launch {
            _showDetails.collect { showDetails ->
                backCallback.isEnabled = showDetails
            }
        }
        scope.launch {
            paymentResult.collect {
                if (it != null) {
                    val pendingTeam = registrationFlowCoordinator.currentPendingTeamRegistration()
                    val confirmationTarget = registrationFlowCoordinator.currentJoinConfirmationTarget()
                    when (it) {
                        PaymentResult.Canceled -> {
                            _errorState.value = ErrorMessage("Payment canceled.")
                            registrationFlowCoordinator.clearTeamRegistrationState()
                        }

                        is PaymentResult.Failed -> {
                            _errorState.value = ErrorMessage(it.error)
                            registrationFlowCoordinator.clearTeamRegistrationState()
                        }

                        PaymentResult.Completed -> {
                            if (pendingTeam != null) {
                                loadingHandler.showLoading("Refreshing Team")
                                registrationFlowCoordinator.clearStartingTeamRegistrationId()
                                val teamRegisteredSuccessfully = joinConfirmationCoordinator.waitForTeamRegistrationWithTimeout(
                                    teamId = pendingTeam.team.id,
                                    currentUserId = currentUser.value.id,
                                    getTeamWithPlayers = teamRepository::getTeamWithPlayers,
                                )
                                registrationFlowCoordinator.clearPendingTeamRegistration()
                                if (teamRegisteredSuccessfully) {
                                    val refreshedTeam = teamRepository.getTeamWithPlayers(pendingTeam.team.id)
                                        .getOrNull()
                                    val paymentPending = refreshedTeam
                                        ?.team
                                        ?.playerRegistrations
                                        ?.any { registration ->
                                            registration.userId == currentUser.value.id && registration.isPaymentPending()
                                        } == true
                                    membershipCoordinator.setUsersTeam(
                                        refreshedTeam ?: pendingTeam,
                                        currentUser.value.id,
                                    )
                                    refreshCurrentUserMembershipState(selectedEvent.value)
                                    _errorState.value = ErrorMessage(
                                        if (paymentPending) {
                                            "Payment submitted for ${pendingTeam.team.name}. Registration is pending until the bank payment clears."
                                        } else {
                                            "Registration completed for ${pendingTeam.team.name}."
                                        }
                                    )
                                    refreshEventDetails()
                                } else {
                                    _errorState.value = ErrorMessage(
                                        "Payment submitted, but team registration confirmation is still pending. Please reload the event."
                                    )
                                }
                            } else {
                                loadingHandler.showLoading("Reloading Event")
                                val userJoinedSuccessfully = joinConfirmationCoordinator.waitForUserInEventWithTimeout(
                                    confirmationTarget = confirmationTarget,
                                    isUserInEvent = { membershipCoordinator.isUserInEvent.value },
                                    refreshAfterParticipantMutation = {
                                        refreshEventAfterParticipantMutation(
                                            eventId = selectedEvent.value.id,
                                            warningMessage = "Failed to refresh event while waiting for join confirmation.",
                                        )
                                    },
                                    isJoinConfirmationSatisfied = { target ->
                                        joinConfirmationCoordinator.isJoinConfirmationSatisfied(
                                            confirmationTarget = target,
                                            cachedCurrentUserRegistrations = { cachedCurrentUserRegistrations.value },
                                            selectedEvent = { selectedEvent.value },
                                            currentWeeklyOccurrenceSelection = ::currentWeeklyOccurrenceSelection,
                                            syncCurrentUserRegistrationCache = eventRepository::syncCurrentUserRegistrationCache,
                                            getEvent = eventRepository::getEvent,
                                            syncEventParticipants = { event, occurrence ->
                                                eventRepository.syncEventParticipants(
                                                    event = event,
                                                    occurrence = occurrence,
                                                )
                                            },
                                            getTeams = teamRepository::getTeams,
                                            applyParticipantSyncResult = ::applyParticipantSyncResult,
                                            refreshCurrentUserMembershipState = ::refreshCurrentUserMembershipState,
                                            rememberWeeklyOccurrenceSummary = ::rememberWeeklyOccurrenceSummary,
                                        )
                                    },
                                )
                                if (!userJoinedSuccessfully) {
                                    _errorState.value =
                                        ErrorMessage("Payment submitted, but event registration confirmation is still pending. Please reload event.")
                                } else if (membershipCoordinator.isRegistrationPaymentPending.value) {
                                    _errorState.value = ErrorMessage(
                                        "Payment submitted. Registration is pending until the bank payment clears."
                                    )
                                }
                            }
                            clearCurrentRegistrationProgress()
                        }
                    }
                    loadingHandler.hideLoading()
                    registrationFlowCoordinator.clearPendingJoinConfirmationTarget()
                    clearPaymentResult()
                }
            }
        }
        scope.launch {
            matchRepository.setIgnoreMatch(null)
            try {
                combine(selectedEventId, editDraftCoordinator.isEditing, matchEditingCoordinator.isEditingMatches) { eventId, isEditing, isEditingMatches ->
                    Triple(eventId, isEditing, isEditingMatches)
                }.collectLatest { (eventId, isEditing, isEditingMatches) ->
                    if (eventId.isBlank()) {
                        matchRepository.setRealtimePaused(MATCH_REALTIME_EDIT_PAUSE_REASON, false)
                        matchRepository.unsubscribeFromRealtime()
                    } else {
                        matchRepository.subscribeToMatches(eventId)
                        matchRepository.setRealtimePaused(
                            MATCH_REALTIME_EDIT_PAUSE_REASON,
                            isEditing || isEditingMatches,
                        )
                    }
                }
            } finally {
                matchRepository.setRealtimePaused(MATCH_REALTIME_EDIT_PAUSE_REASON, false)
                matchRepository.unsubscribeFromRealtime()
            }
        }
        scope.launch {
            eventWithRelations.collect { relations ->
                if (!canEditEventDetails(relations.event) && editDraftCoordinator.isEditing.value) {
                    editDraftCoordinator.forceExitEditing(relations.event)
                }
                editDraftCoordinator.replaceReadOnlyTimeSlots(
                    event = relations.event,
                    timeSlots = relations.timeSlots,
                )
                val activeDivision = divisionContentCoordinator.currentSelectedDivision()
                    ?: relations.event.resolveDefaultSelectedDivisionId()
                if (!activeDivision.isNullOrBlank()) {
                    selectDivision(activeDivision)
                } else {
                    refreshSelectedDivisionContent()
                }
            }
        }
        scope.launch {
            selectedEvent.collect { selected ->
                refreshCurrentUserMembershipState(selected)
            }
        }
        scope.launch {
            selectedEvent
                .map { selected -> selected.resolveDefaultSelectedDivisionId() }
                .distinctUntilChanged()
                .collect { divisionId ->
                    val resolvedDivisionId = divisionId?.normalizeDivisionIdentifier()?.takeIf(String::isNotBlank)
                        ?: return@collect
                    val availableDivisionIds = selectedEvent.value.divisions
                        .map { it.normalizeDivisionIdentifier() }
                        .filter(String::isNotBlank)
                        .toSet()
                    val currentDivisionId = divisionContentCoordinator.currentSelectedDivision()
                        ?.normalizeDivisionIdentifier()
                        ?.takeIf(String::isNotBlank)
                    if (currentDivisionId == null || (availableDivisionIds.isNotEmpty() && currentDivisionId !in availableDivisionIds)) {
                        selectDivision(resolvedDivisionId)
                    }
                }
        }
        scope.launch {
            combine(selectedEvent, selectedWeeklyOccurrence) { selected, occurrence ->
                WithdrawTargetsRefreshKey(
                    eventId = selected.id.trim(),
                    occurrenceKey = weeklyOccurrenceSummaryKey(
                        slotId = occurrence?.slotId,
                        occurrenceDate = occurrence?.occurrenceDate,
                    ),
                    teamSignup = selected.teamSignup,
                    eventType = selected.eventType,
                    playerIds = selected.playerIds
                        .map(String::trim)
                        .filter(String::isNotBlank)
                        .distinct(),
                    waitListIds = selected.waitList
                        .map(String::trim)
                        .filter(String::isNotBlank)
                        .distinct(),
                    freeAgentIds = selected.freeAgents
                        .map(String::trim)
                        .filter(String::isNotBlank)
                        .distinct(),
                    teamIds = selected.teamIds
                        .map(String::trim)
                        .filter(String::isNotBlank)
                        .distinct(),
                ) to selected
            }
                .distinctUntilChanged { old, new -> old.first == new.first }
                .collect { (_, selected) ->
                    refreshWithdrawTargets(selected)
                }
        }
        scope.launch {
            combine(eventWithRelations, eventFields, editDraftCoordinator.isEditing) { relations, fieldsWithMatches, editing ->
                Triple(relations, fieldsWithMatches.map { relation -> relation.field }, editing)
            }.collect { (relations, fields, editing) ->
                if (!editing) {
                    editDraftCoordinator.refreshReadOnlyDraft(
                        event = relations.event,
                        sourceFields = fields,
                        leagueScoringConfig = relations.leagueScoringConfig?.toDto()
                            ?: LeagueScoringConfigDTO(),
                    )
                }
            }
        }
        scope.launch {
            selectedDivision.collect { _ ->
                divisionContentCoordinator.currentSelectedDivision()?.let { selectDivision(it) }
            }
        }
        scope.launch {
            combine(selectedEvent, selectedDivision) { eventValue, divisionValue ->
                leagueStandingsCoordinator.resolveLoadTarget(
                    event = eventValue,
                    selectedDivisionId = divisionValue,
                    isPlayoffPlacementDivision = { divisionId ->
                        eventValue.isPlayoffPlacementDivision(divisionId)
                    },
                )
            }
                .distinctUntilChanged()
                .collect { selection ->
                    leagueStandingsCoordinator.loadStandingsForSelection(
                        target = selection,
                        showLoading = true,
                        reportErrors = false,
                        getStandings = eventRepository::getLeagueDivisionStandings,
                    )?.let { errorMessage -> _errorState.value = errorMessage }
                }
        }
        scope.launch {
            divisionContentCoordinator.divisionMatches.collect { generateRounds() }
        }
    }

    private suspend fun prefetchNonWeeklyParticipants(
        event: Event = selectedEvent.value,
    ) {
        detailHydrationCoordinator.prefetchNonWeeklyParticipants(
            event = event,
            isWeeklyParentEvent = ::isWeeklyParentEvent,
            manage = canManageParticipantData(event),
            markManagedBootstrapRequested = ::markManagedBootstrapRequested,
            syncEventDetail = { targetEvent, occurrence, manage ->
                eventRepository.syncEventDetail(
                    event = targetEvent,
                    occurrence = occurrence,
                    manage = manage,
                )
            },
            applyEventDetailSyncResult = ::applyEventDetailSyncResult,
            clearManagedBootstrapRequestIfCurrent = ::clearManagedBootstrapRequestIfCurrent,
            setError = { error -> _errorState.value = error },
        )
    }

    private fun applyParticipantSyncResult(result: EventParticipantsSyncResult) {
        detailHydrationCoordinator.applyParticipantSyncResult(
            result = result,
            isWeeklyParentEvent = ::isWeeklyParentEvent,
            replaceParticipantDivisionWarnings = participantManagementCoordinator::replaceParticipantDivisionWarnings,
            applyOverviewParticipantSummary = weeklyOccurrenceCoordinator::applyOverviewParticipantSummary,
        )
    }

    private fun markManagedBootstrapRequested(
        event: Event,
        occurrence: EventOccurrenceSelection?,
        manage: Boolean,
    ) {
        participantManagementCoordinator.markManagedBootstrapRequested(
            target = participantManagementRoomTarget(
                event = event,
                occurrence = occurrence,
            ),
            manage = manage,
        )
    }

    private fun clearManagedBootstrapRequestIfCurrent(
        event: Event,
        occurrence: EventOccurrenceSelection?,
    ) {
        participantManagementCoordinator.clearManagedBootstrapRequestIfCurrent(
            participantManagementRoomTarget(
                event = event,
                occurrence = occurrence,
            ),
        )
    }

    private fun applyEventDetailSyncResult(result: EventDetailSyncResult) {
        detailHydrationCoordinator.applyEventDetailSyncResult(
            result = result,
            applyParticipantSyncResult = ::applyParticipantSyncResult,
            applyBootstrapSyncResult = bootstrapResourcesCoordinator::applyEventDetailSyncResult,
            replaceStaffInvites = { syncResult ->
                _eventStaffInvites.value = syncResult.staffInvites
            },
        )
    }

    private fun loadSports(reportErrors: Boolean) {
        val loadInProgress = sportsLoadJob?.isActive == true
        if (!sportsCatalogCoordinator.prepareLoad(reportErrors, loadInProgress)) {
            return
        }
        sportsLoadJob = scope.launch {
            var loadedSports = false
            var loadedDivisionTypes = false
            sportsRepository.getSports()
                .onSuccess { sports ->
                    loadedSports = true
                    sportsCatalogCoordinator.applySportsSuccess(sports)
                    if (editDraftCoordinator.isEditing.value) {
                        editDraftCoordinator.updateEditedEvent { previous ->
                            sportsCatalogCoordinator.syncOfficialStaffingForSportTransition(
                                previous = previous,
                                updated = previous,
                            )
                        }
                    }
                }
                .onFailure {
                    Napier.w("Failed to load sports.", it)
                    if (sportsCatalogCoordinator.shouldReportLoadErrors(editDraftCoordinator.isEditing.value)) {
                        _errorState.value = ErrorMessage("Failed to load sports: ${it.userMessage()}")
                    }
                }
            sportsRepository.getDivisionTypeParameters()
                .onSuccess { parameters ->
                    loadedDivisionTypes = true
                    sportsCatalogCoordinator.applyDivisionTypeParametersSuccess(parameters)
                }
                .onFailure {
                    Napier.w("Failed to load division options.", it)
                    if (sportsCatalogCoordinator.shouldReportLoadErrors(editDraftCoordinator.isEditing.value)) {
                        _errorState.value = ErrorMessage("Failed to load division options: ${it.userMessage()}")
                    }
                }
            sportsCatalogCoordinator.finishLoad(loadedSports, loadedDivisionTypes)
        }
    }

    private suspend fun loadOrganizationTemplates(organizationId: String) {
        if (organizationId.isBlank()) {
            organizationTemplatesCoordinator.clear()
            return
        }

        organizationTemplatesCoordinator.beginLoad()
        billingRepository.listOrganizationTemplates(organizationId)
            .onSuccess { templates ->
                organizationTemplatesCoordinator.applyLoadSuccess(templates)
            }
            .onFailure { throwable ->
                Napier.w("Failed to load templates for organization $organizationId.", throwable)
                organizationTemplatesCoordinator.applyLoadFailure(
                    throwable.userMessage("Failed to load templates."),
                )
            }
        organizationTemplatesCoordinator.finishLoad()
    }

    override fun onNavigateToChat(user: UserData) {
        navigationHandler.navigateToChat(user = user)
    }

    override fun matchSelected(selectedMatch: MatchWithRelations) {
        navigationHandler.navigateToMatch(
            selectedMatch,
            selectedEvent.value
        )
    }

    override fun selectDivision(division: String) {
        divisionContentCoordinator.selectDivision(
            division = division,
            selectedEvent = selectedEvent.value,
            relations = eventWithRelations.value,
        )
        if (matchEditingCoordinator.isEditingMatches.value) {
            refreshEditableRounds()
        }
    }

    private fun refreshSelectedDivisionContent() {
        divisionContentCoordinator.refreshSelectedDivisionContent(
            selectedEvent = selectedEvent.value,
            relations = eventWithRelations.value,
        )
        if (matchEditingCoordinator.isEditingMatches.value) {
            refreshEditableRounds()
        }
    }

    private suspend fun refreshLeagueStandingsAfterSchedule(event: Event) {
        val target = leagueStandingsCoordinator.resolveScheduleRefreshTarget(
            event = event,
            divisionId = resolveLeagueStandingsDivisionId(),
        ) ?: return
        leagueStandingsCoordinator.loadDivisionStandings(
            target = target,
            showLoading = false,
            reportErrors = false,
            getStandings = eventRepository::getLeagueDivisionStandings,
        )
    }

    private fun resolveLeagueStandingsDivisionId(): String? =
        leagueStandingsCoordinator.resolveCurrentDivisionId(
            selectedDivisionId = selectedDivision.value,
            isSelectedDivisionEligible = { divisionId ->
                !selectedEvent.value.isPlayoffPlacementDivision(divisionId)
            },
        )

    override fun refreshLeagueStandings() {
        val target = leagueStandingsCoordinator.resolveCurrentLoadTarget(
            eventId = selectedEvent.value.id,
            divisionId = resolveLeagueStandingsDivisionId(),
        ) ?: return
        scope.launch {
            leagueStandingsCoordinator.loadDivisionStandings(
                target = target,
                showLoading = true,
                reportErrors = true,
                getStandings = eventRepository::getLeagueDivisionStandings,
            )?.let { errorMessage -> _errorState.value = errorMessage }
        }
    }

    override fun confirmLeagueStandings(applyReassignment: Boolean) {
        val event = selectedEvent.value
        val target = leagueStandingsCoordinator.resolveScheduleRefreshTarget(
            event = event,
            divisionId = resolveLeagueStandingsDivisionId(),
        )

        if (target == null) {
            _errorState.value = ErrorMessage("Select a standings division before confirming standings.")
            return
        }

        scope.launch {
            _errorState.value = leagueStandingsCoordinator.confirmStandings(
                target = target,
                applyReassignment = applyReassignment,
                loadingHandler = loadingHandler,
                confirmStandings = eventRepository::confirmLeagueDivisionStandings,
                refreshMatches = { eventId -> matchRepository.getMatchesOfTournament(eventId) },
                refreshEvent = { eventId -> eventRepository.getEvent(eventId) },
            )
        }
    }

    override fun onHostCreateAccount() {
        scope.launch {
            loadingHandler.showLoading("Redirecting to Stripe On Boarding ...")
            billingRepository.createAccount().onSuccess { onBoardingUrl ->
                urlHandler?.openUrlInWebView(
                    url = onBoardingUrl,
                )
            }.onFailure {
                _errorState.value = ErrorMessage(it.userMessage())
            }
            loadingHandler.hideLoading()
        }
    }

    override fun toggleBracketView() {
        _isBracketView.value = !_isBracketView.value
    }

    override fun toggleLosersBracket() {
        bracketRoundsCoordinator.toggleLosersBracket(divisionContentCoordinator.divisionMatches.value)
        if (matchEditingCoordinator.isEditingMatches.value) {
            refreshEditableRounds()
        }
    }

    override fun onUploadSelected(photo: GalleryPhotoResult) {
        scope.launch {
            imageCoordinator.uploadSelected(photo)
        }
    }

    override fun deleteImage(imageId: String) {
        scope.launch {
            imageCoordinator.deleteImage(imageId, loadingHandler)
        }
    }

    private fun currentWeeklyOccurrenceSelection(): EventOccurrenceSelection? {
        return weeklyOccurrenceCoordinator.currentSelection()
    }

    private suspend fun refreshParticipantManagementSnapshot(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
        reportErrors: Boolean = true,
    ) {
        participantManagementCoordinator.refreshParticipantManagementSnapshot(
            eventId = eventId,
            occurrence = occurrence,
            reportErrors = reportErrors,
            loadSnapshot = eventRepository::getEventParticipantManagementSnapshot,
        )?.let { error -> _errorState.value = error }
    }

    private suspend fun refreshParticipantComplianceSummaries(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
        teamSignup: Boolean,
        reportErrors: Boolean = true,
    ) {
        participantManagementCoordinator.refreshParticipantComplianceSummaries(
            eventId = eventId,
            occurrence = occurrence,
            teamSignup = teamSignup,
            reportErrors = reportErrors,
            loadTeamCompliance = eventRepository::getEventTeamCompliance,
            loadUserCompliance = eventRepository::getEventUserCompliance,
        )?.let { error -> _errorState.value = error }
    }

    private suspend fun refreshParticipantManagementData(
        target: ParticipantManagementRoomTarget,
        reportErrors: Boolean = true,
    ) {
        participantManagementCoordinator.refreshParticipantManagementData(
            target = target,
            reportErrors = reportErrors,
            loadSnapshot = eventRepository::getEventParticipantManagementSnapshot,
            loadTeamCompliance = eventRepository::getEventTeamCompliance,
            loadUserCompliance = eventRepository::getEventUserCompliance,
        )?.let { error -> _errorState.value = error }
    }

    private suspend fun refreshParticipantManagementSnapshotIfNeeded(
        event: Event = selectedEvent.value,
    ) {
        val target = participantManagementRoomTarget(
            event = event,
            occurrence = currentWeeklyOccurrenceSelection(),
        ) ?: return
        if (!canManageParticipantData(event)) return
        refreshParticipantManagementSnapshot(
            eventId = target.eventId,
            occurrence = target.toOccurrence(),
            reportErrors = false,
        )
    }

    private suspend fun refreshParticipantComplianceIfNeeded(
        event: Event = selectedEvent.value,
    ) {
        val target = participantManagementRoomTarget(
            event = event,
            occurrence = currentWeeklyOccurrenceSelection(),
        ) ?: return
        if (!canManageParticipantData(event)) return
        refreshParticipantComplianceSummaries(
            eventId = target.eventId,
            occurrence = target.toOccurrence(),
            teamSignup = target.teamSignup,
            reportErrors = false,
        )
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

    private fun rememberWeeklyOccurrenceSummary(
        occurrence: EventOccurrenceSelection,
        summary: WeeklyOccurrenceSummary,
    ) {
        weeklyOccurrenceCoordinator.rememberWeeklyOccurrenceSummary(occurrence, summary)
    }

    private suspend fun fetchWeeklyOccurrenceSummary(
        event: Event,
        occurrence: EventOccurrenceSelection,
    ): WeeklyOccurrenceSummary? {
        return eventRepository.getEventParticipantsSummary(
            eventId = event.id,
            occurrence = occurrence,
        ).onFailure { throwable ->
            Napier.w(
                "Failed to load weekly occurrence summary for ${occurrence.slotId} on ${occurrence.occurrenceDate}.",
                throwable,
            )
        }.getOrNull()?.takeUnless { summary ->
            summary.weeklySelectionRequired
        }?.let { summary ->
            WeeklyOccurrenceSummary(
                participantCount = summary.participantCount,
                participantCapacity = summary.participantCapacity,
            )
        }
    }

    private suspend fun syncSelectedWeeklyOccurrenceParticipants(
        event: Event = selectedEvent.value,
        reportErrors: Boolean = true,
    ) {
        detailHydrationCoordinator.syncSelectedWeeklyOccurrenceParticipants(
            event = event,
            occurrence = currentWeeklyOccurrenceSelection(),
            isWeeklyParentEvent = ::isWeeklyParentEvent,
            manage = canManageParticipantData(event),
            reportErrors = reportErrors,
            clearSelectedWeeklyOccurrenceSummary = weeklyOccurrenceCoordinator::clearSelectedWeeklyOccurrenceSummary,
            markManagedBootstrapRequested = ::markManagedBootstrapRequested,
            syncEventDetail = { targetEvent, occurrence, manage ->
                eventRepository.syncEventDetail(
                    event = targetEvent,
                    occurrence = occurrence,
                    manage = manage,
                )
            },
            applyEventDetailSyncResult = ::applyEventDetailSyncResult,
            applySelectedOccurrenceParticipantSummary = weeklyOccurrenceCoordinator::applySelectedOccurrenceParticipantSummary,
            clearManagedBootstrapRequestIfCurrent = ::clearManagedBootstrapRequestIfCurrent,
            setError = { error -> _errorState.value = error },
            logWarning = Napier::w,
        )
    }

    private suspend fun refreshSelectedWeeklyOccurrenceSummaryIfNeeded(
        event: Event = selectedEvent.value,
    ) {
        if (isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() != null) {
            syncSelectedWeeklyOccurrenceParticipants(
                event = event,
                reportErrors = false,
            )
        }
    }

    private suspend fun refreshEventAfterParticipantMutation(
        eventId: String = selectedEvent.value.id,
        warningMessage: String = "Failed to refresh event after participant update.",
    ) {
        detailHydrationCoordinator.refreshEventAfterParticipantMutation(
            eventId = eventId,
            occurrence = currentWeeklyOccurrenceSelection(),
            warningMessage = warningMessage,
            getEvent = eventRepository::getEvent,
            syncEventParticipants = eventRepository::syncEventParticipants,
            applyParticipantSyncResult = ::applyParticipantSyncResult,
            refreshSelectedWeeklyOccurrenceSummaryIfNeeded = ::refreshSelectedWeeklyOccurrenceSummaryIfNeeded,
            refreshParticipantManagementSnapshotIfNeeded = ::refreshParticipantManagementSnapshotIfNeeded,
            refreshParticipantComplianceIfNeeded = ::refreshParticipantComplianceIfNeeded,
            logWarning = Napier::w,
        )
    }

    override fun joinEvent() {
        registrationActionHandler.joinEvent()
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
        val event = selectedEvent.value
        if (!isWeeklyParentEvent(event)) return

        val pending = weeklyOccurrenceCoordinator.pendingOccurrenceSummaries(occurrences)
        if (pending.isEmpty()) return

        weeklyOccurrenceSummaryPrefetchJob?.cancel()
        weeklyOccurrenceSummaryPrefetchJob = scope.launch {
            pending.forEach { occurrence ->
                val summary = fetchWeeklyOccurrenceSummary(event, occurrence) ?: return@forEach
                rememberWeeklyOccurrenceSummary(occurrence, summary)
            }
        }
    }

    override fun clearSelectedWeeklySession() {
        weeklyOccurrenceCoordinator.clearSelectedWeeklySession()
        participantManagementCoordinator.clearParticipantManagementState()
    }

    override fun joinEventAsTeam(team: TeamWithPlayers) {
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

    private suspend fun loadJoinableChildren(
        warningMessage: String = "Failed to load linked children before join flow.",
    ): List<JoinChildOption> {
        return userRepository.listChildren()
            .onFailure { throwable ->
                Napier.w(warningMessage, throwable)
            }
            .getOrElse { emptyList() }
            .asSequence()
            .filter { child ->
                child.userId.isNotBlank() &&
                    (child.linkStatus?.equals("active", ignoreCase = true) != false)
            }
            .map { child -> child.toJoinChildOption() }
            .toList()
    }

    private suspend fun refreshScheduleTrackedUserIds() {
        val ids = linkedSetOf<String>()
        val currentUserId = currentUser.value.id.trim()
        if (currentUserId.isNotEmpty()) {
            ids += currentUserId
        }
        loadJoinableChildren()
            .map { child -> child.userId.trim() }
            .filter { childId -> childId.isNotEmpty() }
            .forEach { childId -> ids += childId }
        _scheduleTrackedUserIds.value = ids
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
        hydrateEventDetailForMobile(showDetailsOnSuccess = false)
    }

    private fun hydrateEventDetailForMobile(showDetailsOnSuccess: Boolean) {
        val event = selectedEvent.value
        val request = detailHydrationCoordinator.beginMobileHydration(
            event = event,
            showDetailsOnSuccess = showDetailsOnSuccess,
            setParticipantLoading = participantManagementCoordinator::setEventTeamsAndParticipantsLoading,
            setMatchesLoading = { loading -> _eventMatchesLoading.value = loading },
            showDetails = { _showDetails.value = true },
        ) ?: return

        eventDetailHydrationJob?.cancel()
        eventDetailHydrationJob = scope.launch {
            detailHydrationCoordinator.hydrateMobileEventDetail(
                request = request,
                fallbackEvent = event,
                occurrence = currentWeeklyOccurrenceSelection(),
                isWeeklyParentEvent = ::isWeeklyParentEvent,
                getEvent = eventRepository::getEvent,
                syncEventParticipants = eventRepository::syncEventParticipants,
                refreshMatches = matchRepository::getMatchesOfTournament,
                applyParticipantSyncResult = ::applyParticipantSyncResult,
                applySelectedOccurrenceParticipantSummary = weeklyOccurrenceCoordinator::applySelectedOccurrenceParticipantSummary,
                refreshParticipantManagementSnapshotIfNeeded = ::refreshParticipantManagementSnapshotIfNeeded,
                refreshParticipantComplianceIfNeeded = ::refreshParticipantComplianceIfNeeded,
                setParticipantLoading = participantManagementCoordinator::setEventTeamsAndParticipantsLoading,
                setMatchesLoading = { loading -> _eventMatchesLoading.value = loading },
                showDetails = { _showDetails.value = true },
                setError = { error -> _errorState.value = error },
            )
        }
    }

    override fun toggleEdit() {
        setEventEditMode(enabled = !editDraftCoordinator.isEditing.value)
    }

    override fun startEditingEvent() {
        setEventEditMode(enabled = true)
    }

    override fun cancelEditingEvent() {
        setEventEditMode(enabled = false)
    }

    private fun setEventEditMode(enabled: Boolean) {
        val unsupportedFeatures = mobileEventEditUnsupportedFeatures(selectedEvent.value)
        if (enabled && unsupportedFeatures.isNotEmpty()) {
            _errorState.value = ErrorMessage(
                mobileEventEditUnsupportedMessage(unsupportedFeatures)
            )
            return
        }
        if (editDraftCoordinator.isEditing.value == enabled) {
            return
        }
        if (enabled && !sportsCatalogCoordinator.isCatalogLoaded()) {
            loadSports(reportErrors = true)
        }
        // Initialize or reset the draft from the latest selected event when mode changes.
        val selected = selectedEvent.value
        val seededEvent = if (enabled && sportsCatalogCoordinator.currentSports().isNotEmpty()) {
            sportsCatalogCoordinator.syncOfficialStaffingForSportTransition(
                previous = selected,
                updated = selected,
            )
        } else {
            selected
        }
        editDraftCoordinator.seedDraftForEditing(
            event = seededEvent,
            sourceFields = eventFields.value.map { relation -> relation.field },
            timeSlots = eventWithRelations.value.timeSlots,
            leagueScoringConfig = eventWithRelations.value.leagueScoringConfig?.toDto()
                ?: LeagueScoringConfigDTO(),
        )
        if (enabled) {
            val changedRentalSelection = rentalResourcesCoordinator.setAttachedResourceSelection(
                slots = editDraftCoordinator.editableLeagueTimeSlots.value,
                eventId = seededEvent.id,
            )
            if (changedRentalSelection && rentalResourcesCoordinator.selectedResourceIds.value.isNotEmpty()) {
                syncSelectedRentalResourcesIntoEditDraft()
            }
        }
        if (!enabled) {
            eventInviteCoordinator.clearPendingStaffInvites()
            eventInviteCoordinator.clearSuggestedUsers()
        }
        editDraftCoordinator.setEditing(enabled)
    }

    override fun editEventField(update: Event.() -> Event) {
        editDraftCoordinator.updateEditedEvent { previous ->
            sportsCatalogCoordinator.syncOfficialStaffingForSportTransition(
                previous = previous,
                updated = previous.update(),
            )
        }
    }

    override fun editTournamentField(update: Event.() -> Event) {
        editDraftCoordinator.updateEditedEvent { previous ->
            sportsCatalogCoordinator.syncOfficialStaffingForSportTransition(
                previous = previous,
                updated = previous.update(),
            )
        }
    }

    override fun searchUsers(query: String) {
        scope.launch {
            eventInviteCoordinator.searchUsers(
                query = query,
                searchPlayers = userRepository::searchPlayers,
            )?.let { errorMessage -> _errorState.value = errorMessage }
        }
    }

    override fun searchInviteTeams(query: String) {
        val event = selectedEvent.value
        scope.launch {
            eventInviteCoordinator.searchInviteTeams(
                query = query,
                event = event,
                organizationId = currentInviteOrganizationId(event),
                sportName = currentInviteSportName(event),
                excludeTeamIds = eventParticipantTeamIdsForInviteSearch(event),
                searchTeams = { searchQuery, eventId, organizationId, sportName, excludeTeamIds ->
                    teamRepository.searchTeamsForEventInvite(
                        query = searchQuery,
                        eventId = eventId,
                        organizationId = organizationId,
                        sportName = sportName,
                        excludeTeamIds = excludeTeamIds,
                    )
                },
            )?.let { errorMessage -> _errorState.value = errorMessage }
        }
    }

    override fun inviteTeamToEvent(team: Team) {
        scope.launch {
            val event = selectedEvent.value
            val occurrence = if (isWeeklyParentEvent(event)) {
                requireSelectedWeeklyOccurrence(
                    event = event,
                    errorMessage = "Select an occurrence before inviting a team.",
                ) ?: return@launch
            } else {
                null
            }

            _errorState.value = eventInviteCoordinator.inviteTeamToEvent(
                team = team,
                event = event,
                existingTeamIds = eventParticipantTeamIdsForInviteSearch(event),
                selectedDivisionId = selectedDivision.value,
                occurrence = occurrence,
                loadingHandler = loadingHandler,
                addTeam = eventRepository::addTeamToEvent,
                refreshAfterMutation = ::refreshEventAfterParticipantMutation,
            )
        }
    }

    override fun invitePlayerToEvent(user: UserData) {
        scope.launch {
            val event = selectedEvent.value
            val occurrence = if (isWeeklyParentEvent(event)) {
                requireSelectedWeeklyOccurrence(
                    event = event,
                    errorMessage = "Select an occurrence before inviting a player.",
                ) ?: return@launch
            } else {
                null
            }

            _errorState.value = eventInviteCoordinator.invitePlayerToEvent(
                user = user,
                event = event,
                existingUserIds = eventParticipantUserIdsForInviteSearch(event),
                selectedDivisionId = selectedDivision.value,
                occurrence = occurrence,
                loadingHandler = loadingHandler,
                addPlayer = eventRepository::addPlayerToEvent,
                refreshAfterMutation = ::refreshEventAfterParticipantMutation,
            )
        }
    }

    override fun invitePlayerToEventByEmail(firstName: String, lastName: String, email: String) {
        scope.launch {
            val event = selectedEvent.value
            _errorState.value = eventInviteCoordinator.invitePlayerToEventByEmail(
                firstName = firstName,
                lastName = lastName,
                email = email,
                event = event,
                loadingHandler = loadingHandler,
                createInvite = { targetEvent, normalizedEmail, normalizedFirstName, normalizedLastName ->
                    createEventPlayerInvite(
                        event = targetEvent,
                        userId = null,
                        email = normalizedEmail,
                        firstName = normalizedFirstName,
                        lastName = normalizedLastName,
                    )
                },
            )
        }
    }

    private fun currentInviteOrganizationId(event: Event = selectedEvent.value): String? {
        return resolveEventInviteOrganizationId(
            event = event,
            relationOrganizationId = eventWithRelations.value.organization?.id,
        )
    }

    private fun currentInviteSportName(event: Event = selectedEvent.value): String? {
        return resolveEventInviteSportName(
            event = event,
            relationSportName = eventWithRelations.value.sport?.name,
        )
    }

    private fun eventParticipantTeamIdsForInviteSearch(event: Event = selectedEvent.value): Set<String> =
        eventParticipantTeamIdsForInviteSearch(
            event = event,
            teams = eventWithRelations.value.teams,
        )

    private fun eventParticipantUserIdsForInviteSearch(event: Event = selectedEvent.value): Set<String> =
        eventParticipantUserIdsForInviteSearch(
            event = event,
            players = eventWithRelations.value.players,
        )

    private suspend fun createEventPlayerInvite(
        event: Event,
        userId: String?,
        email: String?,
        firstName: String?,
        lastName: String?,
    ): Result<List<Invite>> {
        val invite = buildEventPlayerInviteRequest(
            event = event,
            organizationId = currentInviteOrganizationId(event),
            userId = userId,
            email = email,
            firstName = firstName,
            lastName = lastName,
            createdBy = currentUser.value.id,
        ).getOrElse { throwable ->
            return Result.failure(throwable)
        }
        return userRepository.createInvites(
            invites = listOf(invite),
        )
    }

    override suspend fun addPendingStaffInvite(
        firstName: String,
        lastName: String,
        email: String,
        roles: Set<EventStaffRole>,
    ): Result<Unit> = runCatching {
        val normalizedDraft = eventInviteCoordinator.pendingStaffInviteDraft(
            firstName = firstName,
            lastName = lastName,
            email = email,
            roles = roles,
        ).getOrThrow()

        val event = editDraftCoordinator.editedEvent.value
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

        eventInviteCoordinator.addPendingStaffInviteDraft(normalizedDraft)
    }.onFailure { error ->
        _errorState.value = ErrorMessage(error.userMessage("Unable to add staff invite."))
    }

    override fun removePendingStaffInvite(email: String, role: EventStaffRole?) {
        eventInviteCoordinator.removePendingStaffInvite(email, role)
    }

    override fun updateEvent() {
        scope.launch {
            when (val result = editActionCoordinator.runSaveEventAction(
                selectedEvent = selectedEvent.value,
                pendingStaffInvites = eventInviteCoordinator.pendingStaffInvites.value,
                existingStaffInvites = _eventStaffInvites.value,
                currentUserId = currentUser.value.id,
                prepareEventForUpdate = ::prepareEventForUpdate,
                updatePreparedEvent = { prepared ->
                    eventRepository.updateEvent(
                        newEvent = prepared.event,
                        fields = prepared.fields,
                        timeSlots = prepared.timeSlots,
                        leagueScoringConfig = prepared.leagueScoringConfig,
                    ).getOrThrow()
                },
                reconcileStaffInvites = { event, pendingStaffInvites, existingStaffInvites, previouslyAssignedUserIds, createdByUserId ->
                    reconcileEventStaffInvites(
                        userRepository = userRepository,
                        event = event,
                        pendingStaffInvites = pendingStaffInvites,
                        existingStaffInvites = existingStaffInvites,
                        previouslyAssignedUserIds = previouslyAssignedUserIds,
                        createdByUserId = createdByUserId,
                    ).getOrThrow()
                },
                updateFinalEvent = { event ->
                    eventRepository.updateEvent(event).getOrThrow()
                },
                refetchMatchesOfTournament = { eventId ->
                    matchRepository.getMatchesOfTournament(eventId)
                },
                showLoading = { message -> loadingHandler.showLoading(message) },
                hideLoading = loadingHandler::hideLoading,
            )) {
                is EventSaveActionResult.Success -> {
                    _eventStaffInvites.value = result.staffInvites
                    eventInviteCoordinator.clearPendingStaffInvites()
                    eventInviteCoordinator.clearSuggestedUsers()
                    cancelEditingEvent()
                }
                is EventSaveActionResult.Failure -> {
                    _errorState.value = ErrorMessage(result.throwable.userMessage(result.fallbackMessage))
                }
            }
        }
    }

    override fun rescheduleEvent() {
        runScheduleEditAction(EventScheduleEditAction.RESCHEDULE)
    }

    override fun buildBrackets() {
        runScheduleEditAction(EventScheduleEditAction.BUILD_BRACKETS)
    }

    override fun rebuildWithoutPlaceholderTeams() {
        runScheduleEditAction(EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS)
    }

    private fun runScheduleEditAction(action: EventScheduleEditAction) {
        scope.launch {
            when (val result = editActionCoordinator.runScheduleEditAction(
                action = action,
                prepareEventForUpdate = ::prepareEventForUpdate,
                logPreparedFieldOwnership = ::logPreparedFieldOwnership,
                updateEvent = { prepared ->
                    eventRepository.updateEvent(
                        newEvent = prepared.event,
                        fields = prepared.fields,
                        timeSlots = prepared.timeSlots,
                        leagueScoringConfig = prepared.leagueScoringConfig,
                    ).getOrThrow()
                },
                deleteMatchesOfTournament = { eventId ->
                    matchRepository.deleteMatchesOfTournament(eventId).getOrThrow()
                },
                scheduleEvent = { scheduleAction, updated ->
                    when (scheduleAction) {
                        EventScheduleEditAction.RESCHEDULE -> {
                            eventRepository.scheduleEvent(updated.id).getOrThrow()
                        }
                        EventScheduleEditAction.BUILD_BRACKETS -> {
                            val participantCount = updated.maxParticipants.takeIf { maxParticipants ->
                                maxParticipants > 0
                            }
                            eventRepository.scheduleEvent(updated.id, participantCount).getOrThrow()
                        }
                        EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS -> {
                            eventRepository.scheduleEvent(
                                eventId = updated.id,
                                includePlaceholderTeams = false,
                            ).getOrThrow()
                        }
                    }
                },
                refetchMatchesOfTournament = { eventId ->
                    matchRepository.getMatchesOfTournament(eventId).getOrThrow()
                },
                resetBracketMatchesAfterSchedule = { updated ->
                    resetBracketMatchesAfterSchedule(
                        event = updated,
                        getMatchesOfTournament = { eventId ->
                            matchRepository.getMatchesOfTournament(eventId).getOrThrow()
                        },
                        updateMatchesBulk = { matches ->
                            matchRepository.updateMatchesBulk(matches).getOrThrow()
                        },
                    )
                },
                refreshLeagueStandingsAfterSchedule = ::refreshLeagueStandingsAfterSchedule,
                showLoading = { message -> loadingHandler.showLoading(message) },
                hideLoading = loadingHandler::hideLoading,
            )) {
                is EventScheduleEditResult.Success -> {
                    cancelEditingEvent()
                    _errorState.value = ErrorMessage(result.message)
                }
                is EventScheduleEditResult.Failure -> {
                    _errorState.value = ErrorMessage(result.throwable.userMessage(result.fallbackMessage))
                }
            }
        }
    }

    override fun createTemplateFromCurrentEvent() {
        scope.launch {
            val sourceEvent = if (editDraftCoordinator.isEditing.value) editDraftCoordinator.editedEvent.value else selectedEvent.value
            when (val result = editActionCoordinator.runCreateTemplateAction(
                sourceEvent = sourceEvent,
                prepareTemplate = {
                    EventTemplateCreateBuilder.prepare(
                        EventTemplateCreateInput(
                            sourceEvent = sourceEvent,
                            currentUserId = currentUser.value.id,
                            sourceSport = sportsCatalogCoordinator.sportForId(sourceEvent.sportId),
                            isEditing = editDraftCoordinator.isEditing.value,
                            editableFields = editDraftCoordinator.editableFields.value,
                            relationFields = eventFields.value.map { relation -> relation.field },
                            editableTimeSlots = editDraftCoordinator.editableLeagueTimeSlots.value,
                            relationTimeSlots = eventWithRelations.value.timeSlots,
                            editableLeagueScoringConfig = editDraftCoordinator.editableLeagueScoringConfig.value,
                            nextId = ::newId,
                        ),
                    )
                },
                createTemplate = { templatePayload ->
                    eventRepository.createEvent(
                        newEvent = templatePayload.event,
                        requiredTemplateIds = emptyList(),
                        leagueScoringConfig = templatePayload.leagueScoringConfig,
                        fields = templatePayload.fields,
                        timeSlots = templatePayload.timeSlots,
                    ).getOrThrow()
                },
                showLoading = { message -> loadingHandler.showLoading(message) },
                hideLoading = loadingHandler::hideLoading,
            )) {
                is EventTemplateCreateResult.AlreadyTemplate -> {
                    _errorState.value = ErrorMessage(result.message)
                }
                is EventTemplateCreateResult.Success -> {
                    _errorState.value = ErrorMessage(result.message)
                }
                is EventTemplateCreateResult.Failure -> {
                    _errorState.value = ErrorMessage(result.throwable.userMessage(result.fallbackMessage))
                }
            }
        }
    }

    override fun publishEvent() {
        scope.launch {
            when (val result = editActionCoordinator.runPublishEventAction(
                currentEvent = selectedEvent.value,
                updateEvent = eventRepository::updateEvent,
                refreshEvent = { eventId ->
                    eventRepository.getEvent(eventId)
                },
                showLoading = { message -> loadingHandler.showLoading(message) },
                hideLoading = loadingHandler::hideLoading,
            )) {
                EventPublishResult.AlreadyPublished,
                EventPublishResult.Success -> Unit
                is EventPublishResult.Failure -> {
                    _errorState.value = ErrorMessage(result.throwable.userMessage(result.fallbackMessage))
                }
            }
        }
    }

    override fun createNewTeam() {
        navigationHandler.navigateToTeams(
            selectedEvent.value.freeAgents,
            selectedEvent.value,
            selectedFreeAgentId = null,
        )
    }

    override fun inviteFreeAgentToTeam(userId: String) {
        val normalizedUserId = userId.trim().takeIf(String::isNotBlank) ?: return
        navigationHandler.navigateToTeams(
            selectedEvent.value.freeAgents,
            selectedEvent.value,
            selectedFreeAgentId = normalizedUserId,
        )
    }

    override fun startManagingParticipants() {
        val event = selectedEvent.value
        if (isWeeklyParentEvent(event)) {
            requireSelectedWeeklyOccurrence(
                event = event,
                errorMessage = "Select an occurrence before managing participants.",
            )
        }
    }

    override fun stopManagingParticipants() = Unit

    override fun moveTeamParticipantDivision(team: TeamWithPlayers, divisionId: String) {
        scope.launch {
            val event = selectedEvent.value
            val weeklyOccurrence = if (isWeeklyParentEvent(event)) {
                requireSelectedWeeklyOccurrence(
                    event = event,
                    errorMessage = "Select an occurrence before moving teams.",
                ) ?: return@launch
            } else {
                null
            }
            applyParticipantMutationResult(
                participantManagementCoordinator.moveTeamParticipantDivision(
                    event = event,
                    team = team,
                    divisionId = divisionId,
                    occurrence = weeklyOccurrence,
                    moveTeamDivision = { targetEvent, targetTeam, targetDivisionId, occurrence ->
                        eventRepository.moveTeamParticipantDivision(
                            event = targetEvent,
                            team = targetTeam,
                            preferredDivisionId = targetDivisionId,
                            occurrence = occurrence,
                        )
                    },
                    applySuccessfulMove = { result, normalizedDivisionId ->
                        applyParticipantSyncResult(result)
                        selectDivision(normalizedDivisionId)
                        refreshSelectedWeeklyOccurrenceSummaryIfNeeded(result.event)
                        refreshParticipantManagementSnapshotIfNeeded(result.event)
                        refreshParticipantComplianceIfNeeded(result.event)
                    },
                    showLoading = loadingHandler::showLoading,
                    hideLoading = loadingHandler::hideLoading,
                ),
            )
        }
    }

    override fun removeTeamParticipant(team: TeamWithPlayers) {
        scope.launch {
            val event = selectedEvent.value
            val weeklyOccurrence = if (isWeeklyParentEvent(event)) {
                requireSelectedWeeklyOccurrence(
                    event = event,
                    errorMessage = "Select an occurrence before removing participants.",
                ) ?: return@launch
            } else {
                null
            }
            applyParticipantMutationResult(
                participantManagementCoordinator.removeTeamParticipant(
                    event = event,
                    team = team,
                    occurrence = weeklyOccurrence,
                    removeTeam = { targetEvent, targetTeam, occurrence ->
                        eventRepository.removeTeamFromEvent(
                            targetEvent,
                            targetTeam,
                            occurrence = occurrence,
                        )
                    },
                    refreshAfterSuccess = { eventId, warningMessage ->
                        refreshEventAfterParticipantMutation(
                            eventId = eventId,
                            warningMessage = warningMessage,
                        )
                    },
                    showLoading = loadingHandler::showLoading,
                    hideLoading = loadingHandler::hideLoading,
                ),
            )
        }
    }

    override fun removeUserParticipant(userId: String) {
        scope.launch {
            val event = selectedEvent.value
            val weeklyOccurrence = if (isWeeklyParentEvent(event)) {
                requireSelectedWeeklyOccurrence(
                    event = event,
                    errorMessage = "Select an occurrence before removing participants.",
                ) ?: return@launch
            } else {
                null
            }
            applyParticipantMutationResult(
                participantManagementCoordinator.removeUserParticipant(
                    event = event,
                    userId = userId,
                    occurrence = weeklyOccurrence,
                    removeUser = { targetEvent, targetUserId, occurrence ->
                        eventRepository.removeCurrentUserFromEvent(
                            targetEvent,
                            targetUserId = targetUserId,
                            occurrence = occurrence,
                        )
                    },
                    refreshAfterSuccess = { eventId, warningMessage ->
                        refreshEventAfterParticipantMutation(
                            eventId = eventId,
                            warningMessage = warningMessage,
                        )
                    },
                    showLoading = loadingHandler::showLoading,
                    hideLoading = loadingHandler::hideLoading,
                ),
            )
        }
    }

    private fun applyParticipantMutationResult(result: ParticipantMutationResult) {
        val message = when (result) {
            ParticipantMutationResult.NoOp -> null
            is ParticipantMutationResult.Success -> result.message
            is ParticipantMutationResult.Rejected -> result.message
            is ParticipantMutationResult.Failed -> result.message
        } ?: return
        _errorState.value = ErrorMessage(message)
    }

    override suspend fun getParticipantBillingSnapshot(teamId: String): Result<EventTeamBillingSnapshot> {
        return participantManagementCoordinator.getParticipantBillingSnapshot(
            eventId = selectedEvent.value.id,
            teamId = teamId,
            loadSnapshot = billingRepository::getEventTeamBillingSnapshot,
        )
    }

    override suspend fun createParticipantBill(
        teamId: String,
        request: EventTeamBillCreateRequest,
    ): Result<Unit> {
        return participantManagementCoordinator.createParticipantBill(
            eventId = selectedEvent.value.id,
            teamId = teamId,
            request = request,
            createBill = billingRepository::createEventTeamBill,
            refreshAfterSuccess = {
                refreshParticipantComplianceIfNeeded(selectedEvent.value)
            },
        )
    }

    override suspend fun createParticipantPaymentCheckout(
        teamId: String,
        request: EventTeamPaymentCheckoutRequest,
    ): Result<EventTeamPaymentCheckout> {
        return participantManagementCoordinator.createParticipantPaymentCheckout(
            eventId = selectedEvent.value.id,
            teamId = teamId,
            request = request,
            createCheckout = billingRepository::createEventTeamPaymentCheckout,
        )
    }

    override suspend fun refundParticipantPayment(
        teamId: String,
        billPaymentId: String,
        amountCents: Int,
    ): Result<Unit> {
        return participantManagementCoordinator.refundParticipantPayment(
            eventId = selectedEvent.value.id,
            teamId = teamId,
            billPaymentId = billPaymentId,
            amountCents = amountCents,
            refundPayment = billingRepository::refundEventTeamBillPayment,
            refreshAfterSuccess = {
                refreshParticipantComplianceIfNeeded(selectedEvent.value)
            },
        )
    }

    override fun selectPlace(place: MVPPlace?) {
        editEventField {
            copy(
                coordinates = place?.coordinates ?: listOf(0.0, 0.0),
                location = place?.name ?: "",
                address = place?.address,
            )
        }
    }

    override fun onTypeSelected(type: EventType) {
        editEventField { copy(eventType = type) }
    }

    private fun generateRounds() {
        bracketRoundsCoordinator.refreshRounds(divisionContentCoordinator.divisionMatches.value)
    }

    override fun selectFieldCount(count: Int) {
        editDraftCoordinator.selectFieldCount(count)
    }

    override fun updateLocalFieldName(index: Int, name: String) {
        editDraftCoordinator.updateLocalFieldName(index, name)
    }

    override fun setRentalResourceSelected(optionId: String, selected: Boolean) {
        if (rentalResourcesCoordinator.setSelected(optionId, selected)) {
            syncSelectedRentalResourcesIntoEditDraft()
        }
    }

    override fun updateLeagueScoringConfig(update: LeagueScoringConfigDTO.() -> LeagueScoringConfigDTO) {
        editDraftCoordinator.updateLeagueScoringConfig(update)
    }

    override fun addLeagueTimeSlot() {
        editDraftCoordinator.addLeagueTimeSlot()
    }

    override fun updateLeagueTimeSlot(index: Int, update: TimeSlot.() -> TimeSlot) {
        editDraftCoordinator.updateLeagueTimeSlot(
            index = index,
            update = update,
            normalizeSlotResourceSelection = ::normalizeRentalSlotResourceSelection,
        )
    }

    override fun removeLeagueTimeSlot(index: Int) {
        editDraftCoordinator.removeLeagueTimeSlot(index)
    }

    private fun loadAvailableRentalResources(eventId: String) {
        scope.launch {
            billingRepository.listRentalResourceOptions(eventId = eventId.takeIf(String::isNotBlank))
                .onSuccess { options ->
                    val changedSelection = rentalResourcesCoordinator.applyLoadedResources(
                        options = options,
                        slots = editDraftCoordinator.editableLeagueTimeSlots.value,
                        eventId = eventId,
                    )
                    if (changedSelection) {
                        if (editDraftCoordinator.isEditing.value) {
                            syncSelectedRentalResourcesIntoEditDraft()
                        }
                    }
                }
                .onFailure { error ->
                    Napier.w("Unable to load event rental resources: ${error.message}")
                }
        }
    }

    private fun normalizeRentalSlotResourceSelection(
        slot: TimeSlot,
        validFieldIds: Set<String> = editDraftCoordinator.editableFieldIds(),
    ): TimeSlot = rentalResourcesCoordinator.normalizeSlotResourceSelection(slot, validFieldIds)

    private fun syncSelectedRentalResourcesIntoEditDraft() {
        val draft = rentalResourcesCoordinator.buildEditDraft(
            event = editDraftCoordinator.editedEvent.value,
            currentFields = editDraftCoordinator.editableFields.value,
            currentSlots = editDraftCoordinator.editableLeagueTimeSlots.value,
            defaultDivisionIds = defaultFieldDivisions(editDraftCoordinator.editedEvent.value),
        )
        editDraftCoordinator.applyRentalDraft(draft)
    }

    private fun selectedRentalResourceFields(
        options: List<RentalResourceOption> = rentalResourcesCoordinator.selectedOptions(),
    ): List<Field> = rentalResourcesCoordinator.selectedFields(options)

    private fun prepareEventForUpdate(): PreparedEventForUpdate {
        val result = EventEditPayloadBuilder.prepareForUpdate(
            EventEditPayloadInput(
                editedEvent = editDraftCoordinator.editedEvent.value.copy(
                    matchRulesOverride = matchRulesOverrideWithoutSegmentCount(
                        editDraftCoordinator.editedEvent.value.matchRulesOverride,
                    ),
                ),
                editableFields = editDraftCoordinator.editableFields.value,
                editableLeagueTimeSlots = editDraftCoordinator.editableLeagueTimeSlots.value,
                selectedRentalFields = selectedRentalResourceFields(),
                leagueScoringConfig = editDraftCoordinator.editableLeagueScoringConfig.value,
                originalEventStart = eventWithRelations.value.event.start,
                normalizeSlotResourceSelection = { slot, validFieldIds ->
                    normalizeRentalSlotResourceSelection(slot, validFieldIds)
                },
            )
        )
        result.editableFields?.let { fields ->
            editDraftCoordinator.applyPreparedEditableFields(fields)
        }
        return result.prepared
    }

    private fun logPreparedFieldOwnership(action: String, prepared: PreparedEventForUpdate) {
        val eventOrgId = prepared.event.organizationId?.trim()?.takeIf(String::isNotBlank)
        val fieldOwnership = prepared.fields
            .orEmpty()
            .joinToString(separator = ", ") { field ->
                val fieldOrg = field.organizationId?.trim()?.takeIf(String::isNotBlank) ?: "null"
                "${field.id}:$fieldOrg"
            }
        Napier.i(
            "Event ownership payload [$action] eventId=${prepared.event.id} " +
                "eventOrg=${eventOrgId ?: "null"} fieldOwnership=[$fieldOwnership]",
        )
    }

    override fun checkIsUserWaitListed(event: Event): Boolean {
        return membershipCoordinator.checkIsUserWaitListed(
            event = event,
            currentUserId = currentUser.value.id,
            currentUserTeamIds = currentUserTeamIds(),
            cachedMembership = resolveCachedCurrentUserRegistrationMembership(event),
            weeklyParentWithoutSelection = isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() == null,
        )
    }

    override fun deleteEvent() {
        scope.launch {
            val currentEvent = selectedEvent.value
            val deletePlan = eventDeletePlan(currentEvent)
            var deleted = false
            if (!deletePlan.shouldRefund) {
                loadingHandler.showLoading(deletePlan.loadingMessage)
                eventRepository.deleteEvent(selectedEvent.value.id)
                    .onSuccess {
                        deleted = true
                    }.onFailure {
                        _errorState.value = ErrorMessage(it.userMessage())
                    }
            } else {
                loadingHandler.showLoading(deletePlan.loadingMessage)
                billingRepository.deleteAndRefundEvent(selectedEvent.value)
                    .onSuccess {
                        deleted = true
                    }.onFailure {
                        _errorState.value = ErrorMessage(it.userMessage())
                    }
            }
            if (deleted) {
                backCallback.onBack()
            }
            loadingHandler.hideLoading()
        }
    }

    override fun reportEvent(notes: String?) {
        val currentEvent = selectedEvent.value
        scope.launch {
            eventRepository.reportEvent(currentEvent.id, notes)
                .onSuccess {
                    _errorState.value = ErrorMessage("Event reported. It will be hidden from your searches.")
                    backCallback.onBack()
                }
                .onFailure {
                    _errorState.value = ErrorMessage(it.userMessage("Failed to report event."))
                }
        }
    }

    override fun shareEvent() {
        val payload = eventSharePayload(selectedEvent.value)
        shareServiceProvider.getShareService().share(payload.title, payload.url)
    }

    override fun shareEventQrCode() {
        val targetEvent = selectedEvent.value
        val payload = eventQrCodeSharePayload(targetEvent)
        val client = apiClient ?: run {
            _errorState.value = ErrorMessage("Failed to share QR code.")
            return
        }
        scope.launch {
            runCatching {
                client.getBytes(payload.path)
            }.onSuccess { imageBytes ->
                shareServiceProvider.getShareService().shareImage(
                    title = payload.title,
                    imageBytes = imageBytes,
                    fileName = payload.fileName,
                    mimeType = payload.mimeType,
                )
            }.onFailure { throwable ->
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to share QR code.")
                )
            }
        }
    }

    override fun openEventDirections() {
        val directionsPlan = eventDirectionsPlan(selectedEvent.value)
        if (directionsPlan is EventDirectionsPlan.Unavailable) {
            _errorState.value = ErrorMessage(directionsPlan.message)
            return
        }
        val directionsUrl = (directionsPlan as EventDirectionsPlan.OpenUrl).url

        scope.launch {
            val result = urlHandler?.openUrlInWebView(directionsUrl)
            if (result == null) {
                _errorState.value = ErrorMessage("Unable to open directions.")
                return@launch
            }
            result.onFailure { throwable ->
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Unable to open directions."),
                )
            }
        }
    }

    override fun checkIsUserFreeAgent(event: Event): Boolean {
        return membershipCoordinator.checkIsUserFreeAgent(
            event = event,
            currentUserId = currentUser.value.id,
            currentUserTeamIds = currentUserTeamIds(),
            cachedMembership = resolveCachedCurrentUserRegistrationMembership(event),
            weeklyParentWithoutSelection = isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() == null,
        )
    }

    private suspend fun refreshCurrentUserMembershipState(event: Event) {
        val current = currentUser.value
        val selectedOccurrence = currentWeeklyOccurrenceSelection()
        val eventIsWeeklyParent = isWeeklyParentEvent(event)
        val missingWeeklySelection = membershipCoordinator.refreshCurrentUserMembershipState(
            event = event,
            currentUserId = current.id,
            profileTeamIds = current.teamIds,
            registrations = cachedCurrentUserRegistrations.value,
            selectedOccurrence = selectedOccurrence,
            isWeeklyParentEvent = eventIsWeeklyParent,
            weeklyParentWithoutSelection = eventIsWeeklyParent && selectedOccurrence == null,
            getTeamWithPlayers = { teamId ->
                teamRepository.getTeamWithPlayers(teamId).getOrNull()
            },
        )
        if (missingWeeklySelection) {
            registrationFlowCoordinator.clearWithdrawTargets()
        }
    }

    private fun resolveCachedCurrentUserRegistrationMembership(
        event: Event,
    ): CurrentUserRegistrationMembershipState? {
        return membershipCoordinator.resolveCachedMembership(
            registrations = cachedCurrentUserRegistrations.value,
            selectedOccurrence = currentWeeklyOccurrenceSelection(),
            currentUserId = currentUser.value.id,
            profileTeamIds = currentUser.value.teamIds,
            isWeeklyParentEvent = isWeeklyParentEvent(event),
        )
    }

    private suspend fun refreshWithdrawTargets(event: Event) {
        val current = currentUser.value
        registrationFlowCoordinator.replaceWithdrawTargets(
            registrationFlowCoordinator.buildWithdrawTargets(
                currentUserId = current.id,
                currentUserFullName = current.fullName,
                children = loadJoinableChildren(
                    warningMessage = "Failed to load linked children for withdraw targets.",
                ),
            ) { userId ->
                resolveWithdrawTargetMembership(event, userId)
            },
        )
    }

    private fun resolveWithdrawTargetMembership(
        event: Event,
        userId: String,
    ): WithdrawTargetMembership? {
        return membershipCoordinator.resolveWithdrawTargetMembership(
            event = event,
            userId = userId,
            currentUserId = currentUser.value.id,
            profileTeamIds = currentUser.value.teamIds,
            cachedCurrentUserMembership = if (userId == currentUser.value.id) {
                resolveCachedCurrentUserRegistrationMembership(event)
            } else {
                null
            },
            weeklyParentWithoutSelection = isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() == null,
        )
    }

    private fun currentUserTeamIds(): Set<String> {
        return membershipCoordinator.currentUserTeamIds(currentUser.value.teamIds)
    }

    override fun showFeeBreakdown(
        feeBreakdown: FeeBreakdown, onConfirm: () -> Unit, onCancel: () -> Unit
    ) {
        registrationActionHandler.showFeeBreakdown(
            feeBreakdown = feeBreakdown,
            onConfirm = onConfirm,
        )
    }

    override fun dismissFeeBreakdown() {
        registrationActionHandler.dismissFeeBreakdown()
    }

    override fun confirmFeeBreakdown() {
        registrationActionHandler.confirmFeeBreakdown()
    }

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

    private fun refreshEditableRounds() {
        matchEditingCoordinator.refreshEditableRounds(
            event = selectedEvent.value,
            selectedDivisionId = selectedDivision.value,
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

    private fun createStagedMatch(
        creationContext: MatchCreateContext,
        seed: MatchMVP? = null,
        openEditor: Boolean = false,
    ): MatchWithRelations? {
        return matchEditingCoordinator.createStagedMatchIfEditable(
            canEditMatchesNow = canEditMatchesNow(),
            input = StagedMatchInput(
                event = selectedEvent.value,
                selectedDivisionId = selectedDivision.value,
                creationContext = creationContext,
                seed = seed,
                clientId = newId(),
                now = Clock.System.now(),
            ),
            openEditor = openEditor,
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        ) { relation, context, isCreateMode ->
            showMatchEditDialog(
                match = relation,
                creationContext = context,
                isCreateMode = isCreateMode,
            )
        }
    }

    override fun startEditingMatches() {
        scope.launch {
            matchEditingCoordinator.beginEditingIfAllowed(
                canManageMatchEditing = canManageMatchEditing(),
                matches = eventWithRelations.value.matches,
                event = selectedEvent.value,
                selectedDivisionId = selectedDivision.value,
                buildRounds = bracketRoundsCoordinator::buildBracketRounds,
            )
        }
    }

    override fun cancelEditingMatches() {
        matchEditingCoordinator.cancelEditing()
    }

    override fun commitMatchChanges() {
        if (!canEditMatchesNow()) {
            return
        }
        scope.launch {
            when (val result = matchEditingCoordinator.commitChanges(
                isTournament = selectedEvent.value.eventType == EventType.TOURNAMENT,
                updateMatchesBulk = { payload ->
                    matchRepository.updateMatchesBulk(payload.updates, payload.creates, payload.deletes)
                },
                onCommitStarted = { loadingHandler.showLoading("Updating matches...") },
                onCommitFinished = { loadingHandler.hideLoading() },
            )) {
                MatchEditCommitResult.Success -> Unit
                is MatchEditCommitResult.Invalid -> {
                    _errorState.value = ErrorMessage(result.errorMessage)
                }
                is MatchEditCommitResult.Failure -> {
                    _errorState.value = ErrorMessage(result.throwable.userMessage("Failed to update matches"))
                }
            }
        }
    }

    override fun updateEditableMatch(matchId: String, updater: (MatchMVP) -> MatchMVP) {
        matchEditingCoordinator.updateEditableMatch(
            matchId = matchId,
            event = selectedEvent.value,
            selectedDivisionId = selectedDivision.value,
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
            updater = updater,
        )
    }

    override fun setLockForEditableMatches(matchIds: List<String>, locked: Boolean) {
        matchEditingCoordinator.setLockForEditableMatchesIfEditable(
            canEditMatchesNow = canEditMatchesNow(),
            matchIds = matchIds,
            locked = locked,
            event = selectedEvent.value,
            selectedDivisionId = selectedDivision.value,
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

    override fun addScheduleMatch() {
        createStagedMatch(
            creationContext = MatchCreateContext.SCHEDULE,
            openEditor = true,
        )
    }

    override fun addBracketMatch() {
        createStagedMatch(
            creationContext = MatchCreateContext.BRACKET,
            openEditor = true,
        )
    }

    override fun addBracketMatchFromAnchor(anchorMatchId: String, slot: BracketAddSlot) {
        matchEditingCoordinator.addBracketMatchFromAnchorIfEditable(
            canEditMatchesNow = canEditMatchesNow(),
            anchorMatchId = anchorMatchId,
            slot = slot,
            event = selectedEvent.value,
            selectedDivisionId = selectedDivision.value,
            clientId = newId(),
            now = Clock.System.now(),
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

    override fun showTeamSelection(matchId: String, position: TeamPosition) {
        matchEditingCoordinator.showTeamSelection(matchId, position, eventWithRelations.value.teams)
    }

    override fun selectTeamForMatch(matchId: String, position: TeamPosition, teamId: String?) {
        matchEditingCoordinator.selectTeamForMatch(
            matchId = matchId,
            position = position,
            teamId = teamId,
            event = selectedEvent.value,
            selectedDivisionId = selectedDivision.value,
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

    override fun dismissTeamSelection() {
        matchEditingCoordinator.dismissTeamSelection()
    }

    override fun showMatchEditDialog(
        match: MatchWithRelations,
        creationContext: MatchCreateContext,
        isCreateMode: Boolean,
    ) {
        matchEditingCoordinator.showMatchEditDialogIfEditable(
            canEditMatchesNow = canEditMatchesNow(),
            match = match,
            teams = eventWithRelations.value.teams,
            fields = divisionFields.value,
            fallbackMatches = eventWithRelations.value.matches,
            event = selectedEvent.value,
            players = eventWithRelations.value.players,
            isCreateMode = isCreateMode,
            creationContext = creationContext,
        )
    }

    override fun sendNotification(title: String, message: String) {
        scope.launch {
            notificationCoordinator
                .sendEventNotification(eventWithRelations.value.event.id, title, message)
                ?.let { errorMessage -> _errorState.value = errorMessage }
        }
    }

    override fun dismissMatchEditDialog() {
        matchEditingCoordinator.dismissMatchEditDialog(
            event = selectedEvent.value,
            selectedDivisionId = selectedDivision.value,
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

    override fun deleteMatchFromDialog(matchId: String) {
        matchEditingCoordinator.deleteMatchFromDialogIfEditable(
            canEditMatchesNow = canEditMatchesNow(),
            matchId = matchId,
            event = selectedEvent.value,
            selectedDivisionId = selectedDivision.value,
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

    override fun updateMatchFromDialog(updatedMatch: MatchWithRelations) {
        matchEditingCoordinator.updateMatchFromDialogIfEditable(
            canEditMatchesNow = canEditMatchesNow(),
            updatedMatch = updatedMatch,
            event = selectedEvent.value,
            selectedDivisionId = selectedDivision.value,
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

}
