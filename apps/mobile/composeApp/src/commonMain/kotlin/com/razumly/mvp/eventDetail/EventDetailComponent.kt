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
import com.razumly.mvp.core.data.repositories.CreateBillRequest
import com.razumly.mvp.core.data.repositories.EventTeamBillCreateRequest
import com.razumly.mvp.core.data.repositories.EventTeamBillingSnapshot
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckout
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckoutRequest
import com.razumly.mvp.core.data.repositories.EventComplianceUserSummary
import com.razumly.mvp.core.data.repositories.EventDetailSyncResult
import com.razumly.mvp.core.data.repositories.EventParticipantRefundMode
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
import com.razumly.mvp.core.util.emailAddressRegex
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.eventDetail.data.BracketNode
import com.razumly.mvp.eventDetail.data.IMatchRepository
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import io.github.aakira.napier.Napier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
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
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

interface EventDetailComponent : ComponentContext, IPaymentProcessor {
    val selectedEvent: StateFlow<Event>
    val divisionMatches: StateFlow<Map<String, MatchWithRelations>>
    val divisionTeams: StateFlow<Map<String, TeamWithPlayers>>
    val selectedDivision: StateFlow<String?>
    val selectedWeeklyOccurrence: StateFlow<SelectedWeeklyOccurrenceState?>
    val selectedWeeklyOccurrenceSummary: StateFlow<WeeklyOccurrenceSummary?>
    val weeklyOccurrenceSummaries: StateFlow<Map<String, WeeklyOccurrenceSummary>>
    val overviewParticipantSummary: StateFlow<EventParticipantsSummary?>
    val eventFields: StateFlow<List<FieldWithMatches>>
    val divisionFields: StateFlow<List<FieldWithMatches>>
    val rounds: StateFlow<List<List<MatchWithRelations?>>>
    val losersBracket: StateFlow<Boolean>
    val showDetails: StateFlow<Boolean>
    val eventTeamsAndParticipantsLoading: StateFlow<Boolean>
    val participantManagementSnapshot: StateFlow<EventParticipantManagementSnapshot>
    val participantDivisionWarnings: StateFlow<List<EventParticipantDivisionWarning>>
    val participantManagementLoading: StateFlow<Boolean>
    val teamComplianceSummaries: StateFlow<Map<String, EventTeamComplianceSummary>>
    val userComplianceSummaries: StateFlow<Map<String, EventComplianceUserSummary>>
    val participantComplianceLoading: StateFlow<Boolean>
    val eventMatchesLoading: StateFlow<Boolean>
    val errorState: StateFlow<ErrorMessage?>
    val eventWithRelations: StateFlow<EventWithFullRelations>
    val currentUser: StateFlow<UserData>
    val scheduleTrackedUserIds: StateFlow<Set<String>>
    val validTeams: StateFlow<List<TeamWithPlayers>>
    val isHost: StateFlow<Boolean>
    val isEditing: StateFlow<Boolean>
    val isUserInEvent: StateFlow<Boolean>
    val isRegistrationPaymentPending: StateFlow<Boolean>
    val isRegistrationPaymentFailed: StateFlow<Boolean>
    val isBracketView: StateFlow<Boolean>
    val isEventFull: StateFlow<Boolean>
    val editedEvent: StateFlow<Event>
    val backCallback: BackCallback
    val showFeeBreakdown: StateFlow<Boolean>
    val currentFeeBreakdown: StateFlow<FeeBreakdown?>
    val isUserInWaitlist: StateFlow<Boolean>
    val isUserFreeAgent: StateFlow<Boolean>
    val isUserCaptain: StateFlow<Boolean>
    val isEditingMatches: StateFlow<Boolean>
    val editableMatches: StateFlow<List<MatchWithRelations>>
    val editableRounds: StateFlow<List<List<MatchWithRelations?>>>
    val sports: StateFlow<List<Sport>>
    val divisionTypeParameters: StateFlow<DivisionTypeParameters>
    val showTeamSelectionDialog: StateFlow<TeamSelectionDialogState?>
    val showMatchEditDialog: StateFlow<MatchEditDialogState?>
    val joinChoiceDialog: StateFlow<JoinChoiceDialogState?>
    val childJoinSelectionDialog: StateFlow<ChildJoinSelectionDialogState?>
    val teamJoinQuestionDialog: StateFlow<TeamJoinQuestionDialogState?>
    val eventRegistrationQuestionDialog: StateFlow<EventRegistrationQuestionDialogState?>
    val eventRegistrationQuestions: StateFlow<List<TeamJoinQuestion>>
    val eventRegistrationQuestionAnswers: StateFlow<Map<String, String>>
    val eventRegistrationQuestionsExpanded: StateFlow<Boolean>
    val registrationHoldExpiresAt: StateFlow<String?>
    val paymentPlanPreviewDialog: StateFlow<PaymentPlanPreviewDialogState?>
    val withdrawTargets: StateFlow<List<WithdrawTargetOption>>
    val textSignaturePrompt: StateFlow<TextSignaturePromptState?>
    val webSignaturePrompt: StateFlow<WebSignaturePromptState?>
    val billingAddressPrompt: StateFlow<BillingAddressDraft?>
    val startingTeamRegistrationId: StateFlow<String?>
    val eventImageIds: StateFlow<List<String>>
    val organizationTemplates: StateFlow<List<OrganizationTemplateDocument>>
    val organizationTemplatesLoading: StateFlow<Boolean>
    val organizationTemplatesError: StateFlow<String?>
    val leagueDivisionStandings: StateFlow<LeagueDivisionStandings?>
    val leagueDivisionStandingsLoading: StateFlow<Boolean>
    val leagueStandingsConfirming: StateFlow<Boolean>
    val suggestedUsers: StateFlow<List<UserData>>
    val inviteTeamSuggestions: StateFlow<List<Team>>
    val inviteTeamsLoading: StateFlow<Boolean>
    val pendingStaffInvites: StateFlow<List<PendingStaffInviteDraft>>
    val editableLeagueTimeSlots: StateFlow<List<TimeSlot>>
    val editableFields: StateFlow<List<Field>>
    val availableRentalResources: StateFlow<List<RentalResourceOption>>
    val selectedRentalResourceIds: StateFlow<Set<String>>
    val editableLeagueScoringConfig: StateFlow<LeagueScoringConfigDTO>


    fun onNavigateToChat(user: UserData)
    fun matchSelected(selectedMatch: MatchWithRelations)
    fun showFeeBreakdown(feeBreakdown: FeeBreakdown, onConfirm: () -> Unit, onCancel: () -> Unit)
    fun updateEventRegistrationQuestionAnswer(questionId: String, answer: String)
    fun toggleEventRegistrationQuestionsExpanded()
    fun dismissEventRegistrationQuestionDialog()
    fun submitEventRegistrationQuestionDialogAnswers(answers: Map<String, String>)
    fun registrationHoldExpired()
    fun onHostCreateAccount()
    fun selectDivision(division: String)
    fun setLoadingHandler(loadingHandler: LoadingHandler)
    fun clearError()
    fun toggleBracketView()
    fun toggleLosersBracket()
    fun toggleDetails()
    fun toggleEdit()
    fun startEditingEvent()
    fun cancelEditingEvent()
    fun joinEvent()
    fun selectWeeklySession(
        sessionStart: Instant,
        sessionEnd: Instant,
        slotId: String? = null,
        occurrenceDate: String? = null,
        label: String? = null,
    )
    fun prefetchWeeklyOccurrenceSummaries(occurrences: List<EventOccurrenceSelection>)
    fun clearSelectedWeeklySession()
    fun joinEventAsTeam(team: TeamWithPlayers)
    fun confirmJoinAsSelf()
    fun showChildJoinSelection()
    fun selectChildForJoin(childUserId: String)
    fun dismissJoinChoiceDialog()
    fun dismissChildJoinSelectionDialog()
    fun dismissPaymentPlanPreviewDialog()
    fun confirmPaymentPlanPreviewDialog()
    fun viewEvent()
    fun leaveEvent(targetUserId: String? = null)
    fun withdrawAndRefund(targetUserId: String? = null)
    fun requestRefund(reason: String, targetUserId: String? = null)
    fun editEventField(update: Event.() -> Event)
    fun editTournamentField(update: Event.() -> Event)
    fun updateEvent()
    fun rescheduleEvent()
    fun buildBrackets()
    fun rebuildWithoutPlaceholderTeams()
    fun createTemplateFromCurrentEvent()
    fun publishEvent()
    fun deleteEvent()
    fun reportEvent(notes: String? = null)
    fun shareEvent()
    fun shareEventQrCode()
    fun openEventDirections()
    fun createNewTeam()
    fun inviteFreeAgentToTeam(userId: String)
    fun startManagingParticipants()
    fun stopManagingParticipants()
    fun moveTeamParticipantDivision(team: TeamWithPlayers, divisionId: String)
    fun removeTeamParticipant(team: TeamWithPlayers)
    fun removeUserParticipant(userId: String)
    fun startTeamRegistration(team: TeamWithPlayers)
    fun submitTeamJoinQuestionAnswers(answers: Map<String, String>)
    fun dismissTeamJoinQuestionDialog()
    suspend fun getParticipantBillingSnapshot(teamId: String): Result<EventTeamBillingSnapshot>
    suspend fun createParticipantBill(
        teamId: String,
        request: EventTeamBillCreateRequest,
    ): Result<Unit>
    suspend fun createParticipantPaymentCheckout(
        teamId: String,
        request: EventTeamPaymentCheckoutRequest,
    ): Result<EventTeamPaymentCheckout>
    suspend fun refundParticipantPayment(
        teamId: String,
        billPaymentId: String,
        amountCents: Int,
    ): Result<Unit>
    fun selectPlace(place: MVPPlace?)
    fun onTypeSelected(type: EventType)
    fun selectFieldCount(count: Int)
    fun updateLocalFieldName(index: Int, name: String)
    fun setRentalResourceSelected(optionId: String, selected: Boolean)
    fun updateLeagueScoringConfig(update: LeagueScoringConfigDTO.() -> LeagueScoringConfigDTO)
    fun addLeagueTimeSlot()
    fun updateLeagueTimeSlot(index: Int, update: TimeSlot.() -> TimeSlot)
    fun removeLeagueTimeSlot(index: Int)
    fun checkIsUserWaitListed(event: Event): Boolean
    fun checkIsUserFreeAgent(event: Event): Boolean
    fun dismissFeeBreakdown()
    fun confirmFeeBreakdown()
    fun startEditingMatches()
    fun cancelEditingMatches()
    fun commitMatchChanges()
    fun updateEditableMatch(matchId: String, updater: (MatchMVP) -> MatchMVP)
    fun setLockForEditableMatches(matchIds: List<String>, locked: Boolean)
    fun addScheduleMatch()
    fun addBracketMatch()
    fun addBracketMatchFromAnchor(anchorMatchId: String, slot: BracketAddSlot)
    fun showTeamSelection(matchId: String, position: TeamPosition)
    fun selectTeamForMatch(matchId: String, position: TeamPosition, teamId: String?)
    fun dismissTeamSelection()
    fun showMatchEditDialog(
        match: MatchWithRelations,
        creationContext: MatchCreateContext = MatchCreateContext.BRACKET,
        isCreateMode: Boolean = false,
    )
    fun deleteMatchFromDialog(matchId: String)
    fun dismissMatchEditDialog()
    fun updateMatchFromDialog(updatedMatch: MatchWithRelations)
    fun refreshEventDetails()
    fun refreshLeagueStandings()
    fun confirmLeagueStandings(applyReassignment: Boolean = true)
    fun confirmTextSignature()
    fun dismissTextSignature()
    fun dismissWebSignaturePrompt()
    fun submitBillingAddress(address: BillingAddressDraft)
    fun dismissBillingAddressPrompt()
    fun onUploadSelected(photo: GalleryPhotoResult)
    fun deleteImage(imageId: String)
    fun sendNotification(title: String, message: String)
    fun searchUsers(query: String)
    fun searchInviteTeams(query: String)
    fun inviteTeamToEvent(team: Team)
    fun invitePlayerToEvent(user: UserData)
    fun invitePlayerToEventByEmail(firstName: String, lastName: String, email: String)
    suspend fun addPendingStaffInvite(
        firstName: String,
        lastName: String,
        email: String,
        roles: Set<EventStaffRole>,
    ): Result<Unit>
    fun removePendingStaffInvite(email: String, role: EventStaffRole? = null)
}

data class TeamSelectionDialogState(
    val matchId: String, val position: TeamPosition, val availableTeams: List<TeamWithPlayers>
)

data class MatchEditDialogState(
    val match: MatchWithRelations,
    val teams: List<TeamWithPlayers>,
    val fields: List<FieldWithMatches>,
    val allMatches: List<MatchWithRelations>,
    val eventOfficials: List<EventOfficial>,
    val officialPositions: List<EventOfficialPosition>,
    val players: List<UserData>,
    val eventType: EventType,
    val isCreateMode: Boolean = false,
    val creationContext: MatchCreateContext = MatchCreateContext.BRACKET,
)

data class TextSignaturePromptState(
    val step: SignStep,
    val currentStep: Int,
    val totalSteps: Int,
)

data class WebSignaturePromptState(
    val step: SignStep?,
    val url: String,
    val currentStep: Int,
    val totalSteps: Int,
)

data class JoinChildOption(
    val userId: String,
    val fullName: String,
    val email: String?,
    val hasEmail: Boolean,
)

data class JoinChoiceDialogState(
    val children: List<JoinChildOption>,
)

data class ChildJoinSelectionDialogState(
    val children: List<JoinChildOption>,
)

data class TeamJoinQuestionDialogState(
    val teamId: String,
    val teamName: String,
    val joinPolicy: String,
    val questions: List<TeamJoinQuestion>,
)

data class EventRegistrationQuestionDialogState(
    val eventName: String,
    val questions: List<TeamJoinQuestion>,
    val answers: Map<String, String>,
)

data class SelectedWeeklyOccurrenceState(
    val slotId: String,
    val occurrenceDate: String,
    val label: String,
    val sessionStart: Instant,
    val sessionEnd: Instant,
)

data class WeeklyOccurrenceSummary(
    val participantCount: Int,
    val participantCapacity: Int?,
)

internal fun weeklyOccurrenceSummaryKey(
    slotId: String?,
    occurrenceDate: String?,
): String? {
    val normalizedSlotId = slotId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedOccurrenceDate = occurrenceDate?.trim()?.takeIf(String::isNotBlank) ?: return null
    return "$normalizedSlotId|$normalizedOccurrenceDate"
}

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

enum class TeamPosition { TEAM1, TEAM2, OFFICIAL }

enum class MatchCreateContext {
    SCHEDULE,
    BRACKET,
}

enum class BracketAddSlot {
    PREVIOUS_LEFT,
    PREVIOUS_RIGHT,
    FINAL_WINNER_NEXT,
}

data class StagedMatchCreateMeta(
    val clientId: String,
    val creationContext: MatchCreateContext,
    val autoPlaceholderTeam: Boolean,
)

@Serializable
data class EventWithFullRelations(
    val event: Event,
    val players: List<UserData>,
    val matches: List<MatchWithRelations>,
    val teams: List<TeamWithPlayers>,
    val timeSlots: List<TimeSlot> = emptyList(),
    val organization: Organization? = null,
    val sport: Sport? = null,
    val leagueScoringConfig: LeagueScoringConfig? = null,
    val host: UserData? = null,
    val staffInvites: List<Invite> = emptyList(),
)

fun EventWithRelations.toEventWithFullRelations(
    matches: List<MatchWithRelations>, teams: List<TeamWithPlayers>
): EventWithFullRelations = EventWithFullRelations(
    event = event,
    players = players,
    matches = matches,
    teams = teams,
    timeSlots = emptyList(),
    organization = null,
    sport = null,
    leagueScoringConfig = null,
    host = host
)

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
    private var eventDetailHydrationToken: Long = 0L
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
        if (isWeeklyParentEvent(relations.event)) {
            val capacity = weeklySummary?.participantCapacity ?: return@combine false
            return@combine weeklySummary.participantCount >= capacity && capacity > 0
        }
        if ((relations.event.singleDivision || division == null) && overviewSummary != null) {
            val capacity = overviewSummary.participantCapacity
            if (capacity != null && capacity > 0) {
                return@combine overviewSummary.participantCount >= capacity
            }
        }
        checkEventIsFull(relations.event, relations.teams, division)
    }.stateIn(scope, SharingStarted.Eagerly, checkEventIsFull(event, emptyList(), null))

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
        val scope = currentRegistrationProgressScope()
        val key = registrationFlowCoordinator.registrationProgressKey(scope) ?: return
        val draft = registrationFlowCoordinator.buildRegistrationProgressDraft(
            scope = scope,
            selectedDivisionId = selectedDivision.value,
            step = step,
            registrationId = registrationId,
            holdExpiresAt = holdExpiresAt,
        ) ?: return
        currentUserDataSource?.saveRegistrationProgress(
            key = key,
            draft = draft,
        )
    }

    private suspend fun loadCurrentRegistrationProgress() {
        val key = registrationFlowCoordinator.registrationProgressKey(currentRegistrationProgressScope()) ?: run {
            registrationFlowCoordinator.clearRegistrationProgressState()
            return
        }
        val draft = currentUserDataSource?.loadRegistrationProgress(key)
        registrationFlowCoordinator.applyRegistrationProgressDraft(draft)
            ?.let { restoredDivisionId ->
                divisionContentCoordinator.restoreSelectedDivision(restoredDivisionId)
            }
    }

    private suspend fun clearCurrentRegistrationProgress() {
        registrationFlowCoordinator.registrationProgressKey(currentRegistrationProgressScope())?.let { key ->
            currentUserDataSource?.clearRegistrationProgress(key)
        }
        registrationFlowCoordinator.clearRegistrationProgressState()
    }

    private fun missingEventRegistrationQuestion(): TeamJoinQuestion? =
        registrationFlowCoordinator.missingRegistrationQuestion()

    private fun ensureEventRegistrationQuestionsAnswered(onReady: () -> Unit): Boolean {
        return registrationFlowCoordinator.ensureQuestionsAnswered(
            eventName = selectedEvent.value.name,
            onReady = onReady,
        )
    }

    private fun eventRegistrationAnswersForRequest(): Map<String, String> {
        return registrationFlowCoordinator.answersForRequest()
    }

    private suspend fun addCurrentUserToEventWithRegistrationAnswers(
        event: Event,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> {
        val answers = eventRegistrationAnswersForRequest()
        return if (answers.isEmpty()) {
            eventRepository.addCurrentUserToEvent(
                event = event,
                preferredDivisionId = preferredDivisionId,
                occurrence = occurrence,
            )
        } else {
            eventRepository.addCurrentUserToEvent(
                event = event,
                preferredDivisionId = preferredDivisionId,
                occurrence = occurrence,
                answers = answers,
            )
        }
    }

    private suspend fun addTeamToEventWithRegistrationAnswers(
        event: Event,
        team: Team,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> {
        val answers = eventRegistrationAnswersForRequest()
        return if (answers.isEmpty()) {
            eventRepository.addTeamToEvent(
                event = event,
                team = team,
                preferredDivisionId = preferredDivisionId,
                occurrence = occurrence,
            )
        } else {
            eventRepository.addTeamToEvent(
                event = event,
                team = team,
                preferredDivisionId = preferredDivisionId,
                occurrence = occurrence,
                answers = answers,
            )
        }
    }

    private suspend fun createPurchaseIntentWithRegistrationAnswers(
        event: Event,
        teamId: String? = null,
        priceCents: Int,
        occurrence: EventOccurrenceSelection?,
        divisionId: String?,
    ): Result<PurchaseIntent> {
        val answers = eventRegistrationAnswersForRequest()
        return if (answers.isEmpty()) {
            billingRepository.createPurchaseIntent(
                event = event,
                teamId = teamId,
                priceCents = priceCents,
                occurrence = occurrence,
                divisionId = divisionId,
            )
        } else {
            billingRepository.createPurchaseIntent(
                event = event,
                teamId = teamId,
                priceCents = priceCents,
                occurrence = occurrence,
                divisionId = divisionId,
                answers = answers,
            )
        }
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
                                val teamRegisteredSuccessfully = waitForTeamRegistrationWithTimeout(
                                    teamId = pendingTeam.team.id,
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
                                val userJoinedSuccessfully = waitForUserInEventWithTimeout(
                                    confirmationTarget = confirmationTarget,
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
        if (isWeeklyParentEvent(event)) {
            return
        }
        val manage = canManageParticipantData(event)
        markManagedBootstrapRequested(event, occurrence = null, manage = manage)
        eventRepository.syncEventDetail(
            event = event,
            manage = manage,
        )
            .onSuccess { result ->
                applyEventDetailSyncResult(result)
            }
            .onFailure { throwable ->
                clearManagedBootstrapRequestIfCurrent(event, occurrence = null)
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to load teams and participants."),
                )
            }
    }

    private fun applyParticipantSyncResult(result: EventParticipantsSyncResult) {
        participantManagementCoordinator.replaceParticipantDivisionWarnings(result.divisionWarnings)
        weeklyOccurrenceCoordinator.applyOverviewParticipantSummary(
            isWeeklyParent = isWeeklyParentEvent(result.event),
            weeklySelectionRequired = result.weeklySelectionRequired,
            participantCount = result.participantCount,
            participantCapacity = result.participantCapacity,
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
        applyParticipantSyncResult(result.participants)
        bootstrapResourcesCoordinator.applyEventDetailSyncResult(result)
        _eventStaffInvites.value = result.staffInvites
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

    private fun hasEventStarted(event: Event = selectedEvent.value): Boolean =
        Clock.System.now() >= event.start

    private fun hasSelectedEventOrOccurrenceStarted(event: Event = selectedEvent.value): Boolean =
        if (isWeeklyParentEvent(event)) {
            hasSelectedWeeklyOccurrenceStarted(event)
        } else {
            hasEventStarted(event)
        }

    private fun hasSelectedWeeklyOccurrenceStarted(event: Event = selectedEvent.value): Boolean {
        if (!isWeeklyParentEvent(event)) {
            return false
        }
        return weeklyOccurrenceCoordinator.hasSelectedOccurrenceStarted(Clock.System.now())
    }

    private fun isJoinBlockedByStart(event: Event = selectedEvent.value): Boolean {
        if (isWeeklyParentEvent(event)) {
            return hasSelectedWeeklyOccurrenceStarted(event)
        }
        if (!hasEventStarted(event)) return false
        return event.eventType != EventType.WEEKLY_EVENT
    }

    private fun isWeeklyParentEvent(event: Event = selectedEvent.value): Boolean =
        event.eventType == EventType.WEEKLY_EVENT &&
            event.timeSlotIds.any { slotId -> slotId.isNotBlank() }

    private fun currentWeeklyOccurrenceSelection(): EventOccurrenceSelection? {
        return weeklyOccurrenceCoordinator.currentSelection()
    }

    private fun participantManagementRoomTarget(
        event: Event,
        occurrence: EventOccurrenceSelection?,
    ): ParticipantManagementRoomTarget? {
        val eventId = event.id.trim().takeIf(String::isNotBlank) ?: return null
        if (isWeeklyParentEvent(event) && occurrence == null) {
            return null
        }
        return ParticipantManagementRoomTarget(
            eventId = eventId,
            slotId = occurrence?.slotId?.trim()?.takeIf(String::isNotBlank),
            occurrenceDate = occurrence?.occurrenceDate?.trim()?.takeIf(String::isNotBlank),
            teamSignup = event.teamSignup,
        )
    }

    private suspend fun refreshParticipantManagementSnapshot(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
        reportErrors: Boolean = true,
    ) {
        val normalizedEventId = eventId.trim()
        val requestToken = participantManagementCoordinator.beginParticipantManagementRequest(normalizedEventId)
            ?: return
        try {
            eventRepository.getEventParticipantManagementSnapshot(
                eventId = normalizedEventId,
                occurrence = occurrence,
            ).onFailure { throwable ->
                if (!participantManagementCoordinator.isCurrentParticipantManagementRequest(requestToken)) {
                    return@onFailure
                }
                if (reportErrors) {
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Failed to load participant registrations."),
                    )
                } else {
                    Napier.w("Failed to refresh participant registrations.", throwable)
                }
            }
        } finally {
            participantManagementCoordinator.finishParticipantManagementRequest(requestToken)
        }
    }

    private suspend fun refreshParticipantComplianceSummaries(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
        teamSignup: Boolean,
        reportErrors: Boolean = true,
    ) {
        val normalizedEventId = eventId.trim()
        val requestToken = participantManagementCoordinator.beginParticipantComplianceRequest(normalizedEventId)
            ?: return

        try {
            val result = if (teamSignup) {
                eventRepository.getEventTeamCompliance(normalizedEventId, occurrence).map { }
            } else {
                eventRepository.getEventUserCompliance(normalizedEventId, occurrence).map { }
            }
            result.onFailure { throwable ->
                if (!participantManagementCoordinator.isCurrentParticipantComplianceRequest(requestToken)) {
                    return@onFailure
                }
                if (reportErrors) {
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Failed to load participant payment and document status."),
                    )
                } else {
                    Napier.w("Failed to refresh participant compliance.", throwable)
                }
            }
        } finally {
            participantManagementCoordinator.finishParticipantComplianceRequest(requestToken)
        }
    }

    private suspend fun refreshParticipantManagementData(
        target: ParticipantManagementRoomTarget,
        reportErrors: Boolean = true,
    ) {
        val occurrence = target.toOccurrence()
        refreshParticipantManagementSnapshot(
            eventId = target.eventId,
            occurrence = occurrence,
            reportErrors = reportErrors,
        )
        refreshParticipantComplianceSummaries(
            eventId = target.eventId,
            occurrence = occurrence,
            teamSignup = target.teamSignup,
            reportErrors = reportErrors,
        )
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
        if (!isWeeklyParentEvent(event)) {
            weeklyOccurrenceCoordinator.clearSelectedWeeklyOccurrenceSummary()
            return
        }

        val occurrence = currentWeeklyOccurrenceSelection()
        val manage = canManageParticipantData(event)
        markManagedBootstrapRequested(event, occurrence = occurrence, manage = manage)
        eventRepository.syncEventDetail(
            event = event,
            occurrence = occurrence,
            manage = manage,
        ).onSuccess { result ->
            applyEventDetailSyncResult(result)
            val participantResult = result.participants
            weeklyOccurrenceCoordinator.applySelectedOccurrenceParticipantSummary(
                occurrence = occurrence,
                weeklySelectionRequired = participantResult.weeklySelectionRequired,
                participantCount = participantResult.participantCount,
                participantCapacity = participantResult.participantCapacity,
            )
        }.onFailure { throwable ->
            clearManagedBootstrapRequestIfCurrent(event, occurrence)
            if (reportErrors) {
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to load occurrence participants."),
                )
            } else {
                Napier.w("Failed to refresh selected weekly occurrence participants.", throwable)
            }
        }
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
        eventRepository.getEvent(eventId)
            .onSuccess { refreshed ->
                val occurrence = currentWeeklyOccurrenceSelection()
                val syncResult = eventRepository.syncEventParticipants(
                    event = refreshed,
                    occurrence = occurrence,
                ).onFailure { throwable ->
                    Napier.w(warningMessage, throwable)
                }.getOrNull()
                if (syncResult != null) {
                    applyParticipantSyncResult(syncResult)
                }
                val eventForRefresh = syncResult?.event ?: refreshed
                refreshSelectedWeeklyOccurrenceSummaryIfNeeded(eventForRefresh)
                refreshParticipantManagementSnapshotIfNeeded(eventForRefresh)
                refreshParticipantComplianceIfNeeded(eventForRefresh)
            }.onFailure { throwable ->
                Napier.w(warningMessage, throwable)
            }
    }

    private fun ensureRegistrationOpen(): Boolean {
        if (!isJoinBlockedByStart()) return true
        _errorState.value = ErrorMessage(
            if (hasSelectedWeeklyOccurrenceStarted()) {
                "This weekly occurrence has already started. Joining is closed."
            } else {
                "This event has already started. Registration is closed."
            }
        )
        return false
    }

    private fun ensureWeeklyOccurrenceSelectedForRegistration(): Boolean {
        val event = selectedEvent.value
        if (!isWeeklyParentEvent(event)) {
            return true
        }
        return requireSelectedWeeklyOccurrence(
            event = event,
            errorMessage = "Select an occurrence before joining or managing registrations.",
        ) != null
    }

    override fun joinEvent() {
        scope.launch {
            if (!ensureRegistrationOpen()) return@launch
            if (!ensureWeeklyOccurrenceSelectedForRegistration()) return@launch
            if (resumePendingSignatureFlowIfNeeded()) {
                return@launch
            }
            if (!selectedEvent.value.teamSignup) {
                val children = loadJoinableChildren()
                if (children.isNotEmpty()) {
                    registrationFlowCoordinator.showJoinChoiceDialog(children)
                    return@launch
                }
            }
            runSelfJoinFlow()
        }
    }

    override fun startTeamRegistration(team: TeamWithPlayers) {
        scope.launch {
            val teamId = registrationFlowCoordinator.registrationTargetTeamId(team.team)
            if (teamId.isBlank() || registrationFlowCoordinator.startingTeamRegistrationId.value != null) return@launch

            if (currentUser.value.id.isBlank()) {
                _errorState.value = ErrorMessage("Please sign in to join this team.")
                return@launch
            }

            if (!registrationFlowCoordinator.startTeamRegistration(teamId)) return@launch
            try {
                loadingHandler.showLoading("Preparing team registration...")
                val registrationTeam = resolveTeamRegistrationTarget(team).getOrElse { throwable ->
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Unable to load team registration details."),
                    )
                    loadingHandler.hideLoading()
                    return@launch
                }

                val context = teamRepository.getTeamJoinRequestContext(teamId).getOrElse { throwable ->
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Unable to load team registration questions."),
                    )
                    loadingHandler.hideLoading()
                    return@launch
                }

                val joinPolicy = context.joinPolicy
                val joinPolicyDecision = registrationFlowCoordinator.teamJoinPolicyDecision(joinPolicy)
                if (!joinPolicyDecision.isAccepted) {
                    _errorState.value = ErrorMessage(
                        joinPolicyDecision.errorMessage ?: "This team is not accepting registrations.",
                    )
                    loadingHandler.hideLoading()
                    return@launch
                }

                if (context.questions.isNotEmpty()) {
                    registrationFlowCoordinator.showTeamJoinQuestionDialog(
                        dialog = TeamJoinQuestionDialogState(
                            teamId = context.teamId,
                            teamName = registrationTeam.team.name.ifBlank { "this team" },
                            joinPolicy = joinPolicy,
                            questions = context.questions,
                        ),
                        team = registrationTeam,
                    )
                    loadingHandler.hideLoading()
                    return@launch
                }

                submitTeamJoin(
                    team = registrationTeam,
                    joinPolicy = joinPolicy,
                    answers = emptyMap(),
                )
                loadingHandler.hideLoading()
            } finally {
                registrationFlowCoordinator.clearStartingTeamRegistrationIfNoPendingTeam()
            }
        }
    }

    override fun submitTeamJoinQuestionAnswers(answers: Map<String, String>) {
        val result = registrationFlowCoordinator.submitTeamJoinQuestionAnswers(answers) ?: return
        result.missingQuestion?.let { missingQuestion ->
            _errorState.value = ErrorMessage("Answer \"${missingQuestion.prompt}\" before continuing.")
            return
        }
        val team = result.team
        if (team == null) {
            _errorState.value = ErrorMessage("Unable to continue team registration.")
            return
        }

        val dialog = result.dialog ?: return
        scope.launch {
            val teamId = dialog.teamId.trim().takeIf(String::isNotBlank)
                ?: registrationFlowCoordinator.registrationTargetTeamId(team.team)
            if (!registrationFlowCoordinator.startTeamRegistration(teamId)) return@launch
            try {
                loadingHandler.showLoading(
                    registrationFlowCoordinator.teamJoinSubmitLoadingMessage(dialog.joinPolicy),
                )
                submitTeamJoin(
                    team = team,
                    joinPolicy = dialog.joinPolicy,
                    answers = answers,
                )
                loadingHandler.hideLoading()
            } finally {
                registrationFlowCoordinator.clearStartingTeamRegistrationIfNoPendingTeam()
            }
        }
    }

    override fun dismissTeamJoinQuestionDialog() {
        registrationFlowCoordinator.dismissTeamJoinQuestionDialog()
    }

    private suspend fun submitTeamJoin(
        team: TeamWithPlayers,
        joinPolicy: String,
        answers: Map<String, String>,
    ) {
        val teamId = registrationFlowCoordinator.registrationTargetTeamId(team.team)
        if (registrationFlowCoordinator.isRequestToJoinPolicy(joinPolicy)) {
            teamRepository.submitTeamJoinRequest(teamId, answers)
                .onSuccess {
                    refreshEventDetails()
                    _errorState.value = ErrorMessage("Request sent to ${team.team.name}.")
                }.onFailure { throwable ->
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Unable to submit join request."),
                    )
                }
            return
        }

        teamRepository.requestTeamRegistration(teamId, answers)
            .onSuccess { result ->
                handleTeamRegistrationResult(team, result, answers)
            }.onFailure { throwable ->
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Unable to start team registration."),
                )
            }
    }

    private suspend fun resolveTeamRegistrationTarget(team: TeamWithPlayers): Result<TeamWithPlayers> = runCatching {
        val targetTeamId = registrationFlowCoordinator.registrationTargetTeamId(team.team)
        if (targetTeamId.isBlank()) {
            error("Team id is missing.")
        }
        if (targetTeamId == team.team.id.trim()) {
            team
        } else {
            teamRepository.getTeamWithPlayers(targetTeamId).getOrThrow()
        }
    }

    private suspend fun handleTeamRegistrationResult(
        team: TeamWithPlayers,
        result: TeamRegistrationResult,
        answers: Map<String, String> = emptyMap(),
    ) {
        val decision = registrationFlowCoordinator.teamRegistrationResultDecision(result)
        when (decision.action) {
            TeamRegistrationResultAction.WAIT_FOR_PARENT_APPROVAL -> {
                _errorState.value = ErrorMessage(
                    decision.message ?: result.userMessage(
                        "A parent or guardian must approve this team request before registration can continue.",
                    ),
                )
                refreshEventDetails()
                return
            }
            TeamRegistrationResultAction.REQUIRE_CHILD_EMAIL -> {
                _errorState.value = ErrorMessage(
                    decision.message ?: result.userMessage("Add the child's email before continuing."),
                )
                return
            }
            TeamRegistrationResultAction.REQUIRE_ADDITIONAL_SIGNING -> {
                runActionAfterRequiredSigning(teamId = team.team.id) {
                    scope.launch {
                        registrationFlowCoordinator.setStartingTeamRegistrationId(team.team.id)
                        loadingHandler.showLoading("Refreshing team registration...")
                        teamRepository.requestTeamRegistration(team.team.id, answers)
                            .onSuccess { refreshedResult ->
                                continueTeamRegistration(team, refreshedResult)
                            }.onFailure { throwable ->
                                _errorState.value = ErrorMessage(
                                    throwable.userMessage("Unable to refresh team registration."),
                                )
                            }
                        loadingHandler.hideLoading()
                        registrationFlowCoordinator.clearStartingTeamRegistrationIfNoPendingTeam()
                    }
                }
                return
            }
            TeamRegistrationResultAction.CONTINUE -> {
                continueTeamRegistration(team, result)
            }
        }
    }

    private suspend fun continueTeamRegistration(
        team: TeamWithPlayers,
        result: TeamRegistrationResult,
    ) {
        val decision = registrationFlowCoordinator.teamRegistrationContinuationDecision(team.team, result)
        if (decision.action == TeamRegistrationContinuationAction.MISSING_TEAM_ID) {
            _errorState.value = ErrorMessage(decision.message ?: "This team is missing an id.")
            return
        }

        val teamId = decision.teamId
        registrationFlowCoordinator.setStartingTeamRegistrationId(teamId)
        try {
            if (decision.action == TeamRegistrationContinuationAction.START_CHECKOUT) {
                if (!ensureBillingAddressOrPrompt { scope.launch { continueTeamRegistration(team, result) } }) {
                    return
                }

                loadingHandler.showLoading("Preparing checkout...")
                billingRepository.createTeamRegistrationPurchaseIntent(
                    team = team.team,
                    teamRegistration = result.registration,
                ).onSuccess { intent ->
                    intent.registrationHoldExpiresAt
                        ?.trim()
                        ?.takeIf(String::isNotBlank)
                        ?.let { holdExpiresAt ->
                            registrationFlowCoordinator.setRegistrationHoldExpiresAt(holdExpiresAt)
                            saveCurrentRegistrationProgress(
                                step = "checkout",
                                registrationId = intent.registrationId,
                                holdExpiresAt = holdExpiresAt,
                            )
                        }
                    registrationFlowCoordinator.setPendingTeamRegistration(team)
                    showPaymentSheet(intent)
                }.onFailure { throwable ->
                    _errorState.value = ErrorMessage(
                        throwable.userMessage(result.userMessage("Unable to start team registration.")),
                    )
                    loadingHandler.hideLoading()
                }
                return
            }

            if (decision.action == TeamRegistrationContinuationAction.REJECT_INACTIVE) {
                _errorState.value = ErrorMessage(
                    decision.message ?: result.userMessage("Unable to join this team."),
                )
                return
            }

            membershipCoordinator.setUsersTeam(
                teamRepository.getTeamWithPlayers(teamId).getOrNull() ?: team,
                currentUser.value.id,
            )
            refreshCurrentUserMembershipState(selectedEvent.value)
            refreshEventDetails()
            clearCurrentRegistrationProgress()
            _errorState.value = ErrorMessage("You joined ${team.team.name}.")
        } finally {
            registrationFlowCoordinator.clearStartingTeamRegistrationIfNoPendingTeam()
        }
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

    private suspend fun resumePendingSignatureFlowIfNeeded(): Boolean {
        if (!registrationFlowCoordinator.hasPendingSignatureFlow()) {
            return false
        }

        loadSignatureStepsForCurrentContext()
        return true
    }

    override fun joinEventAsTeam(team: TeamWithPlayers) {
        scope.launch {
            if (!ensureRegistrationOpen()) return@launch
            if (!ensureEventRegistrationQuestionsAnswered { joinEventAsTeam(team) }) return@launch
            membershipCoordinator.setUsersTeam(team, currentUser.value.id)
            registrationFlowCoordinator.clearJoinDialogs()

            buildPaymentPlanPreviewDialogState(
                event = selectedEvent.value,
                ownerLabel = team.team.name.trim().ifBlank { "Your team" },
                forTeamJoin = true,
                preferredDivisionId = selectedDivision.value,
                currentUserIsMinor = currentUser.value.isMinor,
                isEventFull = isEventFull.value,
            )?.let { preview ->
                showPaymentPlanPreviewDialog(preview) {
                    scope.launch {
                        runActionAfterRequiredSigning {
                            executeJoinEventAsTeam(team)
                        }
                    }
                }
                return@launch
            }

            runActionAfterRequiredSigning {
                executeJoinEventAsTeam(team)
            }
        }
    }

    override fun confirmJoinAsSelf() {
        registrationFlowCoordinator.clearJoinDialogs()
        scope.launch {
            runSelfJoinFlow()
        }
    }

    override fun showChildJoinSelection() {
        val children = registrationFlowCoordinator.currentJoinableChildren()
        registrationFlowCoordinator.dismissJoinChoiceDialog()
        if (children.isEmpty()) {
            _errorState.value = ErrorMessage("No linked children are available for registration.")
            registrationFlowCoordinator.dismissChildJoinSelectionDialog()
            return
        }
        registrationFlowCoordinator.showChildJoinSelectionDialog(children)
    }

    override fun selectChildForJoin(childUserId: String) {
        if (!ensureRegistrationOpen()) {
            registrationFlowCoordinator.clearJoinDialogs()
            return
        }
        val selectedChild = registrationFlowCoordinator.findJoinableChild(childUserId)
        if (selectedChild == null) {
            _errorState.value = ErrorMessage("Unable to find that child profile.")
            return
        }

        registrationFlowCoordinator.clearJoinDialogs()
        if (!ensureEventRegistrationQuestionsAnswered { selectChildForJoin(childUserId) }) {
            return
        }
        scope.launch {
            runActionAfterRequiredSigning(
                signerContext = SignerContext.PARENT_GUARDIAN,
                child = selectedChild,
            ) {
                executeChildRegistration(selectedChild)
            }
        }
    }

    override fun dismissJoinChoiceDialog() {
        registrationFlowCoordinator.dismissJoinChoiceDialog()
    }

    override fun dismissChildJoinSelectionDialog() {
        registrationFlowCoordinator.dismissChildJoinSelectionDialog()
    }

    private suspend fun runSelfJoinFlow(skipPaymentPlanPreview: Boolean = false) {
        if (!ensureRegistrationOpen()) return
        if (!ensureEventRegistrationQuestionsAnswered {
                scope.launch { runSelfJoinFlow(skipPaymentPlanPreview = skipPaymentPlanPreview) }
            }
        ) {
            return
        }
        if (!skipPaymentPlanPreview) {
            buildPaymentPlanPreviewDialogState(
                event = selectedEvent.value,
                ownerLabel = "You",
                forTeamJoin = false,
                preferredDivisionId = selectedDivision.value,
                currentUserIsMinor = currentUser.value.isMinor,
                isEventFull = isEventFull.value,
            )?.let { preview ->
                showPaymentPlanPreviewDialog(preview) {
                    scope.launch {
                        runSelfJoinFlow(skipPaymentPlanPreview = true)
                    }
                }
                return
            }
        }
        runActionAfterRequiredSigning(
            signerContext = SignerContext.PARTICIPANT,
            child = null,
        ) {
            executeJoinEvent()
        }
    }

    private fun showPaymentPlanPreviewDialog(
        dialogState: PaymentPlanPreviewDialogState,
        onContinue: () -> Unit,
    ) {
        registrationFlowCoordinator.showPaymentPlanPreviewDialog(
            dialogState = dialogState,
            onContinue = onContinue,
        )
    }

    private suspend fun loadJoinableChildren(): List<JoinChildOption> {
        return userRepository.listChildren()
            .onFailure { throwable ->
                Napier.w("Failed to load linked children before join flow.", throwable)
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

    private suspend fun executeChildRegistration(child: JoinChildOption) {
        if (!ensureRegistrationOpen()) return
        val weeklyOccurrence = if (isWeeklyParentEvent()) {
            requireSelectedWeeklyOccurrence(
                errorMessage = "Select an occurrence before registering a child.",
            ) ?: return
        } else {
            null
        }
        try {
            val joiningWaitlist = !selectedEvent.value.teamSignup && isEventFull.value
            loadingHandler.showLoading("Registering Child ...")
            eventRepository.registerChildForEvent(
                eventId = selectedEvent.value.id,
                childUserId = child.userId,
                joinWaitlist = joiningWaitlist,
                occurrence = weeklyOccurrence,
            ).onSuccess { registration ->
                loadingHandler.showLoading("Refreshing Event ...")
                refreshEventAfterParticipantMutation(
                    eventId = selectedEvent.value.id,
                    warningMessage = "Failed to refresh event after child registration.",
                )
                _errorState.value = ErrorMessage(
                    registrationFlowCoordinator.childRegistrationResultMessage(child, registration),
                )
            }.onFailure { throwable ->
                _errorState.value = ErrorMessage(throwable.userMessage("Failed to register child."))
            }
        } finally {
            loadingHandler.hideLoading()
        }
    }

    private suspend fun createPaymentPlanBillForOwner(
        ownerType: String,
        ownerId: String,
        allowSplit: Boolean,
        preferredDivisionId: String?,
    ): Result<PaymentPlanBillStatus> {
        val event = selectedEvent.value
        val paymentPlan = resolveEffectivePaymentPlan(event, preferredDivisionId)
        val normalizedOwnerId = ownerId.trim()
        if (normalizedOwnerId.isEmpty()) {
            return Result.failure(IllegalArgumentException("Unable to start payment plan: owner id is missing."))
        }
        val priceCents = paymentPlan.priceCents
        if (priceCents == null) {
            return Result.failure(IllegalArgumentException("This division does not have a price set."))
        }
        if (priceCents <= 0) {
            return Result.failure(IllegalArgumentException("This division does not have a paid price set for a payment plan."))
        }

        val useRelativeDueDates = isWeeklyParentEvent(event)
        val selectedOccurrence = if (useRelativeDueDates) {
            currentWeeklyOccurrenceSelection()
        } else {
            null
        }
        if (useRelativeDueDates && selectedOccurrence == null) {
            return Result.failure(
                IllegalArgumentException("Select an occurrence before starting a weekly payment plan."),
            )
        }
        val installmentDueDates = if (useRelativeDueDates) {
            emptyList()
        } else {
            paymentPlan.installmentDueDates
                .mapNotNull { dueDate -> dueDate.trim().takeIf(String::isNotBlank) }
        }
        val installmentDueRelativeDays = if (useRelativeDueDates) {
            paymentPlan.installmentDueRelativeDays
        } else {
            emptyList()
        }
        if (useRelativeDueDates && installmentDueRelativeDays.size != paymentPlan.installmentAmounts.size) {
            return Result.failure(
                IllegalArgumentException("Weekly payment plans need a due offset for each installment."),
            )
        }

        return billingRepository.createBill(
            CreateBillRequest(
                ownerType = ownerType,
                ownerId = normalizedOwnerId,
                totalAmountCents = priceCents,
                eventId = event.id,
                slotId = selectedOccurrence?.slotId,
                occurrenceDate = selectedOccurrence?.occurrenceDate,
                organizationId = event.organizationId,
                installmentAmounts = paymentPlan.installmentAmounts,
                installmentDueDates = installmentDueDates,
                installmentDueRelativeDays = installmentDueRelativeDays,
                allowSplit = allowSplit,
                paymentPlanEnabled = true,
            )
        ).fold(
            onSuccess = { Result.success(PaymentPlanBillStatus.CREATED) },
            onFailure = { throwable ->
                if (throwable.isDuplicatePaymentPlanError()) {
                    Result.success(PaymentPlanBillStatus.ALREADY_EXISTS)
                } else {
                    Result.failure(throwable)
                }
            },
        )
    }

    private suspend fun rollbackUserJoinAfterBillingFailure(event: Event) {
        eventRepository.removeCurrentUserFromEvent(
            event = event,
            targetUserId = currentUser.value.id,
            occurrence = currentWeeklyOccurrenceSelection(),
        ).onFailure { throwable ->
            Napier.w("Failed to rollback user join after payment plan billing error.", throwable)
        }
    }

    private suspend fun rollbackTeamJoinAfterBillingFailure(event: Event, team: TeamWithPlayers) {
        eventRepository.removeTeamFromEvent(
            event = event,
            teamWithPlayers = team,
            occurrence = currentWeeklyOccurrenceSelection(),
        ).onFailure { throwable ->
            Napier.w("Failed to rollback team join after payment plan billing error.", throwable)
        }
    }

    private suspend fun submitMinorJoinRequestForParentApproval() {
        val weeklyOccurrence = if (isWeeklyParentEvent()) {
            requireSelectedWeeklyOccurrence(
                errorMessage = "Select an occurrence before requesting to join.",
            ) ?: return
        } else {
            null
        }
        loadingHandler.showLoading("Submitting Join Request ...")
        eventRepository.requestCurrentUserRegistration(
            event = selectedEvent.value,
            preferredDivisionId = selectedDivision.value,
            occurrence = weeklyOccurrence,
        ).onSuccess { registration ->
            loadingHandler.showLoading("Reloading Event")
            refreshEventAfterParticipantMutation(
                eventId = selectedEvent.value.id,
                warningMessage = "Failed to refresh event after submitting child join request.",
            )
            _errorState.value = ErrorMessage(
                registrationFlowCoordinator.selfRegistrationResultMessage(
                    registration = registration,
                    defaultMessage = "Join request submitted.",
                ) ?: "Join request submitted.",
            )
        }.onFailure { throwable ->
            _errorState.value = ErrorMessage(throwable.userMessage())
        }
    }

    private suspend fun executeJoinEvent() {
        if (!ensureRegistrationOpen()) return
        val weeklyOccurrence = if (isWeeklyParentEvent()) {
            requireSelectedWeeklyOccurrence(
                errorMessage = "Select an occurrence before joining.",
            ) ?: return
        } else {
            null
        }
        try {
            val paymentPlan = resolveEffectivePaymentPlan(
                event = selectedEvent.value,
                preferredDivisionId = selectedDivision.value,
            )
            when (
                registrationFlowCoordinator.determineJoinExecutionAction(
                    paymentPlan = paymentPlan,
                    currentUserIsMinor = currentUser.value.isMinor,
                    isEventFull = isEventFull.value,
                    isTeamSignup = selectedEvent.value.teamSignup,
                    forTeamJoin = false,
                )
            ) {
                JoinExecutionAction.REQUEST_PARENT_APPROVAL -> {
                    submitMinorJoinRequestForParentApproval()
                    return
                }
                JoinExecutionAction.REQUIRE_PRICE -> {
                    _errorState.value = ErrorMessage("Set a price for this division before joining.")
                    return
                }
                JoinExecutionAction.START_PAYMENT_PLAN -> {
                    var joinedByThisFlow = false
                    loadingHandler.showLoading("Joining Event ...")
                    val registrationResult = addCurrentUserToEventWithRegistrationAnswers(
                        event = selectedEvent.value,
                        preferredDivisionId = selectedDivision.value,
                        occurrence = weeklyOccurrence,
                    )
                    val registrationDecision =
                        registrationFlowCoordinator.selfJoinBeforePaymentPlanDecision(registrationResult)
                    joinedByThisFlow = registrationDecision.joinedByThisFlow
                    registrationDecision.message?.let { message ->
                        _errorState.value = ErrorMessage(message)
                    }
                    registrationDecision.failure?.let { failure ->
                        _errorState.value = ErrorMessage(failure.userMessage())
                        return
                    }
                    if (registrationDecision.shouldReloadEvent) {
                        loadingHandler.showLoading("Reloading Event")
                        refreshEventAfterParticipantMutation(
                            eventId = selectedEvent.value.id,
                            warningMessage = "Failed to refresh event after joining waitlist.",
                        )
                        return
                    }
                    if (!registrationDecision.shouldContinueToPaymentPlan) {
                        return
                    }

                    loadingHandler.showLoading("Starting Payment Plan ...")
                    val paymentPlanResult = createPaymentPlanBillForOwner(
                        ownerType = "USER",
                        ownerId = currentUser.value.id,
                        allowSplit = false,
                        preferredDivisionId = selectedDivision.value,
                    )
                    paymentPlanResult.onSuccess { status ->
                        loadingHandler.showLoading("Reloading Event")
                        refreshEventAfterParticipantMutation(
                            eventId = selectedEvent.value.id,
                            warningMessage = "Failed to refresh event after starting payment plan.",
                        )
                        clearCurrentRegistrationProgress()
                        _errorState.value = ErrorMessage(
                            registrationFlowCoordinator.paymentPlanBillSuccessMessage(
                                status = status,
                                forTeamJoin = false,
                            ),
                        )
                    }.onFailure { throwable ->
                        if (joinedByThisFlow) {
                            rollbackUserJoinAfterBillingFailure(selectedEvent.value)
                        }
                        _errorState.value = ErrorMessage(throwable.userMessage())
                    }
                    return
                }
                JoinExecutionAction.JOIN_DIRECTLY -> {
                    loadingHandler.showLoading("Joining Event ...")
                    addCurrentUserToEventWithRegistrationAnswers(
                        event = selectedEvent.value,
                        preferredDivisionId = selectedDivision.value,
                        occurrence = weeklyOccurrence,
                    ).onSuccess { registration ->
                        loadingHandler.showLoading("Reloading Event")
                        refreshEventAfterParticipantMutation(
                            eventId = selectedEvent.value.id,
                            warningMessage = "Failed to refresh event after joining.",
                        )
                        clearCurrentRegistrationProgress()
                        registrationFlowCoordinator.selfRegistrationResultMessage(registration)?.let { message ->
                            _errorState.value = ErrorMessage(message)
                        }
                    }.onFailure {
                        _errorState.value = ErrorMessage(it.userMessage())
                    }
                }
                JoinExecutionAction.CREATE_PURCHASE_INTENT -> {
                    if (!ensureBillingAddressOrPrompt { scope.launch { executeJoinEvent() } }) {
                        return
                    }
                    loadingHandler.showLoading("Creating Purchase Request ...")
                    createPurchaseIntentWithRegistrationAnswers(
                        event = selectedEvent.value,
                        priceCents = paymentPlan.configuredPriceCents,
                        occurrence = weeklyOccurrence,
                        divisionId = selectedDivision.value,
                    )
                        .onSuccess { purchaseIntent ->
                            registrationFlowCoordinator.setPendingJoinConfirmationTarget(
                                buildJoinConfirmationTarget(
                                    eventId = selectedEvent.value.id,
                                    registrantType = JoinConfirmationRegistrantType.SELF,
                                    registrantId = currentUser.value.id,
                                    occurrence = weeklyOccurrence,
                                )
                            )
                            processPurchaseIntent(purchaseIntent)
                        }.onFailure {
                            _errorState.value = ErrorMessage(it.userMessage())
                        }
                }
            }
        } finally {
            loadingHandler.hideLoading()
        }
    }

    private suspend fun executeJoinEventAsTeam(team: TeamWithPlayers) {
        if (!ensureRegistrationOpen()) return
        val weeklyOccurrence = if (isWeeklyParentEvent()) {
            requireSelectedWeeklyOccurrence(
                errorMessage = "Select an occurrence before joining with a team.",
            ) ?: return
        } else {
            null
        }
        try {
            val paymentPlan = resolveEffectivePaymentPlan(
                event = selectedEvent.value,
                preferredDivisionId = selectedDivision.value,
            )
            when (
                registrationFlowCoordinator.determineJoinExecutionAction(
                    paymentPlan = paymentPlan,
                    currentUserIsMinor = currentUser.value.isMinor,
                    isEventFull = isEventFull.value,
                    isTeamSignup = selectedEvent.value.teamSignup,
                    forTeamJoin = true,
                )
            ) {
                JoinExecutionAction.REQUEST_PARENT_APPROVAL -> {
                    submitMinorJoinRequestForParentApproval()
                    return
                }
                JoinExecutionAction.REQUIRE_PRICE -> {
                    _errorState.value = ErrorMessage("Set a price for this division before joining.")
                    return
                }
                JoinExecutionAction.START_PAYMENT_PLAN -> {
                    var joinedByThisFlow = false
                    loadingHandler.showLoading("Joining Event ...")
                    val joinResult = addTeamToEventWithRegistrationAnswers(
                        event = selectedEvent.value,
                        team = team.team,
                        preferredDivisionId = selectedDivision.value,
                        occurrence = weeklyOccurrence,
                    )
                    val joinDecision = registrationFlowCoordinator.teamJoinBeforePaymentPlanDecision(joinResult)
                    joinedByThisFlow = joinDecision.joinedByThisFlow
                    joinDecision.failure?.let { failure ->
                        _errorState.value = ErrorMessage(failure.userMessage())
                        return
                    }
                    if (!joinDecision.shouldContinueToPaymentPlan) {
                        return
                    }

                    loadingHandler.showLoading("Starting Payment Plan ...")
                    val paymentPlanResult = createPaymentPlanBillForOwner(
                        ownerType = "TEAM",
                        ownerId = team.team.id,
                        allowSplit = selectedEvent.value.allowTeamSplitDefault == true,
                        preferredDivisionId = selectedDivision.value,
                    )
                    paymentPlanResult.onSuccess { status ->
                        loadingHandler.showLoading("Reloading Event")
                        refreshEventAfterParticipantMutation(
                            eventId = selectedEvent.value.id,
                            warningMessage = "Failed to refresh event after starting team payment plan.",
                        )
                        clearCurrentRegistrationProgress()
                        _errorState.value = ErrorMessage(
                            registrationFlowCoordinator.paymentPlanBillSuccessMessage(
                                status = status,
                                forTeamJoin = true,
                            ),
                        )
                    }.onFailure { throwable ->
                        if (joinedByThisFlow) {
                            rollbackTeamJoinAfterBillingFailure(selectedEvent.value, team)
                        }
                        _errorState.value = ErrorMessage(throwable.userMessage())
                    }
                    return
                }
                JoinExecutionAction.JOIN_DIRECTLY -> {
                    loadingHandler.showLoading("Joining Event ...")
                    addTeamToEventWithRegistrationAnswers(
                        event = selectedEvent.value,
                        team = team.team,
                        preferredDivisionId = selectedDivision.value,
                        occurrence = weeklyOccurrence,
                    ).onSuccess {
                        loadingHandler.showLoading("Reloading Event")
                        refreshEventAfterParticipantMutation(
                            eventId = selectedEvent.value.id,
                            warningMessage = "Failed to refresh event after team join.",
                        )
                        clearCurrentRegistrationProgress()
                    }.onFailure {
                        _errorState.value = ErrorMessage(it.userMessage())
                    }
                }
                JoinExecutionAction.CREATE_PURCHASE_INTENT -> {
                    if (!ensureBillingAddressOrPrompt { scope.launch { executeJoinEventAsTeam(team) } }) {
                        return
                    }
                    loadingHandler.showLoading("Creating Purchase Request ...")
                    createPurchaseIntentWithRegistrationAnswers(
                        event = selectedEvent.value,
                        teamId = team.team.id,
                        priceCents = paymentPlan.configuredPriceCents,
                        occurrence = weeklyOccurrence,
                        divisionId = selectedDivision.value,
                    )
                        .onSuccess { purchaseIntent ->
                            registrationFlowCoordinator.setPendingJoinConfirmationTarget(
                                buildJoinConfirmationTarget(
                                    eventId = selectedEvent.value.id,
                                    registrantType = JoinConfirmationRegistrantType.TEAM,
                                    registrantId = team.team.id,
                                    occurrence = weeklyOccurrence,
                                )
                            )
                            processPurchaseIntent(purchaseIntent)
                        }.onFailure {
                            _errorState.value = ErrorMessage(it.userMessage())
                        }
                }
            }
        } finally {
            loadingHandler.hideLoading()
        }
    }

    private suspend fun runActionAfterRequiredSigning(
        signerContext: SignerContext = SignerContext.PARTICIPANT,
        child: JoinChildOption? = null,
        teamId: String? = null,
        onReady: suspend () -> Unit,
    ) {
        registrationFlowCoordinator.startRequiredSignatureFlow(
            signerContext = signerContext,
            child = child,
            currentAccountEmail = userRepository.currentAccount.value.getOrNull()?.email,
            teamId = teamId,
            onReady = onReady,
        )
        loadSignatureStepsForCurrentContext()
    }

    private suspend fun fetchRequiredSignatureStepsForCurrentContext(): Result<List<SignStep>> {
        if (!registrationFlowCoordinator.hasSignatureContexts()) {
            return Result.success(emptyList())
        }

        val target = registrationFlowCoordinator.currentSignatureFetchTarget()
        val context = target.signerContext

        return target.teamId?.let { teamId ->
            billingRepository.getRequiredTeamSignLinks(
                teamId = teamId,
                signerContext = context,
                childUserId = target.child?.userId,
                childUserEmail = target.child?.email,
            )
        } ?: billingRepository.getRequiredSignLinks(
            eventId = selectedEvent.value.id,
            signerContext = context,
            childUserId = target.child?.userId,
            childUserEmail = target.child?.email,
        )
    }

    private suspend fun awaitSignatureStepClearance(
        step: SignStep,
        operationId: String? = step.operationId,
    ): Boolean {
        val normalizedOperationId = operationId?.trim()?.takeIf(String::isNotBlank)
        if (normalizedOperationId != null) {
            _errorState.value = ErrorMessage("Waiting for signature sync...")
            billingRepository.pollBoldSignOperation(normalizedOperationId).getOrElse { throwable ->
                Napier.e("Failed to poll BoldSign operation.", throwable)
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to confirm signature status.")
                )
                clearPendingSignatureFlow()
                return false
            }
        }

        val intervalMillis = 2.seconds.inWholeMilliseconds
        val timeoutMillis = 60.seconds.inWholeMilliseconds
        var elapsedMillis = 0L

        while (elapsedMillis <= timeoutMillis) {
            _errorState.value = ErrorMessage("Waiting for signature sync...")
            val refreshedSteps = fetchRequiredSignatureStepsForCurrentContext().getOrElse { throwable ->
                Napier.e("Failed to refresh required signing documents.", throwable)
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to confirm signature status.")
                )
                clearPendingSignatureFlow()
                return false
            }

            if (refreshedSteps.none { refreshedStep -> pendingSignatureStepsMatch(refreshedStep, step) }) {
                registrationFlowCoordinator.replacePendingSignatureSteps(refreshedSteps)
                return true
            }

            if (elapsedMillis >= timeoutMillis) {
                break
            }

            delay(intervalMillis)
            elapsedMillis += intervalMillis
        }

        clearPendingSignatureFlow()
        _errorState.value = ErrorMessage("Document synchronization is delayed. Please try again shortly.")
        return false
    }

    private suspend fun loadSignatureStepsForCurrentContext() {
        if (!registrationFlowCoordinator.hasSignatureContexts()) {
            clearPendingSignatureFlow()
            return
        }

        fetchRequiredSignatureStepsForCurrentContext().onFailure { throwable ->
            Napier.e("Failed to load required signing documents.", throwable)
            _errorState.value = ErrorMessage(
                "Unable to load required documents: ${throwable.userMessage("Unknown error")}"
            )
        }.onSuccess { allSteps ->
            if (allSteps.isEmpty()) {
                advanceSigningContextOrComplete()
                return@onSuccess
            }

            registrationFlowCoordinator.replacePendingSignatureSteps(allSteps)
            processNextSignatureStep()
        }
    }

    private suspend fun advanceSigningContextOrComplete() {
        registrationFlowCoordinator.clearPendingSignatureSteps()

        if (registrationFlowCoordinator.advanceSignatureContext()) {
            loadSignatureStepsForCurrentContext()
            return
        }

        val action = registrationFlowCoordinator.completePendingSignatureFlow()
        action?.invoke()
    }

    private suspend fun processNextSignatureStep() {
        registrationFlowCoordinator.clearPendingSignaturePollJob()

        val currentStepState = registrationFlowCoordinator.currentPendingSignatureStep()
        if (currentStepState == null) {
            advanceSigningContextOrComplete()
            return
        }
        val currentStep = currentStepState.step

        if (currentStep.isTextStep()) {
            registrationFlowCoordinator.showTextSignaturePrompt(
                TextSignaturePromptState(
                    step = currentStep,
                    currentStep = currentStepState.currentStep,
                    totalSteps = currentStepState.totalSteps,
                )
            )
            return
        }

        val signingUrl = currentStep.resolvedSigningUrl()
        if (signingUrl.isNullOrBlank()) {
            clearPendingSignatureFlow()
            _errorState.value = ErrorMessage(
                "A required document is missing a signing URL."
            )
            return
        }

        registrationFlowCoordinator.showWebSignaturePrompt(
            WebSignaturePromptState(
                step = currentStep,
                url = signingUrl,
                currentStep = currentStepState.currentStep,
                totalSteps = currentStepState.totalSteps,
            )
        )

        _errorState.value = ErrorMessage("Waiting for signature sync...")
        registrationFlowCoordinator.replacePendingSignaturePollJob(
            scope.launch {
                if (awaitSignatureStepClearance(currentStep)) {
                    registrationFlowCoordinator.clearWebSignaturePrompt()
                    processNextSignatureStep()
                }
            }
        )
    }

    private fun clearPendingSignatureFlow() {
        registrationFlowCoordinator.clearPendingSignatureFlow()
    }

    private fun processPurchaseIntent(intent: PurchaseIntent) {
        if (!ensureDocumentSignedBeforePurchase(intent)) {
            return
        }

        intent.registrationHoldExpiresAt
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let { holdExpiresAt ->
                registrationFlowCoordinator.setRegistrationHoldExpiresAt(holdExpiresAt)
                scope.launch {
                    saveCurrentRegistrationProgress(
                        step = "checkout",
                        registrationId = intent.registrationId,
                        holdExpiresAt = holdExpiresAt,
                    )
                }
            }

        intent.feeBreakdown?.let { feeBreakdown ->
            registrationFlowCoordinator.setPendingPaymentSheetIntent(intent)
            showFeeBreakdown(feeBreakdown, onConfirm = {
                scope.launch {
                    showPendingPaymentSheet()
                }
            }, onCancel = {
                registrationFlowCoordinator.clearPendingPaymentSheetIntent()
                loadingHandler.hideLoading()
            })
        } ?: run {
            scope.launch {
                showPaymentSheet(intent)
            }
        }
    }

    private fun ensureDocumentSignedBeforePurchase(intent: PurchaseIntent): Boolean {
        if (!intent.isSignatureRequired() || intent.isSignatureCompleted()) {
            return true
        }

        val signingUrl = intent.resolvedSigningUrl()
        if (signingUrl.isNullOrBlank()) {
            Napier.w("Purchase intent requires signature but did not include a signing URL.")
            return true
        }

        registrationFlowCoordinator.showWebSignaturePrompt(
            WebSignaturePromptState(
                step = null,
                url = signingUrl,
                currentStep = 1,
                totalSteps = 1,
            )
        )
        _errorState.value = ErrorMessage(
            "Please complete document signing in the modal, then tap Purchase Ticket again."
        )

        return false
    }

    private suspend fun showPaymentSheet(intent: PurchaseIntent) {
        registrationFlowCoordinator.setPendingPaymentSheetIntent(intent)
        showPendingPaymentSheet()
    }

    private suspend fun showPendingPaymentSheet() {
        val intent = registrationFlowCoordinator.consumePendingPaymentSheetIntent() ?: return
        clearPaymentResult()
        setPaymentIntent(intent)
        val billingAddress = loadSavedBillingAddress()
        loadingHandler.showLoading("Waiting for Payment Completion ..")
        presentPaymentSheet(
            _currentAccount.value.email,
            currentUser.value.fullName,
            billingAddress,
        )
    }

    private suspend fun ensureBillingAddressOrPrompt(onReady: () -> Unit): Boolean {
        val billingAddress = billingRepository.getBillingAddress()
            .getOrElse { error ->
                _errorState.value = ErrorMessage(error.userMessage("Unable to load billing address."))
                return false
            }
            .billingAddress
            ?.normalized()

        if (billingAddress != null && billingAddress.isCompleteForUsTax()) {
            return true
        }

        registrationFlowCoordinator.showBillingAddressPrompt(
            billingAddress = billingAddress,
            onReady = onReady,
        )
        return false
    }

    private suspend fun loadSavedBillingAddress(): BillingAddressDraft? {
        return billingRepository.getBillingAddress()
            .getOrNull()
            ?.billingAddress
            ?.normalized()
    }

    override fun requestRefund(reason: String, targetUserId: String?) {
        scope.launch {
            val event = selectedEvent.value
            val weeklyOccurrence = if (isWeeklyParentEvent(event)) {
                requireSelectedWeeklyOccurrence(
                    event = event,
                    errorMessage = "Select an occurrence before requesting a refund.",
                ) ?: return@launch
            } else {
                null
            }
            val normalizedTargetUserId = registrationFlowCoordinator.normalizedWithdrawalTargetUserId(
                targetUserId = targetUserId,
                currentUserId = currentUser.value.id,
            )
            val membership = resolveWithdrawTargetMembership(
                event = event,
                userId = normalizedTargetUserId,
            )
            val decision = registrationFlowCoordinator.prepareWithdrawalAction(
                event = event,
                action = WithdrawalActionKind.REQUEST_REFUND,
                targetUserId = normalizedTargetUserId,
                currentUserId = currentUser.value.id,
                membership = membership,
                weeklyOccurrence = weeklyOccurrence,
                currentUserIsFreeAgent = checkIsUserFreeAgent(event),
                eventOrOccurrenceStarted = false,
            )
            decision.errorMessage?.let { message ->
                _errorState.value = ErrorMessage(message)
                return@launch
            }
            val useTeamWithdrawal = decision.useTeamWithdrawal
            loadingHandler.showLoading("Requesting Refund ...")
            val refundResult = if (useTeamWithdrawal) {
                val team = membershipCoordinator.usersTeam()
                if (team == null) {
                    Result.failure(IllegalStateException("Unable to resolve your team registration."))
                } else {
                    eventRepository.removeTeamFromEvent(
                        event = event,
                        teamWithPlayers = team,
                        refundMode = EventParticipantRefundMode.REQUEST,
                        refundReason = reason,
                        occurrence = weeklyOccurrence,
                    )
                }
            } else {
                billingRepository.leaveAndRefundEvent(
                    event = event,
                    reason = reason,
                    targetUserId = normalizedTargetUserId,
                )
            }
            refundResult.onFailure {
                _errorState.value = ErrorMessage(it.userMessage())
            }.onSuccess {
                loadingHandler.showLoading("Reloading Event")
                refreshEventAfterParticipantMutation(
                    eventId = event.id,
                    warningMessage = "Failed to refresh event after refund request.",
                )
            }
            loadingHandler.hideLoading()
        }
    }

    override fun withdrawAndRefund(targetUserId: String?) {
        scope.launch {
            val event = selectedEvent.value
            val weeklyOccurrence = if (isWeeklyParentEvent(event)) {
                requireSelectedWeeklyOccurrence(
                    event = event,
                    errorMessage = "Select an occurrence before refunding this registration.",
                ) ?: return@launch
            } else {
                null
            }
            val normalizedTargetUserId = registrationFlowCoordinator.normalizedWithdrawalTargetUserId(
                targetUserId = targetUserId,
                currentUserId = currentUser.value.id,
            )
            val membership = resolveWithdrawTargetMembership(
                event = event,
                userId = normalizedTargetUserId,
            )
            val decision = registrationFlowCoordinator.prepareWithdrawalAction(
                event = event,
                action = WithdrawalActionKind.WITHDRAW_AND_REFUND,
                targetUserId = normalizedTargetUserId,
                currentUserId = currentUser.value.id,
                membership = membership,
                weeklyOccurrence = weeklyOccurrence,
                currentUserIsFreeAgent = checkIsUserFreeAgent(event),
                eventOrOccurrenceStarted = hasSelectedEventOrOccurrenceStarted(event),
            )
            decision.errorMessage?.let { message ->
                _errorState.value = ErrorMessage(message)
                return@launch
            }
            val useTeamWithdrawal = decision.useTeamWithdrawal

            loadingHandler.showLoading("Withdrawing and Refunding ...")
            val refundResult = if (useTeamWithdrawal) {
                val team = membershipCoordinator.usersTeam()
                if (team == null) {
                    Result.failure(IllegalStateException("Unable to resolve your team registration."))
                } else {
                    eventRepository.removeTeamFromEvent(
                        event = event,
                        teamWithPlayers = team,
                        refundMode = EventParticipantRefundMode.AUTO,
                        occurrence = weeklyOccurrence,
                    )
                }
            } else {
                billingRepository.leaveAndRefundEvent(
                    event = event,
                    reason = "",
                    targetUserId = normalizedTargetUserId,
                )
            }

            refundResult.onFailure {
                _errorState.value = ErrorMessage(it.userMessage())
            }.onSuccess {
                loadingHandler.showLoading("Reloading Event")
                refreshEventAfterParticipantMutation(
                    eventId = event.id,
                    warningMessage = "Failed to refresh event after refund.",
                )
            }
            loadingHandler.hideLoading()
        }
    }

    override fun leaveEvent(targetUserId: String?) {
        scope.launch {
            val event = selectedEvent.value
            val weeklyOccurrence = if (isWeeklyParentEvent(event)) {
                requireSelectedWeeklyOccurrence(
                    event = event,
                    errorMessage = "Select an occurrence before leaving.",
                ) ?: return@launch
            } else {
                null
            }
            val normalizedTargetUserId = registrationFlowCoordinator.normalizedWithdrawalTargetUserId(
                targetUserId = targetUserId,
                currentUserId = currentUser.value.id,
            )
            val membership = resolveWithdrawTargetMembership(
                event = event,
                userId = normalizedTargetUserId,
            )
            val decision = registrationFlowCoordinator.prepareWithdrawalAction(
                event = event,
                action = WithdrawalActionKind.LEAVE,
                targetUserId = normalizedTargetUserId,
                currentUserId = currentUser.value.id,
                membership = membership,
                weeklyOccurrence = weeklyOccurrence,
                currentUserIsFreeAgent = checkIsUserFreeAgent(event),
                eventOrOccurrenceStarted = hasSelectedEventOrOccurrenceStarted(event),
            )
            decision.errorMessage?.let { message ->
                _errorState.value = ErrorMessage(message)
                return@launch
            }
            val resolvedMembership = decision.membership ?: return@launch

            val result = when (resolvedMembership) {
                WithdrawTargetMembership.PARTICIPANT -> {
                    if (decision.useTeamWithdrawal) {
                        loadingHandler.showLoading("Team Leaving Event ...")
                        val team = membershipCoordinator.usersTeam()
                        if (team == null) {
                            Result.failure(IllegalStateException("Unable to resolve your team registration."))
                        } else {
                            eventRepository.removeTeamFromEvent(
                                event = event,
                                teamWithPlayers = team,
                                occurrence = weeklyOccurrence,
                            )
                        }
                    } else {
                        loadingHandler.showLoading("Leaving Event ...")
                        eventRepository.removeCurrentUserFromEvent(
                            event = event,
                            targetUserId = normalizedTargetUserId,
                            occurrence = weeklyOccurrence,
                        )
                    }
                }

                WithdrawTargetMembership.WAITLIST,
                WithdrawTargetMembership.FREE_AGENT -> {
                    loadingHandler.showLoading("Leaving Event ...")
                    eventRepository.removeCurrentUserFromEvent(
                        event = event,
                        targetUserId = normalizedTargetUserId,
                        occurrence = weeklyOccurrence,
                    )
                }
            }

            result.onFailure { _errorState.value = ErrorMessage(it.userMessage()) }
            result.onSuccess {
                loadingHandler.showLoading("Reloading Event")
                refreshEventAfterParticipantMutation(
                    eventId = event.id,
                    warningMessage = "Failed to refresh event after leaving.",
                )
            }
            loadingHandler.hideLoading()
        }
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
        val eventId = selectedEvent.value.id.trim()
        if (eventId.isEmpty()) {
            if (showDetailsOnSuccess) {
                _showDetails.value = true
            }
            return
        }

        eventDetailHydrationToken += 1
        val requestToken = eventDetailHydrationToken
        eventDetailHydrationJob?.cancel()
        participantManagementCoordinator.setEventTeamsAndParticipantsLoading(true)
        _eventMatchesLoading.value = true

        eventDetailHydrationJob = scope.launch {
            try {
                val refreshedEvent = eventRepository.getEvent(eventId)
                    .onFailure { throwable ->
                        if (requestToken != eventDetailHydrationToken) return@onFailure
                        _errorState.value = ErrorMessage(
                            throwable.userMessage("Failed to load teams and participants."),
                        )
                    }
                    .getOrElse { selectedEvent.value }
                if (requestToken != eventDetailHydrationToken) return@launch

                val occurrence = currentWeeklyOccurrenceSelection()
                eventRepository.syncEventParticipants(
                    event = refreshedEvent,
                    occurrence = occurrence,
                ).onSuccess { result ->
                    if (requestToken != eventDetailHydrationToken) return@onSuccess
                    applyParticipantSyncResult(result)
                    weeklyOccurrenceCoordinator.applySelectedOccurrenceParticipantSummary(
                        occurrence = occurrence.takeIf { isWeeklyParentEvent(result.event) },
                        weeklySelectionRequired = result.weeklySelectionRequired,
                        participantCount = result.participantCount,
                        participantCapacity = result.participantCapacity,
                    )
                    refreshParticipantManagementSnapshotIfNeeded(result.event)
                    refreshParticipantComplianceIfNeeded(result.event)
                }.onFailure { throwable ->
                    if (requestToken != eventDetailHydrationToken) return@onFailure
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Failed to load teams and participants."),
                    )
                }

                participantManagementCoordinator.setEventTeamsAndParticipantsLoading(false)

                matchRepository.getMatchesOfTournament(eventId).onFailure { throwable ->
                    if (requestToken != eventDetailHydrationToken) return@onFailure
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Failed to load schedule matches."),
                    )
                }

                if (showDetailsOnSuccess && requestToken == eventDetailHydrationToken) {
                    _showDetails.value = true
                }
            } finally {
                if (requestToken == eventDetailHydrationToken) {
                    participantManagementCoordinator.setEventTeamsAndParticipantsLoading(false)
                    _eventMatchesLoading.value = false
                }
            }
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
        val normalizedQuery = normalizedInviteSearchQuery(query)
        if (normalizedQuery == null) {
            eventInviteCoordinator.clearSuggestedUsers()
            return
        }

        scope.launch {
            eventInviteCoordinator.replaceSuggestedUsers(
                userRepository.searchPlayers(normalizedQuery)
                    .getOrElse { error ->
                        _errorState.value = ErrorMessage(error.userMessage("Unable to search users."))
                        emptyList()
                    },
            )
        }
    }

    override fun searchInviteTeams(query: String) {
        val normalizedQuery = normalizedInviteSearchQuery(query, minLength = 2)
        if (normalizedQuery == null) {
            eventInviteCoordinator.clearInviteTeamSearch()
            return
        }
        val event = selectedEvent.value
        if (!event.teamSignup) {
            eventInviteCoordinator.clearInviteTeamSearch()
            return
        }

        scope.launch {
            eventInviteCoordinator.startInviteTeamSearch()
            teamRepository.searchTeamsForEventInvite(
                query = normalizedQuery,
                eventId = event.id,
                organizationId = currentInviteOrganizationId(event),
                sportName = currentInviteSportName(event),
                excludeTeamIds = eventParticipantTeamIdsForInviteSearch(event),
            ).onSuccess { teams ->
                eventInviteCoordinator.finishInviteTeamSearch(teams)
            }.onFailure { error ->
                eventInviteCoordinator.failInviteTeamSearch()
                _errorState.value = ErrorMessage(error.userMessage("Unable to search teams."))
            }
        }
    }

    override fun inviteTeamToEvent(team: Team) {
        scope.launch {
            val event = selectedEvent.value
            val preflight = inviteTeamToEventPreflight(
                team = team,
                event = event,
                existingTeamIds = eventParticipantTeamIdsForInviteSearch(event),
            )
            if (!preflight.isAccepted) {
                _errorState.value = ErrorMessage(preflight.errorMessage ?: "Unable to add team.")
                return@launch
            }
            val normalizedTeamId = preflight.normalizedId
            val occurrence = if (isWeeklyParentEvent(event)) {
                requireSelectedWeeklyOccurrence(
                    event = event,
                    errorMessage = "Select an occurrence before inviting a team.",
                ) ?: return@launch
            } else {
                null
            }

            loadingHandler.showLoading("Adding team...")
            eventRepository.addTeamToEvent(
                event = event,
                team = team,
                preferredDivisionId = selectedDivision.value,
                occurrence = occurrence,
            ).onSuccess {
                refreshEventAfterParticipantMutation(
                    eventId = event.id,
                    warningMessage = "Failed to refresh event after adding team participant.",
                )
                eventInviteCoordinator.removeInviteTeamSuggestion(normalizedTeamId)
                _errorState.value = ErrorMessage("${team.name.ifBlank { "Team" }} added to the event.")
            }.onFailure { error ->
                _errorState.value = ErrorMessage(error.userMessage("Unable to add team."))
            }
            loadingHandler.hideLoading()
        }
    }

    override fun invitePlayerToEvent(user: UserData) {
        scope.launch {
            val event = selectedEvent.value
            val preflight = invitePlayerToEventPreflight(
                user = user,
                event = event,
                existingUserIds = eventParticipantUserIdsForInviteSearch(event),
            )
            if (!preflight.isAccepted) {
                _errorState.value = ErrorMessage(preflight.errorMessage ?: "Unable to add player.")
                return@launch
            }
            val normalizedUserId = preflight.normalizedId
            val occurrence = if (isWeeklyParentEvent(event)) {
                requireSelectedWeeklyOccurrence(
                    event = event,
                    errorMessage = "Select an occurrence before inviting a player.",
                ) ?: return@launch
            } else {
                null
            }

            loadingHandler.showLoading("Adding player...")
            eventRepository.addPlayerToEvent(
                event = event,
                player = user,
                preferredDivisionId = selectedDivision.value,
                occurrence = occurrence,
            ).onSuccess {
                refreshEventAfterParticipantMutation(
                    eventId = event.id,
                    warningMessage = "Failed to refresh event after adding player participant.",
                )
                eventInviteCoordinator.removeSuggestedUser(normalizedUserId)
                _errorState.value = ErrorMessage("${user.fullName.ifBlank { "Player" }} added to the event.")
            }.onFailure { error ->
                _errorState.value = ErrorMessage(error.userMessage("Unable to add player."))
            }
            loadingHandler.hideLoading()
        }
    }

    override fun invitePlayerToEventByEmail(firstName: String, lastName: String, email: String) {
        val normalizedFirstName = firstName.trim()
        val normalizedLastName = lastName.trim()
        val normalizedEmail = email.trim().lowercase()
        if (normalizedFirstName.isBlank() || normalizedLastName.isBlank() || !normalizedEmail.matches(emailAddressRegex)) {
            _errorState.value = ErrorMessage("Enter first name, last name, and a valid email.")
            return
        }

        scope.launch {
            val event = selectedEvent.value
            if (event.teamSignup) {
                _errorState.value = ErrorMessage("This event accepts teams, not individual players.")
                return@launch
            }

            loadingHandler.showLoading("Sending invite...")
            createEventPlayerInvite(
                event = event,
                userId = null,
                email = normalizedEmail,
                firstName = normalizedFirstName,
                lastName = normalizedLastName,
            ).onSuccess {
                _errorState.value = ErrorMessage("Event invite sent to $normalizedEmail.")
            }.onFailure { error ->
                _errorState.value = ErrorMessage(error.userMessage("Unable to invite player by email."))
            }
            loadingHandler.hideLoading()
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
            loadingHandler.showLoading("Saving event...")
            runCatching {
                val previouslyAssignedStaffUserIds = buildSet {
                    addAll(
                        selectedEvent.value.officialIds
                            .map(String::trim)
                            .filter(String::isNotBlank),
                    )
                    addAll(
                        selectedEvent.value.assistantHostIds
                            .map(String::trim)
                            .filter(String::isNotBlank),
                    )
                }
                val prepared = prepareEventForUpdate()
                val updated = eventRepository.updateEvent(
                    newEvent = prepared.event,
                    fields = prepared.fields,
                    timeSlots = prepared.timeSlots,
                    leagueScoringConfig = prepared.leagueScoringConfig,
                ).getOrThrow()
                val saveOutcome = reconcileEventStaffInvites(
                    userRepository = userRepository,
                    event = updated,
                    pendingStaffInvites = eventInviteCoordinator.pendingStaffInvites.value,
                    existingStaffInvites = _eventStaffInvites.value,
                    previouslyAssignedUserIds = previouslyAssignedStaffUserIds,
                    createdByUserId = currentUser.value.id,
                ).getOrThrow()
                val finalEvent = if (saveOutcome.event == updated) {
                    updated
                } else {
                    eventRepository.updateEvent(saveOutcome.event).getOrThrow()
                }
                _eventStaffInvites.value = saveOutcome.staffInvites
                eventInviteCoordinator.clearPendingStaffInvites()
                eventInviteCoordinator.clearSuggestedUsers()
                if (finalEvent.eventType == EventType.LEAGUE || finalEvent.eventType == EventType.TOURNAMENT) {
                    matchRepository.getMatchesOfTournament(finalEvent.id)
                }
                finalEvent
            }.onSuccess {
                loadingHandler.hideLoading()
                cancelEditingEvent()
            }.onFailure { error ->
                loadingHandler.hideLoading()
                _errorState.value = ErrorMessage(error.userMessage("Unable to save event."))
            }
        }
    }

    override fun rescheduleEvent() {
        scope.launch {
            loadingHandler.showLoading("Rescheduling event...")
            var shouldExitEditMode = false
            runCatching {
                val prepared = prepareEventForUpdate()
                logPreparedFieldOwnership("reschedule", prepared)
                val updated = eventRepository.updateEvent(
                    newEvent = prepared.event,
                    fields = prepared.fields,
                    timeSlots = prepared.timeSlots,
                    leagueScoringConfig = prepared.leagueScoringConfig,
                ).getOrThrow()
                val scheduledEvent = eventRepository.scheduleEvent(updated.id).getOrThrow()
                matchRepository.getMatchesOfTournament(updated.id).getOrThrow()
                refreshLeagueStandingsAfterSchedule(scheduledEvent)
                shouldExitEditMode = true
            }.onFailure { throwable ->
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to reschedule event."),
                )
            }
            loadingHandler.hideLoading()
            if (shouldExitEditMode) {
                cancelEditingEvent()
                _errorState.value = ErrorMessage("Event rescheduled.")
            }
        }
    }

    override fun buildBrackets() {
        scope.launch {
            loadingHandler.showLoading("Building bracket(s)...")
            var shouldExitEditMode = false
            runCatching {
                val prepared = prepareEventForUpdate()
                logPreparedFieldOwnership("build_brackets", prepared)
                val updated = eventRepository.updateEvent(
                    newEvent = prepared.event,
                    fields = prepared.fields,
                    timeSlots = prepared.timeSlots,
                    leagueScoringConfig = prepared.leagueScoringConfig,
                ).getOrThrow()
                val participantCount = updated.maxParticipants.takeIf { maxParticipants ->
                    maxParticipants > 0
                }
                matchRepository.deleteMatchesOfTournament(updated.id).getOrThrow()
                val scheduledEvent = eventRepository.scheduleEvent(updated.id, participantCount).getOrThrow()

                val scheduledMatches = matchRepository.getMatchesOfTournament(updated.id).getOrThrow()
                val bracketMatches = scheduledMatches.filter { match ->
                    shouldResetBracketMatch(updated, match)
                }
                if (bracketMatches.isNotEmpty()) {
                    matchRepository.updateMatchesBulk(
                        bracketMatches.map { match -> match.toEmptyBracketMatch() },
                    ).getOrThrow()
                }

                matchRepository.getMatchesOfTournament(updated.id).getOrThrow()
                refreshLeagueStandingsAfterSchedule(scheduledEvent)
                shouldExitEditMode = true
            }.onFailure { throwable ->
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to build bracket(s)."),
                )
            }
            loadingHandler.hideLoading()
            if (shouldExitEditMode) {
                cancelEditingEvent()
                _errorState.value = ErrorMessage("Bracket build completed.")
            }
        }
    }

    override fun rebuildWithoutPlaceholderTeams() {
        scope.launch {
            loadingHandler.showLoading("Rebuilding without placeholder teams...")
            var shouldExitEditMode = false
            runCatching {
                val prepared = prepareEventForUpdate()
                logPreparedFieldOwnership("rebuild_without_placeholders", prepared)
                val updated = eventRepository.updateEvent(
                    newEvent = prepared.event,
                    fields = prepared.fields,
                    timeSlots = prepared.timeSlots,
                    leagueScoringConfig = prepared.leagueScoringConfig,
                ).getOrThrow()
                matchRepository.deleteMatchesOfTournament(updated.id).getOrThrow()
                val scheduledEvent = eventRepository.scheduleEvent(
                    eventId = updated.id,
                    includePlaceholderTeams = false,
                ).getOrThrow()

                val scheduledMatches = matchRepository.getMatchesOfTournament(updated.id).getOrThrow()
                val bracketMatches = scheduledMatches.filter { match ->
                    shouldResetBracketMatch(updated, match)
                }
                if (bracketMatches.isNotEmpty()) {
                    matchRepository.updateMatchesBulk(
                        bracketMatches.map { match -> match.toEmptyBracketMatch() },
                    ).getOrThrow()
                }

                matchRepository.getMatchesOfTournament(updated.id).getOrThrow()
                refreshLeagueStandingsAfterSchedule(scheduledEvent)
                shouldExitEditMode = true
            }.onFailure { throwable ->
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to rebuild without placeholder teams."),
                )
            }
            loadingHandler.hideLoading()
            if (shouldExitEditMode) {
                cancelEditingEvent()
                _errorState.value = ErrorMessage("Schedule rebuilt without placeholder teams.")
            }
        }
    }

    override fun createTemplateFromCurrentEvent() {
        scope.launch {
            val sourceEvent = if (editDraftCoordinator.isEditing.value) editDraftCoordinator.editedEvent.value else selectedEvent.value
            if (sourceEvent.state.equals("TEMPLATE", ignoreCase = true)) {
                _errorState.value = ErrorMessage("This event is already a template.")
                return@launch
            }

            loadingHandler.showLoading("Creating template ...")

            val templatePayload = EventTemplateCreateBuilder.prepare(
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
            eventRepository.createEvent(
                newEvent = templatePayload.event,
                requiredTemplateIds = emptyList(),
                leagueScoringConfig = templatePayload.leagueScoringConfig,
                fields = templatePayload.fields,
                timeSlots = templatePayload.timeSlots,
            )
                .onSuccess {
                    _errorState.value = ErrorMessage("Template created and added to your templates.")
                }
                .onFailure {
                    _errorState.value = ErrorMessage(it.userMessage("Failed to create template."))
                }

            loadingHandler.hideLoading()
        }
    }

    override fun publishEvent() {
        scope.launch {
            val currentEvent = selectedEvent.value
            if (currentEvent.state == "PUBLISHED") {
                return@launch
            }
            loadingHandler.showLoading("Publishing event...")
            eventRepository.updateEvent(currentEvent.copy(state = "PUBLISHED"))
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.userMessage("Failed to publish event."))
                }
            eventRepository.getEvent(currentEvent.id)
            loadingHandler.hideLoading()
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
        val normalizedDivisionId = divisionId.normalizeDivisionIdentifier().takeIf(String::isNotBlank)
        if (normalizedDivisionId == null) {
            _errorState.value = ErrorMessage("Select a division before moving the team.")
            return
        }
        val currentDivision = team.team.division.normalizeDivisionIdentifier()
        if (currentDivision == normalizedDivisionId) {
            return
        }

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
            val eventTeamId = team.team.id.trim().takeIf(String::isNotBlank)
                ?: team.team.parentTeamId?.trim()?.takeIf(String::isNotBlank)
            if (eventTeamId == null) {
                _errorState.value = ErrorMessage("Team id is required.")
                return@launch
            }
            val sourceEventTeam = team.team.copy(id = eventTeamId)

            loadingHandler.showLoading("Moving team...")
            eventRepository.moveTeamParticipantDivision(
                event = event,
                team = sourceEventTeam,
                preferredDivisionId = normalizedDivisionId,
                occurrence = weeklyOccurrence,
            )
                .onSuccess { result ->
                    applyParticipantSyncResult(result)
                    selectDivision(normalizedDivisionId)
                    refreshSelectedWeeklyOccurrenceSummaryIfNeeded(result.event)
                    refreshParticipantManagementSnapshotIfNeeded(result.event)
                    refreshParticipantComplianceIfNeeded(result.event)
                    _errorState.value = ErrorMessage("${team.team.name.ifBlank { "Team" }} moved to a new division.")
                }
                .onFailure { throwable ->
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Failed to move team division."),
                    )
                }
            loadingHandler.hideLoading()
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
            loadingHandler.showLoading("Removing team...")
            eventRepository.removeTeamFromEvent(event, team, occurrence = weeklyOccurrence)
                .onSuccess {
                    refreshEventAfterParticipantMutation(
                        eventId = event.id,
                        warningMessage = "Failed to refresh event after removing team participant.",
                    )
                }
                .onFailure { throwable ->
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Failed to remove team participant."),
                    )
                }
            loadingHandler.hideLoading()
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
            val preflight = removeUserParticipantPreflight(userId)
            if (!preflight.isAccepted) {
                _errorState.value = ErrorMessage(preflight.errorMessage ?: "Failed to remove participant.")
                return@launch
            }
            val normalizedUserId = preflight.normalizedId
            loadingHandler.showLoading("Removing participant...")
            eventRepository.removeCurrentUserFromEvent(
                event,
                targetUserId = normalizedUserId,
                occurrence = weeklyOccurrence,
            )
                .onSuccess {
                    refreshEventAfterParticipantMutation(
                        eventId = event.id,
                        warningMessage = "Failed to refresh event after removing participant.",
                    )
                }
                .onFailure { throwable ->
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Failed to remove participant."),
                    )
                }
            loadingHandler.hideLoading()
        }
    }

    override suspend fun getParticipantBillingSnapshot(teamId: String): Result<EventTeamBillingSnapshot> {
        val normalizedEventId = selectedEvent.value.id.trim()
        val normalizedTeamId = teamId.trim()
        if (normalizedEventId.isEmpty() || normalizedTeamId.isEmpty()) {
            return Result.failure(
                IllegalArgumentException("Event and participant team ids are required."),
            )
        }
        return billingRepository.getEventTeamBillingSnapshot(
            eventId = normalizedEventId,
            teamId = normalizedTeamId,
        )
    }

    override suspend fun createParticipantBill(
        teamId: String,
        request: EventTeamBillCreateRequest,
    ): Result<Unit> {
        val normalizedEventId = selectedEvent.value.id.trim()
        val normalizedTeamId = teamId.trim()
        if (normalizedEventId.isEmpty() || normalizedTeamId.isEmpty()) {
            return Result.failure(
                IllegalArgumentException("Event and participant team ids are required."),
            )
        }
        val result = billingRepository.createEventTeamBill(
            eventId = normalizedEventId,
            teamId = normalizedTeamId,
            request = request,
        ).map { }
        if (result.isSuccess) {
            refreshParticipantComplianceIfNeeded(selectedEvent.value)
        }
        return result
    }

    override suspend fun createParticipantPaymentCheckout(
        teamId: String,
        request: EventTeamPaymentCheckoutRequest,
    ): Result<EventTeamPaymentCheckout> {
        val normalizedEventId = selectedEvent.value.id.trim()
        val normalizedTeamId = teamId.trim()
        if (normalizedEventId.isEmpty() || normalizedTeamId.isEmpty()) {
            return Result.failure(
                IllegalArgumentException("Event and participant team ids are required."),
            )
        }
        return billingRepository.createEventTeamPaymentCheckout(
            eventId = normalizedEventId,
            teamId = normalizedTeamId,
            request = request,
        )
    }

    override suspend fun refundParticipantPayment(
        teamId: String,
        billPaymentId: String,
        amountCents: Int,
    ): Result<Unit> {
        val normalizedEventId = selectedEvent.value.id.trim()
        val normalizedTeamId = teamId.trim()
        if (normalizedEventId.isEmpty() || normalizedTeamId.isEmpty()) {
            return Result.failure(
                IllegalArgumentException("Event and participant team ids are required."),
            )
        }
        val result = billingRepository.refundEventTeamBillPayment(
            eventId = normalizedEventId,
            teamId = normalizedTeamId,
            billPaymentId = billPaymentId,
            amountCents = amountCents,
        )
        if (result.isSuccess) {
            refreshParticipantComplianceIfNeeded(selectedEvent.value)
        }
        return result
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
        val weeklyParentWithoutSelection =
            isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() == null
        if (weeklyParentWithoutSelection) {
            membershipCoordinator.clearForMissingWeeklySelection()
            registrationFlowCoordinator.clearWithdrawTargets()
            return
        }

        val cachedState = resolveCachedCurrentUserRegistrationMembership(event)
        if (cachedState != null) {
            membershipCoordinator.applyCachedMembership(
                membership = cachedState,
                team = cachedState.teamId
                    ?.let { teamId -> teamRepository.getTeamWithPlayers(teamId).getOrNull() },
                currentUserId = currentUser.value.id,
            )
            return
        }

        val teamIds = membershipCoordinator.refreshFromSnapshot(
            event = event,
            currentUserId = currentUser.value.id,
            currentUserTeamIds = currentUserTeamIds(),
        )
        if (teamIds.isNotEmpty()) {
            membershipCoordinator.setUsersTeam(
                teamIds.firstNotNullOfOrNull { teamId ->
                    teamRepository.getTeamWithPlayers(teamId).getOrNull()
                },
                currentUser.value.id,
            )
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
        val targets = LinkedHashMap<String, WithdrawTargetOption>()

        resolveWithdrawTargetMembership(event, current.id)?.let { membership ->
            targets[current.id] = WithdrawTargetOption(
                userId = current.id,
                fullName = current.fullName.ifBlank { "My Registration" },
                membership = membership,
                isSelf = true,
            )
        }

        val children = userRepository.listChildren()
            .onFailure { throwable ->
                Napier.w("Failed to load linked children for withdraw targets.", throwable)
            }
            .getOrElse { emptyList() }
            .filter { child ->
                child.userId.isNotBlank() &&
                    (child.linkStatus?.equals("active", ignoreCase = true) != false)
            }

        children.forEach { child ->
            val childId = child.userId
            val membership = resolveWithdrawTargetMembership(event, childId) ?: return@forEach
            val fullName = listOf(child.firstName.trim(), child.lastName.trim())
                .filter { it.isNotBlank() }
                .joinToString(" ")
                .ifBlank { "Child" }
            targets[childId] = WithdrawTargetOption(
                userId = childId,
                fullName = fullName,
                membership = membership,
                isSelf = false,
            )
        }

        registrationFlowCoordinator.replaceWithdrawTargets(targets.values.toList())
    }

    private fun resolveWithdrawTargetMembership(
        event: Event,
        userId: String,
    ): WithdrawTargetMembership? {
        return resolveWithdrawTargetMembershipFromEvent(
            event = event,
            targetUserId = userId,
            currentUserId = currentUser.value.id,
            currentUserTeamIds = currentUserTeamIds(),
            currentUserMembership = if (userId == currentUser.value.id) {
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

    private fun checkEventIsFull(
        event: Event,
        teams: List<TeamWithPlayers>,
        preferredDivisionId: String?,
    ): Boolean {
        val selectedDivision = resolveSelectedDivisionDetail(event, preferredDivisionId)
        val maxParticipants = if (event.divisions.isEmpty()) {
            event.maxParticipants.takeIf { value -> value > 0 }
        } else {
            selectedDivision?.maxParticipants
        }

        if (maxParticipants == null || maxParticipants <= 0) {
            return false
        }

        val participantCount = if (event.teamSignup) {
            countTeamSignupParticipantsForCapacity(
                event = event,
                teams = teams,
                selectedDivision = selectedDivision,
            )
        } else {
            event.playerIds.size
        }

        return participantCount >= maxParticipants
    }

    override fun showFeeBreakdown(
        feeBreakdown: FeeBreakdown, onConfirm: () -> Unit, onCancel: () -> Unit
    ) {
        registrationFlowCoordinator.showFeeBreakdown(
            feeBreakdown = feeBreakdown,
            onConfirm = onConfirm,
        )
    }

    override fun dismissFeeBreakdown() {
        registrationFlowCoordinator.dismissFeeBreakdown()
    }

    override fun confirmFeeBreakdown() {
        registrationFlowCoordinator.confirmFeeBreakdown()?.invoke()
    }

    override fun dismissPaymentPlanPreviewDialog() {
        registrationFlowCoordinator.dismissPaymentPlanPreviewDialog()
    }

    override fun confirmPaymentPlanPreviewDialog() {
        registrationFlowCoordinator.confirmPaymentPlanPreviewDialog()?.invoke()
    }

    override fun confirmTextSignature() {
        val prompt = registrationFlowCoordinator.textSignaturePrompt.value ?: return

        scope.launch {
            loadingHandler.showLoading("Recording signature ...")

            val documentId = prompt.step.resolvedDocumentId()
                ?: "mobile-text-${prompt.step.templateId}-${Clock.System.now().toEpochMilliseconds()}"

            val signatureTarget = registrationFlowCoordinator.currentSignatureRecordingTarget()
            val recordSignatureResult = signatureTarget.teamId?.let { teamId ->
                billingRepository.recordTeamSignature(
                    teamId = teamId,
                    templateId = prompt.step.templateId,
                    documentId = documentId,
                    type = prompt.step.type,
                    signerContext = signatureTarget.signerContext,
                    childUserId = signatureTarget.child?.userId,
                )
            } ?: billingRepository.recordSignature(
                eventId = selectedEvent.value.id,
                templateId = prompt.step.templateId,
                documentId = documentId,
                type = prompt.step.type,
            )

            recordSignatureResult.onFailure { throwable ->
                Napier.e("Failed to record signature.", throwable)
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to record signature.")
                )
            }.onSuccess {
                registrationFlowCoordinator.clearTextSignaturePrompt()
                if (awaitSignatureStepClearance(prompt.step)) {
                    processNextSignatureStep()
                }
            }

            loadingHandler.hideLoading()
        }
    }

    override fun dismissTextSignature() {
        clearPendingSignatureFlow()
        _errorState.value = ErrorMessage("Document signing canceled.")
    }

    override fun dismissWebSignaturePrompt() {
        clearPendingSignatureFlow()
        _errorState.value = ErrorMessage("Document signing canceled.")
    }

    override fun submitBillingAddress(address: BillingAddressDraft) {
        scope.launch {
            loadingHandler.showLoading("Saving billing address...")
            billingRepository.updateBillingAddress(address)
                .onSuccess {
                    registrationFlowCoordinator.completeBillingAddressPrompt()?.invoke()
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.userMessage("Unable to save billing address."))
                }
            loadingHandler.hideLoading()
        }
    }

    override fun dismissBillingAddressPrompt() {
        registrationFlowCoordinator.dismissBillingAddressPrompt()
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
        if (!canEditMatchesNow()) {
            return null
        }

        return matchEditingCoordinator.createStagedMatch(
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
        if (!canManageMatchEditing()) {
            return
        }
        scope.launch {
            matchEditingCoordinator.beginEditing(
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
            val preparation = matchEditingCoordinator.prepareCommit(
                isTournament = selectedEvent.value.eventType == EventType.TOURNAMENT,
            )
            if (preparation is MatchEditCommitPreparation.Invalid) {
                _errorState.value = ErrorMessage(preparation.errorMessage)
                return@launch
            }
            val payload = (preparation as MatchEditCommitPreparation.Valid).payload

            loadingHandler.showLoading("Updating matches...")

            try {
                matchRepository.updateMatchesBulk(payload.updates, payload.creates, payload.deletes).getOrThrow()
                matchEditingCoordinator.finishCommitSuccess()
                loadingHandler.hideLoading()
            } catch (e: Exception) {
                _errorState.value = ErrorMessage(e.userMessage("Failed to update matches"))
                loadingHandler.hideLoading()
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
        if (!canEditMatchesNow()) return
        if (matchIds.isEmpty()) return
        val targetIds = matchIds.map(String::trim).filter(String::isNotBlank).toSet()
        if (targetIds.isEmpty()) return

        matchEditingCoordinator.setLockForEditableMatches(
            matchIds = targetIds.toList(),
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
        if (!canEditMatchesNow()) {
            return
        }
        matchEditingCoordinator.addBracketMatchFromAnchor(
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
        if (!canEditMatchesNow()) {
            return
        }
        matchEditingCoordinator.showMatchEditDialog(
            MatchEditDialogState(
                match = match,
                teams = eventWithRelations.value.teams,
                fields = divisionFields.value,
                allMatches = matchEditingCoordinator.availableMatchesForDialog(eventWithRelations.value.matches),
                eventOfficials = selectedEvent.value.eventOfficials,
                officialPositions = selectedEvent.value.officialPositions,
                players = eventWithRelations.value.players,
                eventType = selectedEvent.value.eventType,
                isCreateMode = isCreateMode,
                creationContext = creationContext,
            )
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
        if (!canEditMatchesNow()) {
            return
        }
        matchEditingCoordinator.deleteMatchFromDialog(
            matchId = matchId,
            event = selectedEvent.value,
            selectedDivisionId = selectedDivision.value,
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

    override fun updateMatchFromDialog(updatedMatch: MatchWithRelations) {
        if (!canEditMatchesNow()) {
            return
        }
        matchEditingCoordinator.updateMatchFromDialog(
            updatedMatch = updatedMatch,
            event = selectedEvent.value,
            selectedDivisionId = selectedDivision.value,
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

    private suspend fun refreshUiForJoinConfirmation(
        syncResult: EventParticipantsSyncResult,
        confirmationTarget: JoinConfirmationTarget,
    ) {
        applyParticipantSyncResult(syncResult)
        val currentSelection = currentWeeklyOccurrenceSelection()
        if (!occurrencesMatch(confirmationTarget.occurrence, currentSelection)) {
            return
        }
        refreshCurrentUserMembershipState(syncResult.event)
        confirmationTarget.occurrence?.let { occurrence ->
            if (!syncResult.weeklySelectionRequired) {
                rememberWeeklyOccurrenceSummary(
                    occurrence = occurrence,
                    summary = WeeklyOccurrenceSummary(
                        participantCount = syncResult.participantCount,
                        participantCapacity = syncResult.participantCapacity,
                    ),
                )
            }
        }
    }

    private suspend fun isJoinConfirmationSatisfied(
        confirmationTarget: JoinConfirmationTarget,
    ): Boolean {
        eventRepository.syncCurrentUserRegistrationCache()
            .onFailure { throwable ->
                Napier.w(
                    "Failed to sync current-user registrations while confirming join.",
                    throwable,
                )
            }
        if (cachedCurrentUserRegistrations.value.any { registration ->
                registrationMatchesJoinConfirmationTarget(registration, confirmationTarget)
            }
        ) {
            if (occurrencesMatch(confirmationTarget.occurrence, currentWeeklyOccurrenceSelection())) {
                refreshCurrentUserMembershipState(selectedEvent.value)
            }
            return true
        }

        val refreshedEvent = eventRepository.getEvent(confirmationTarget.eventId)
            .onFailure { throwable ->
                Napier.w(
                    "Failed to refresh event ${confirmationTarget.eventId} while confirming join.",
                    throwable,
                )
            }
            .getOrNull()
            ?: selectedEvent.value

        val syncResult = eventRepository.syncEventParticipants(
            event = refreshedEvent,
            occurrence = confirmationTarget.occurrence,
        ).onFailure { throwable ->
            Napier.w("Failed to sync participants while confirming join.", throwable)
        }.getOrNull() ?: return false

        refreshUiForJoinConfirmation(syncResult, confirmationTarget)
        if (confirmationTarget.registrantType == JoinConfirmationRegistrantType.TEAM) {
            val eventTeams = teamRepository.getTeams(syncResult.event.teamIds)
                .getOrElse { emptyList() }
            if (eventTeams.any { team ->
                    team.id == confirmationTarget.registrantId || team.parentTeamId == confirmationTarget.registrantId
                }) {
                return true
            }
        }
        return eventSnapshotMatchesJoinConfirmationTarget(syncResult.event, confirmationTarget)
    }

    private suspend fun waitForUserInEventWithTimeout(
        confirmationTarget: JoinConfirmationTarget? = registrationFlowCoordinator.currentJoinConfirmationTarget(),
        timeoutS: Duration = 30.seconds,
        checkIntervalS: Duration = 1.seconds,
    ): Boolean {
        if (confirmationTarget == null) {
            val startTime = Clock.System.now()
            while (!membershipCoordinator.isUserInEvent.value) {
                if (Clock.System.now() - startTime > timeoutS) {
                    return false
                }

                try {
                    refreshEventAfterParticipantMutation(
                        eventId = selectedEvent.value.id,
                        warningMessage = "Failed to refresh event while waiting for join confirmation.",
                    )
                    delay(checkIntervalS)
                } catch (_: Exception) {
                    delay(checkIntervalS * 2)
                }
            }
            return true
        }

        val startTime = Clock.System.now()
        while (Clock.System.now() - startTime <= timeoutS) {
            try {
                if (isJoinConfirmationSatisfied(confirmationTarget)) {
                    return true
                }
                delay(checkIntervalS)
            } catch (_: Exception) {
                delay(checkIntervalS * 2)
            }
        }

        return false
    }

    private fun TeamWithPlayers.includesUser(userId: String): Boolean {
        val normalizedUserId = userId.trim()
        if (normalizedUserId.isBlank()) return false
        return team.playerIds.any { playerId -> playerId.trim() == normalizedUserId } ||
            players.any { player -> player.id.trim() == normalizedUserId } ||
            pendingPlayers.any { player -> player.id.trim() == normalizedUserId }
    }

    private suspend fun waitForTeamRegistrationWithTimeout(
        teamId: String,
        timeoutS: Duration = 30.seconds,
        checkIntervalS: Duration = 1.seconds,
    ): Boolean {
        val normalizedTeamId = teamId.trim()
        if (normalizedTeamId.isBlank()) return false

        val startTime = Clock.System.now()
        while (Clock.System.now() - startTime <= timeoutS) {
            val refreshedTeam = teamRepository.getTeamWithPlayers(normalizedTeamId)
                .getOrNull()
            if (refreshedTeam?.includesUser(currentUser.value.id) == true) {
                return true
            }
            delay(checkIntervalS)
        }

        return false
    }

}
