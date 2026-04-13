@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
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
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.hasAnyPaidDivision
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.resolvedDivisionPriceCents
import com.razumly.mvp.core.data.dataTypes.shouldReplaceOfficialPositionsWithSportDefaults
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
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
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.SignerContext
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.LeagueDivisionStandings
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.data.repositories.CreateBillRequest
import com.razumly.mvp.core.data.repositories.EventTeamBillCreateRequest
import com.razumly.mvp.core.data.repositories.EventTeamBillingSnapshot
import com.razumly.mvp.core.data.repositories.EventParticipantRefundMode
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantsSyncResult
import com.razumly.mvp.core.data.repositories.UserVisibilityContext
import com.razumly.mvp.core.data.util.divisionsEquivalent
import com.razumly.mvp.core.data.util.isPlaceholderSlot
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.presentation.PaymentResult
import com.razumly.mvp.core.presentation.util.ShareServiceProvider
import com.razumly.mvp.core.presentation.util.convertPhotoResultToUploadFile
import com.razumly.mvp.core.presentation.util.createEventUrl
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.eventDetail.data.BracketNode
import com.razumly.mvp.eventDetail.data.IMatchRepository
import com.razumly.mvp.eventDetail.data.StagedMatchCreate
import com.razumly.mvp.eventDetail.data.validateAndNormalizeBracketGraph
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import io.github.aakira.napier.Napier
import io.ktor.http.encodeURLQueryComponent
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
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.hours
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
    val eventFields: StateFlow<List<FieldWithMatches>>
    val divisionFields: StateFlow<List<FieldWithMatches>>
    val rounds: StateFlow<List<List<MatchWithRelations?>>>
    val losersBracket: StateFlow<Boolean>
    val showDetails: StateFlow<Boolean>
    val eventTeamsAndParticipantsLoading: StateFlow<Boolean>
    val eventMatchesLoading: StateFlow<Boolean>
    val errorState: StateFlow<ErrorMessage?>
    val eventWithRelations: StateFlow<EventWithFullRelations>
    val currentUser: StateFlow<UserData>
    val scheduleTrackedUserIds: StateFlow<Set<String>>
    val validTeams: StateFlow<List<TeamWithPlayers>>
    val isHost: StateFlow<Boolean>
    val isEditing: StateFlow<Boolean>
    val isUserInEvent: StateFlow<Boolean>
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
    val showTeamSelectionDialog: StateFlow<TeamSelectionDialogState?>
    val showMatchEditDialog: StateFlow<MatchEditDialogState?>
    val joinChoiceDialog: StateFlow<JoinChoiceDialogState?>
    val childJoinSelectionDialog: StateFlow<ChildJoinSelectionDialogState?>
    val paymentPlanPreviewDialog: StateFlow<PaymentPlanPreviewDialogState?>
    val withdrawTargets: StateFlow<List<WithdrawTargetOption>>
    val textSignaturePrompt: StateFlow<TextSignaturePromptState?>
    val webSignaturePrompt: StateFlow<WebSignaturePromptState?>
    val billingAddressPrompt: StateFlow<BillingAddressDraft?>
    val eventImageIds: StateFlow<List<String>>
    val organizationTemplates: StateFlow<List<OrganizationTemplateDocument>>
    val organizationTemplatesLoading: StateFlow<Boolean>
    val organizationTemplatesError: StateFlow<String?>
    val leagueDivisionStandings: StateFlow<LeagueDivisionStandings?>
    val leagueDivisionStandingsLoading: StateFlow<Boolean>
    val leagueStandingsConfirming: StateFlow<Boolean>
    val suggestedUsers: StateFlow<List<UserData>>
    val pendingStaffInvites: StateFlow<List<PendingStaffInviteDraft>>
    val editableLeagueTimeSlots: StateFlow<List<TimeSlot>>
    val editableFields: StateFlow<List<Field>>
    val editableLeagueScoringConfig: StateFlow<LeagueScoringConfigDTO>


    fun onNavigateToChat(user: UserData)
    fun matchSelected(selectedMatch: MatchWithRelations)
    fun showFeeBreakdown(feeBreakdown: FeeBreakdown, onConfirm: () -> Unit, onCancel: () -> Unit)
    fun onHostCreateAccount()
    fun selectDivision(division: String)
    fun setLoadingHandler(loadingHandler: LoadingHandler)
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
    fun createTemplateFromCurrentEvent()
    fun publishEvent()
    fun deleteEvent()
    fun shareEvent()
    fun openEventDirections()
    fun createNewTeam()
    fun inviteFreeAgentToTeam(userId: String)
    fun removeTeamParticipant(team: TeamWithPlayers)
    fun removeUserParticipant(userId: String)
    suspend fun getParticipantBillingSnapshot(teamId: String): Result<EventTeamBillingSnapshot>
    suspend fun createParticipantBill(
        teamId: String,
        request: EventTeamBillCreateRequest,
    ): Result<Unit>
    suspend fun refundParticipantPayment(
        teamId: String,
        billPaymentId: String,
        amountCents: Int,
    ): Result<Unit>
    fun selectPlace(place: MVPPlace?)
    fun onTypeSelected(type: EventType)
    fun selectFieldCount(count: Int)
    fun updateLocalFieldName(index: Int, name: String)
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

data class PaymentPlanPreviewDialogState(
    val ownerLabel: String,
    val totalAmountCents: Int,
    val installmentAmounts: List<Int>,
    val installmentDueDates: List<String>,
    val divisionLabel: String? = null,
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

internal enum class JoinConfirmationRegistrantType {
    SELF,
    TEAM,
}

internal data class JoinConfirmationTarget(
    val eventId: String,
    val registrantType: JoinConfirmationRegistrantType,
    val registrantId: String,
    val occurrence: EventOccurrenceSelection? = null,
)

internal fun weeklyOccurrenceSummaryKey(
    slotId: String?,
    occurrenceDate: String?,
): String? {
    val normalizedSlotId = slotId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedOccurrenceDate = occurrenceDate?.trim()?.takeIf(String::isNotBlank) ?: return null
    return "$normalizedSlotId|$normalizedOccurrenceDate"
}

enum class WithdrawTargetMembership {
    PARTICIPANT,
    WAITLIST,
    FREE_AGENT,
}

data class WithdrawTargetOption(
    val userId: String,
    val fullName: String,
    val membership: WithdrawTargetMembership,
    val isSelf: Boolean,
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

internal fun matchingParticipantTeamId(
    event: Event,
    currentUserTeamIds: Set<String>,
): String? {
    if (!event.teamSignup || currentUserTeamIds.isEmpty()) {
        return null
    }
    return event.teamIds
        .asSequence()
        .map(String::trim)
        .filter(String::isNotBlank)
        .firstOrNull { teamId -> currentUserTeamIds.contains(teamId) }
}

internal fun isUserParticipantInEventSnapshot(
    event: Event,
    currentUserId: String,
    currentUserTeamIds: Set<String>,
): Boolean {
    val normalizedUserId = currentUserId.trim()
    if (normalizedUserId.isNotBlank() && event.playerIds.any { playerId -> playerId == normalizedUserId }) {
        return true
    }
    return matchingParticipantTeamId(event, currentUserTeamIds) != null
}

internal fun registrationMatchesJoinConfirmationTarget(
    registration: EventRegistrationCacheEntry,
    target: JoinConfirmationTarget,
): Boolean {
    if (registration.eventId != target.eventId || !registration.isActiveForMembership()) {
        return false
    }
    if (registration.normalizedRosterRole() != "PARTICIPANT") {
        return false
    }
    if (registration.registrantId != target.registrantId) {
        return false
    }
    val expectedRegistrantType = target.registrantType.name
    if (!registration.registrantType.trim().equals(expectedRegistrantType, ignoreCase = true)) {
        return false
    }
    return if (target.occurrence != null) {
        registration.slotId == target.occurrence.slotId &&
            registration.occurrenceDate == target.occurrence.occurrenceDate
    } else {
        registration.slotId.isNullOrBlank() && registration.occurrenceDate.isNullOrBlank()
    }
}

internal fun eventSnapshotMatchesJoinConfirmationTarget(
    event: Event,
    target: JoinConfirmationTarget,
): Boolean {
    val registrantId = target.registrantId.trim()
    if (registrantId.isBlank()) {
        return false
    }
    return when (target.registrantType) {
        JoinConfirmationRegistrantType.SELF -> event.playerIds.any { playerId ->
            playerId.trim() == registrantId
        }

        JoinConfirmationRegistrantType.TEAM -> event.teamIds.any { teamId ->
            teamId.trim() == registrantId
        }
    }
}

private fun EventRegistrationCacheEntry.normalizedRosterRole(): String =
    rosterRole?.trim()?.uppercase().orEmpty()

private fun EventRegistrationCacheEntry.normalizedStatus(): String =
    status?.trim()?.uppercase().orEmpty()

private fun EventRegistrationCacheEntry.isCancelledLike(): Boolean =
    normalizedStatus() == "CANCELLED"

private fun EventRegistrationCacheEntry.isActiveForMembership(): Boolean =
    !isCancelledLike() && normalizedStatus() != "CONSENTFAILED"

private data class CurrentUserRegistrationMembershipState(
    val participant: Boolean = false,
    val waitlist: Boolean = false,
    val freeAgent: Boolean = false,
    val teamId: String? = null,
)

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
    private val notificationsRepository: IPushNotificationsRepository,
    private val billingRepository: IBillingRepository,
    private val eventRepository: IEventRepository,
    private val matchRepository: IMatchRepository,
    private val teamRepository: ITeamRepository,
    private val sportsRepository: ISportsRepository,
    private val imageRepository: IImagesRepository,
    private val navigationHandler: INavigationHandler,

) : EventDetailComponent, PaymentProcessor(), ComponentContext by componentContext {
    private companion object {
        const val CLIENT_MATCH_PREFIX = "client:"
        const val LOCAL_PLACEHOLDER_PREFIX = "placeholder-local:"
    }

    private fun canEditEventDetails(targetEvent: Event): Boolean {
        return targetEvent.organizationId.isNullOrBlank() ||
            targetEvent.state.equals("TEMPLATE", ignoreCase = true)
    }

    private fun canManageMatchEditing(): Boolean {
        val currentUserId = currentUser.value.id.trim()
        if (currentUserId.isBlank()) {
            return false
        }
        val targetEvent = selectedEvent.value
        if (targetEvent.hostId == currentUserId) {
            return true
        }
        if (targetEvent.assistantHostIds.any { assistantHostId -> assistantHostId == currentUserId }) {
            return true
        }
        val organization = eventWithRelations.value.organization
        return organization?.ownerId == currentUserId ||
            organization?.hostIds?.any { hostId -> hostId == currentUserId } == true
    }

    private fun canEditMatchesNow(): Boolean = _isEditingMatches.value && canManageMatchEditing()

    private fun normalizeToken(value: String?): String? =
        value?.trim()?.takeIf(String::isNotBlank)

    private fun Event.playoffPlacementDivisionIdsNormalized(): Set<String> {
        val mappedPlayoffIds = divisionDetails
            .flatMap { detail -> detail.playoffPlacementDivisionIds }
            .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
            .filter(String::isNotBlank)
            .toMutableSet()

        divisionDetails
            .filter { detail -> detail.kind?.trim()?.equals("PLAYOFF", ignoreCase = true) == true }
            .map { detail -> detail.id.normalizeDivisionIdentifier() }
            .filter(String::isNotBlank)
            .forEach { divisionId -> mappedPlayoffIds += divisionId }

        return mappedPlayoffIds
    }

    private fun Event.isPlayoffPlacementDivision(divisionId: String?): Boolean {
        val normalizedDivisionId = divisionId
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
            ?: return false
        return normalizedDivisionId in playoffPlacementDivisionIdsNormalized()
    }

    private fun Event.resolveDefaultSelectedDivisionId(): String? {
        val normalizedDivisions = divisions
            .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
            .filter(String::isNotBlank)
        if (normalizedDivisions.isEmpty()) return null
        if (eventType != EventType.LEAGUE) return normalizedDivisions.firstOrNull()

        val playoffIds = playoffPlacementDivisionIdsNormalized()
        return normalizedDivisions.firstOrNull { divisionId -> divisionId !in playoffIds }
            ?: normalizedDivisions.firstOrNull()
    }

    private fun isClientMatchId(value: String?): Boolean =
        normalizeToken(value)?.startsWith(CLIENT_MATCH_PREFIX) == true

    private fun extractClientId(matchId: String): String =
        matchId.removePrefix(CLIENT_MATCH_PREFIX)

    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())
    override val currentUser = userRepository.currentUser.map { it.getOrNull() ?: UserData() }
        .stateIn(scope, SharingStarted.Eagerly, UserData())

    private val _currentAccount = userRepository.currentAccount.map { result ->
        result.getOrElse {
            userRepository.getCurrentAccount()
            AuthAccount.empty()
        }
    }.stateIn(scope, SharingStarted.Eagerly, AuthAccount.empty())
    private val _suggestedUsers = MutableStateFlow<List<UserData>>(emptyList())
    override val suggestedUsers = _suggestedUsers.asStateFlow()
    private val _pendingStaffInvites = MutableStateFlow<List<PendingStaffInviteDraft>>(emptyList())
    override val pendingStaffInvites = _pendingStaffInvites.asStateFlow()
    private val _eventStaffInvites = MutableStateFlow<List<Invite>>(emptyList())

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()
    private val _billingAddressPrompt = MutableStateFlow<BillingAddressDraft?>(null)
    override val billingAddressPrompt = _billingAddressPrompt.asStateFlow()

    private lateinit var loadingHandler: LoadingHandler

    override fun setLoadingHandler(loadingHandler: LoadingHandler) {
        this.loadingHandler = loadingHandler
    }

    private val _editedEvent = MutableStateFlow(event)
    override var editedEvent = _editedEvent.asStateFlow()

    private val _isEditing = MutableStateFlow(
        event.state.equals("TEMPLATE", ignoreCase = true) && canEditEventDetails(event)
    )
    override var isEditing = _isEditing.asStateFlow()

    private val _fieldCount = MutableStateFlow(0)
    private val _editableLeagueTimeSlots = MutableStateFlow<List<TimeSlot>>(emptyList())
    override val editableLeagueTimeSlots = _editableLeagueTimeSlots.asStateFlow()
    private val _editableFields = MutableStateFlow<List<Field>>(emptyList())
    override val editableFields = _editableFields.asStateFlow()
    private val _editableLeagueScoringConfig = MutableStateFlow(LeagueScoringConfigDTO())
    override val editableLeagueScoringConfig = _editableLeagueScoringConfig.asStateFlow()

    override val backCallback = BackCallback {
        if (isEditing.value) {
            _isEditing.value = false
        } else if (showDetails.value) {
            _showDetails.value = false
        } else {
            navigationHandler.navigateBack()
        }
    }

    override val eventImageIds =
        imageRepository.getUserImageIdsFlow().stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _organizationTemplates = MutableStateFlow<List<OrganizationTemplateDocument>>(emptyList())
    override val organizationTemplates = _organizationTemplates.asStateFlow()

    private val _organizationTemplatesLoading = MutableStateFlow(false)
    override val organizationTemplatesLoading = _organizationTemplatesLoading.asStateFlow()

    private val _organizationTemplatesError = MutableStateFlow<String?>(null)
    override val organizationTemplatesError = _organizationTemplatesError.asStateFlow()

    private val _leagueDivisionStandings = MutableStateFlow<LeagueDivisionStandings?>(null)
    override val leagueDivisionStandings = _leagueDivisionStandings.asStateFlow()

    private val _leagueDivisionStandingsLoading = MutableStateFlow(false)
    override val leagueDivisionStandingsLoading = _leagueDivisionStandingsLoading.asStateFlow()

    private val _leagueStandingsConfirming = MutableStateFlow(false)
    override val leagueStandingsConfirming = _leagueStandingsConfirming.asStateFlow()

    private val eventRelations: StateFlow<EventWithRelations> =
        eventRepository.getEventWithRelationsFlow(event.id).map { result ->
            result.getOrElse {
                _errorState.value = ErrorMessage(it.userMessage())
                EventWithRelations(event, null)
            }
        }.stateIn(
            scope,
            SharingStarted.Eagerly,
            EventWithRelations(event, null)
        )

    private val _sports = MutableStateFlow<List<Sport>>(emptyList())
    override val sports = _sports.asStateFlow()

    override val selectedEvent: StateFlow<Event> =
        eventRelations.map { it.event }.stateIn(scope, SharingStarted.Eagerly, event)

    override val isHost = selectedEvent.map { it.hostId == currentUser.value.id }
        .stateIn(scope, SharingStarted.Eagerly, false)

    private val eventTimeSlots: StateFlow<List<TimeSlot>> = selectedEvent.flatMapLatest { selected ->
        val slotIds = selected.timeSlotIds
            .map { slotId -> slotId.trim() }
            .filter(String::isNotBlank)
            .distinct()
        if (slotIds.isEmpty()) {
            flowOf(emptyList())
        } else {
            flow {
                val slots = fieldRepository.getTimeSlots(slotIds)
                    .onFailure { error ->
                        Napier.w("Failed to refresh time slots for event ${selected.id}: ${error.message}")
                    }
                    .getOrElse { emptyList() }
                emit(slots)
            }
        }
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val eventLeagueScoringConfig: StateFlow<LeagueScoringConfig?> = eventRelations
        .map { relations ->
            relations.event.id to relations.event.leagueScoringConfigId
                .orEmpty()
                .trim()
        }
        .distinctUntilChanged()
        .flatMapLatest { (eventId, scoringConfigId) ->
            if (scoringConfigId.isBlank()) {
                flowOf<LeagueScoringConfig?>(null)
            } else {
                flowOf(
                    eventRepository.getLeagueScoringConfig(eventId)
                        .onFailure { error ->
                            Napier.w(
                                "Failed to load league scoring config for event $eventId: ${error.message}"
                            )
                        }
                        .getOrNull()
                )
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, null)

    override val eventWithRelations = eventRelations.flatMapLatest { relations ->
        val hostFallbackFlow = if (relations.host != null || relations.event.hostId.isBlank()) {
            flowOf(relations.host)
        } else {
            userRepository.getUsersFlow(
                userIds = listOf(relations.event.hostId),
                visibilityContext = UserVisibilityContext(eventId = relations.event.id),
            ).map { result ->
                result.getOrElse { emptyList() }.firstOrNull()
            }
        }
        val relationTeamIds = relations.teams
            .map { team -> team.id.trim() }
            .filter(String::isNotBlank)
            .distinct()
        combine(
            matchRepository.getMatchesOfTournamentFlow(relations.event.id).map { result ->
                result.getOrElse {
                    _errorState.value =
                        ErrorMessage("Error loading matches: ${it.userMessage()}"); emptyList()
                }
            },
            if (relationTeamIds.isEmpty()) {
                flowOf(emptyList())
            } else {
                teamRepository.getTeamsFlow(relationTeamIds).map { result ->
                    result.getOrElse {
                        _errorState.value =
                            ErrorMessage("Failed to load teams: ${it.userMessage()}"); emptyList()
                    }
                }
            },
            _sports,
            hostFallbackFlow,
            eventTimeSlots,
        ) { matches, teams, sports, hostFallback, timeSlots ->
            val sport = relations.event.sportId
                ?.takeIf(String::isNotBlank)
                ?.let { sportId -> sports.firstOrNull { it.id == sportId } }
            relations.toEventWithFullRelations(matches, teams).copy(
                timeSlots = timeSlots,
                sport = sport,
                host = relations.host ?: hostFallback,
            )
        }.combine(eventLeagueScoringConfig) { combinedRelations, leagueScoringConfig ->
            combinedRelations.copy(leagueScoringConfig = leagueScoringConfig)
        }.combine(_eventStaffInvites) { combinedRelations, staffInvites ->
            combinedRelations.copy(staffInvites = staffInvites)
        }
    }.stateIn(
        scope, SharingStarted.Eagerly, EventWithFullRelations(
            event, emptyList(), emptyList(), emptyList()
        )
    )

    private val _divisionMatches = MutableStateFlow<Map<String, MatchWithRelations>>(emptyMap())
    override val divisionMatches = _divisionMatches.asStateFlow()

    private val _divisionTeams = MutableStateFlow<Map<String, TeamWithPlayers>>(emptyMap())
    override val divisionTeams = _divisionTeams.asStateFlow()

    private val _selectedDivision = MutableStateFlow<String?>(null)
    override val selectedDivision = _selectedDivision.asStateFlow()

    private val _selectedWeeklyOccurrence = MutableStateFlow<SelectedWeeklyOccurrenceState?>(null)
    override val selectedWeeklyOccurrence = _selectedWeeklyOccurrence.asStateFlow()

    private val _selectedWeeklyOccurrenceSummary = MutableStateFlow<WeeklyOccurrenceSummary?>(null)
    override val selectedWeeklyOccurrenceSummary = _selectedWeeklyOccurrenceSummary.asStateFlow()

    private val _weeklyOccurrenceSummaries = MutableStateFlow<Map<String, WeeklyOccurrenceSummary>>(emptyMap())
    override val weeklyOccurrenceSummaries = _weeklyOccurrenceSummaries.asStateFlow()

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

    override val eventFields: StateFlow<List<FieldWithMatches>> = eventFieldIds.flatMapLatest { fieldIds ->
        if (fieldIds.isEmpty()) {
            flowOf(emptyList())
        } else {
            flow {
                fieldRepository.getFields(fieldIds).onFailure { error ->
                    Napier.w("Failed to refresh fields for event ${selectedEvent.value.id}: ${error.message}")
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
                        divisionsEquivalent(detail.id, normalizedActiveDivision) ||
                            divisionsEquivalent(detail.key, normalizedActiveDivision)
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

    private val _rounds = MutableStateFlow<List<List<MatchWithRelations?>>>(emptyList())
    override val rounds = _rounds.asStateFlow()

    private val _losersBracket = MutableStateFlow(false)
    override val losersBracket = _losersBracket.asStateFlow()

    private val _showDetails = MutableStateFlow(false)
    override val showDetails = _showDetails.asStateFlow()

    private val _eventTeamsAndParticipantsLoading = MutableStateFlow(false)
    override val eventTeamsAndParticipantsLoading = _eventTeamsAndParticipantsLoading.asStateFlow()

    private val _eventMatchesLoading = MutableStateFlow(false)
    override val eventMatchesLoading = _eventMatchesLoading.asStateFlow()

    private var eventDetailHydrationJob: Job? = null
    private var eventDetailHydrationToken: Long = 0L
    private var weeklyOccurrenceSummaryPrefetchJob: Job? = null

    private val _showFeeBreakdown = MutableStateFlow(false)
    override val showFeeBreakdown = _showFeeBreakdown.asStateFlow()

    private val _currentFeeBreakdown = MutableStateFlow<FeeBreakdown?>(null)
    override val currentFeeBreakdown = _currentFeeBreakdown.asStateFlow()

    private var pendingPaymentAction: (() -> Unit)? = null

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

    private val _usersTeam = MutableStateFlow<TeamWithPlayers?>(null)

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
    ) { relations, division, weeklySummary ->
        if (isWeeklyParentEvent(relations.event)) {
            val capacity = weeklySummary?.participantCapacity ?: return@combine false
            return@combine weeklySummary.participantCount >= capacity && capacity > 0
        }
        checkEventIsFull(relations.event, relations.teams, division)
    }.stateIn(scope, SharingStarted.Eagerly, checkEventIsFull(event, emptyList(), null))

    private val _isUserInEvent: MutableStateFlow<Boolean> =
        MutableStateFlow(checkIsUserInEvent(event))
    override val isUserInEvent = _isUserInEvent.asStateFlow()

    private val _isUserInWaitlist = MutableStateFlow(checkIsUserWaitListed(event))
    override val isUserInWaitlist = _isUserInWaitlist.asStateFlow()

    private val _isUserFreeAgent = MutableStateFlow(checkIsUserFreeAgent(event))
    override val isUserFreeAgent = _isUserFreeAgent.asStateFlow()

    private val _isUserCaptain = MutableStateFlow(checkIsUserCaptain())
    override val isUserCaptain = _isUserCaptain.asStateFlow()

    private val _isEditingMatches = MutableStateFlow(false)
    override val isEditingMatches = _isEditingMatches.asStateFlow()

    private val _editableMatches = MutableStateFlow<List<MatchWithRelations>>(emptyList())
    override val editableMatches = _editableMatches.asStateFlow()

    private val _editableRounds = MutableStateFlow<List<List<MatchWithRelations?>>>(emptyList())
    override val editableRounds = _editableRounds.asStateFlow()

    private val _stagedMatchCreates = MutableStateFlow<Map<String, StagedMatchCreateMeta>>(emptyMap())
    private val _stagedMatchDeletes = MutableStateFlow<Set<String>>(emptySet())
    private var pendingCreateMatchId: String? = null

    private val _showTeamSelectionDialog = MutableStateFlow<TeamSelectionDialogState?>(null)
    override val showTeamSelectionDialog = _showTeamSelectionDialog.asStateFlow()

    private val _showMatchEditDialog = MutableStateFlow<MatchEditDialogState?>(null)
    override val showMatchEditDialog = _showMatchEditDialog.asStateFlow()

    private val _joinChoiceDialog = MutableStateFlow<JoinChoiceDialogState?>(null)
    override val joinChoiceDialog = _joinChoiceDialog.asStateFlow()

    private val _childJoinSelectionDialog = MutableStateFlow<ChildJoinSelectionDialogState?>(null)
    override val childJoinSelectionDialog = _childJoinSelectionDialog.asStateFlow()

    private val _paymentPlanPreviewDialog = MutableStateFlow<PaymentPlanPreviewDialogState?>(null)
    override val paymentPlanPreviewDialog = _paymentPlanPreviewDialog.asStateFlow()

    private val _withdrawTargets = MutableStateFlow<List<WithdrawTargetOption>>(emptyList())
    override val withdrawTargets = _withdrawTargets.asStateFlow()

    private val _textSignaturePrompt = MutableStateFlow<TextSignaturePromptState?>(null)
    override val textSignaturePrompt = _textSignaturePrompt.asStateFlow()

    private val _webSignaturePrompt = MutableStateFlow<WebSignaturePromptState?>(null)
    override val webSignaturePrompt = _webSignaturePrompt.asStateFlow()

    private var joinableChildren: List<JoinChildOption> = emptyList()
    private var pendingSignatureSteps: List<SignStep> = emptyList()
    private var pendingSignatureStepIndex = 0
    private var pendingPostSignatureAction: (suspend () -> Unit)? = null
    private var pendingBillingAddressAction: (() -> Unit)? = null
    private var pendingJoinConfirmationTarget: JoinConfirmationTarget? = null
    private var pendingSignatureContext: SignerContext = SignerContext.PARTICIPANT
    private var pendingSignatureContexts: List<SignerContext> = emptyList()
    private var pendingSignatureContextIndex = 0
    private var pendingSignatureChild: JoinChildOption? = null
    private var pendingPdfSignaturePollJob: Job? = null
    private var pendingPaymentPlanPreviewAction: (() -> Unit)? = null
    private val completedSignatureKeys = mutableSetOf<String>()

    private val shareServiceProvider = ShareServiceProvider()

    init {
        backHandler.register(backCallback)
        loadSports()
        scope.launch {
            selectedEvent
                .map { selected -> selected.organizationId?.trim().orEmpty() }
                .distinctUntilChanged()
                .collect { organizationId ->
                    loadOrganizationTemplates(organizationId)
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
            selectedEvent
                .map { selected -> selected.id to isWeeklyParentEvent(selected) }
                .distinctUntilChanged()
                .collect { (_, weeklyParent) ->
                    weeklyOccurrenceSummaryPrefetchJob?.cancel()
                    _weeklyOccurrenceSummaries.value = emptyMap()
                    if (!weeklyParent) {
                        _selectedWeeklyOccurrence.value = null
                        _selectedWeeklyOccurrenceSummary.value = null
                    }
                }
        }
        scope.launch {
            _selectedWeeklyOccurrence
                .collectLatest {
                    val targetEvent = selectedEvent.value
                    if (!isWeeklyParentEvent(targetEvent)) {
                        _selectedWeeklyOccurrenceSummary.value = null
                        return@collectLatest
                    }
                    _selectedWeeklyOccurrenceSummary.value = it
                        ?.let { occurrence ->
                            weeklyOccurrenceSummaryKey(
                                slotId = occurrence.slotId,
                                occurrenceDate = occurrence.occurrenceDate,
                            )?.let(_weeklyOccurrenceSummaries.value::get)
                        }
                    refreshCurrentUserMembershipState(targetEvent)
                    _eventTeamsAndParticipantsLoading.value = true
                    try {
                        syncSelectedWeeklyOccurrenceParticipants(targetEvent)
                    } finally {
                        _eventTeamsAndParticipantsLoading.value = false
                    }
                }
        }
        scope.launch {
            cachedCurrentUserRegistrations.collect {
                refreshCurrentUserMembershipState(selectedEvent.value)
            }
        }
        scope.launch {
            _isEditing.collect { isEditing ->
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
                    val confirmationTarget = pendingJoinConfirmationTarget
                    when (it) {
                        PaymentResult.Canceled -> {
                            _errorState.value = ErrorMessage("Payment Canceled")
                        }

                        is PaymentResult.Failed -> {
                            _errorState.value = ErrorMessage(it.error)
                        }

                        PaymentResult.Completed -> {

                            loadingHandler.showLoading("Reloading Event")
                            val userJoinedSuccessfully = waitForUserInEventWithTimeout(
                                confirmationTarget = confirmationTarget,
                            )
                            if (!userJoinedSuccessfully) {
                                _errorState.value =
                                    ErrorMessage("Failed to confirm event join. Please reload event.")
                            }
                        }
                    }
                    loadingHandler.hideLoading()
                    pendingJoinConfirmationTarget = null
                    clearPaymentResult()
                }
            }
        }
        scope.launch {
            selectedEvent.collect { selected ->
                if (selected.id.isBlank()) {
                    _eventStaffInvites.value = emptyList()
                } else {
                    _eventStaffInvites.value = eventRepository.getEventStaffInvites(selected.id)
                        .getOrElse { error ->
                            Napier.w("Failed to refresh staff invites for event ${selected.id}: ${error.message}")
                            emptyList()
                        }
                }
            }
        }
        scope.launch {
            matchRepository.setIgnoreMatch(null)
            matchRepository.subscribeToMatches()
            eventWithRelations.distinctUntilChanged { old, new -> old == new }.filterNotNull()
                .collect { event ->
                    if (!canEditEventDetails(event.event) && _isEditing.value) {
                        _isEditing.value = false
                        _editedEvent.value = event.event
                        _editableLeagueTimeSlots.value = event.timeSlots.sortedBy { slot ->
                            slot.startTimeMinutes ?: Int.MAX_VALUE
                        }
                        val refreshedFields = buildEditableFieldDrafts(
                            event = event.event,
                            sourceFields = eventFields.value.map { relation -> relation.field },
                        )
                        _editableFields.value = refreshedFields
                        _fieldCount.value = refreshedFields.size
                    } else if (!_isEditing.value) {
                        _editableLeagueTimeSlots.value = event.timeSlots.sortedBy { slot ->
                            slot.startTimeMinutes ?: Int.MAX_VALUE
                        }
                        val refreshedFields = buildEditableFieldDrafts(
                            event = event.event,
                            sourceFields = eventFields.value.map { relation -> relation.field },
                        )
                        _editableFields.value = refreshedFields
                        _fieldCount.value = refreshedFields.size
                    }
                    refreshCurrentUserMembershipState(event.event)
                    refreshWithdrawTargets(event.event)
                    event.event.resolveDefaultSelectedDivisionId()?.let { divisionId ->
                        selectDivision(divisionId)
                    }
                }
        }
        scope.launch {
            combine(eventWithRelations, eventFields, _isEditing) { relations, fieldsWithMatches, editing ->
                Triple(relations, fieldsWithMatches.map { relation -> relation.field }, editing)
            }.collect { (relations, fields, editing) ->
                if (!editing) {
                    val refreshedFields = buildEditableFieldDrafts(
                        event = relations.event,
                        sourceFields = fields,
                    )
                    _editableFields.value = refreshedFields
                    _fieldCount.value = refreshedFields.size
                    _editableLeagueScoringConfig.value = relations.leagueScoringConfig?.toDto()
                        ?: LeagueScoringConfigDTO()
                    _editedEvent.value = relations.event.copy(fieldIds = refreshedFields.map { field -> field.id })
                }
            }
        }
        scope.launch {
            selectedDivision.collect { _ ->
                _selectedDivision.value?.let { selectDivision(it) }
            }
        }
        scope.launch {
            combine(selectedEvent, selectedDivision) { eventValue, divisionValue ->
                val normalizedDivision = divisionValue
                    ?.normalizeDivisionIdentifier()
                    ?.takeIf(String::isNotBlank)
                if (eventValue.eventType != EventType.LEAGUE || normalizedDivision == null) {
                    null
                } else if (eventValue.isPlayoffPlacementDivision(normalizedDivision)) {
                    null
                } else {
                    eventValue.id to normalizedDivision
                }
            }
                .distinctUntilChanged()
                .collect { selection ->
                    if (selection == null) {
                        _leagueDivisionStandings.value = null
                        _leagueDivisionStandingsLoading.value = false
                    } else {
                        _leagueDivisionStandings.value = null
                        loadLeagueDivisionStandings(
                            eventId = selection.first,
                            divisionId = selection.second,
                            showLoading = true,
                            reportErrors = false,
                        )
                    }
                }
        }
        scope.launch {
            _divisionMatches.collect { generateRounds() }
        }
    }

    private fun loadSports() {
        scope.launch {
            sportsRepository.getSports()
                .onSuccess {
                    _sports.value = it
                    if (_isEditing.value) {
                        _editedEvent.value = syncOfficialStaffingForSportTransition(
                            previous = _editedEvent.value,
                            updated = _editedEvent.value.withSportRules(),
                        )
                    }
                }
                .onFailure {
                    _errorState.value = ErrorMessage("Failed to load sports: ${it.userMessage()}")
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
                Napier.w("Failed to load templates for organization $organizationId.", throwable)
                _organizationTemplates.value = emptyList()
                _organizationTemplatesError.value =
                    throwable.userMessage("Failed to load templates.")
            }
        _organizationTemplatesLoading.value = false
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
        val normalizedDivision = division.normalizeDivisionIdentifier()
        _selectedDivision.value = normalizedDivision.ifEmpty { null }
        _divisionTeams.value = eventWithRelations.value.teams.associateBy { it.team.id }
        val divisionFilter = _selectedDivision.value
        _divisionMatches.value = if (!selectedEvent.value.singleDivision && !divisionFilter.isNullOrEmpty()) {
            eventWithRelations.value.matches.filter {
                divisionsEquivalent(it.match.division, divisionFilter) && !(
                    it.previousRightMatch == null &&
                    it.previousLeftMatch == null &&
                    it.winnerNextMatch == null &&
                    it.loserNextMatch == null
                )
            }
                .associateBy { it.match.id }
        } else {
            eventWithRelations.value.matches.filter {
                !(
                    it.previousRightMatch == null &&
                    it.previousLeftMatch == null &&
                    it.winnerNextMatch == null &&
                    it.loserNextMatch == null
                )
            }.associateBy { it.match.id }
        }
        if (_isEditingMatches.value) {
            refreshEditableRounds()
        }
    }

    private suspend fun loadLeagueDivisionStandings(
        eventId: String,
        divisionId: String,
        showLoading: Boolean,
        reportErrors: Boolean,
    ) {
        if (showLoading) {
            _leagueDivisionStandingsLoading.value = true
        }
        eventRepository.getLeagueDivisionStandings(eventId, divisionId)
            .onSuccess { standings ->
                _leagueDivisionStandings.value = standings
            }
            .onFailure { throwable ->
                if (reportErrors) {
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Failed to load league standings."),
                    )
                }
            }
        if (showLoading) {
            _leagueDivisionStandingsLoading.value = false
        }
    }

    private suspend fun refreshLeagueStandingsAfterSchedule(event: Event) {
        if (event.eventType != EventType.LEAGUE) return
        val divisionId = resolveLeagueStandingsDivisionId() ?: return
        loadLeagueDivisionStandings(
            eventId = event.id,
            divisionId = divisionId,
            showLoading = false,
            reportErrors = false,
        )
    }

    private fun resolveLeagueStandingsDivisionId(): String? =
        _leagueDivisionStandings.value?.divisionId
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
            ?: selectedDivision.value
                ?.normalizeDivisionIdentifier()
                ?.takeIf { divisionId ->
                    divisionId.isNotBlank() && !selectedEvent.value.isPlayoffPlacementDivision(divisionId)
                }

    override fun refreshLeagueStandings() {
        val divisionId = resolveLeagueStandingsDivisionId() ?: return
        val eventId = selectedEvent.value.id
        scope.launch {
            loadLeagueDivisionStandings(
                eventId = eventId,
                divisionId = divisionId,
                showLoading = true,
                reportErrors = true,
            )
        }
    }

    override fun confirmLeagueStandings(applyReassignment: Boolean) {
        val event = selectedEvent.value
        val divisionId = resolveLeagueStandingsDivisionId()

        if (event.eventType != EventType.LEAGUE || divisionId == null) {
            _errorState.value = ErrorMessage("Select a league division before confirming standings.")
            return
        }

        scope.launch {
            _leagueStandingsConfirming.value = true
            loadingHandler.showLoading("Confirming standings...")

            eventRepository.confirmLeagueDivisionStandings(
                eventId = event.id,
                divisionId = divisionId,
                applyReassignment = applyReassignment,
            ).onSuccess { result ->
                _leagueDivisionStandings.value = result.division
                matchRepository.getMatchesOfTournament(event.id)
                eventRepository.getEvent(event.id)
                _errorState.value = ErrorMessage(
                    if (result.applyReassignment && result.seededTeamIds.isNotEmpty()) {
                        "Standings confirmed. Playoff assignments updated."
                    } else {
                        "Standings confirmed."
                    },
                )
            }.onFailure { throwable ->
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to confirm standings."),
                )
            }

            _leagueStandingsConfirming.value = false
            loadingHandler.hideLoading()
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
        _losersBracket.value = !_losersBracket.value
        generateRounds()
        if (_isEditingMatches.value) {
            refreshEditableRounds()
        }
    }

    override fun onUploadSelected(photo: GalleryPhotoResult) {
        scope.launch {
            imageRepository.uploadImage(convertPhotoResultToUploadFile(photo))
        }
    }

    override fun deleteImage(imageId: String) {
        scope.launch {
            loadingHandler.showLoading("Deleting Image ...")
            imageRepository.deleteImage(imageId)
            loadingHandler.hideLoading()
        }
    }

    private fun hasEventStarted(event: Event = selectedEvent.value): Boolean =
        Clock.System.now() >= event.start

    private fun hasSelectedWeeklyOccurrenceStarted(event: Event = selectedEvent.value): Boolean {
        if (!isWeeklyParentEvent(event)) {
            return false
        }
        val selection = _selectedWeeklyOccurrence.value ?: return false
        return Clock.System.now() >= selection.sessionStart
    }

    private fun shouldUseRegisteredTeamWithdrawal(
        event: Event,
        targetUserId: String,
        membership: WithdrawTargetMembership,
    ): Boolean =
        membership == WithdrawTargetMembership.PARTICIPANT &&
            event.teamSignup &&
            targetUserId == currentUser.value.id &&
            !checkIsUserFreeAgent(event)

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
        val selection = _selectedWeeklyOccurrence.value ?: return null
        return EventOccurrenceSelection(
            slotId = selection.slotId,
            occurrenceDate = selection.occurrenceDate,
            label = selection.label,
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

    private fun occurrencesMatch(
        left: EventOccurrenceSelection?,
        right: EventOccurrenceSelection?,
    ): Boolean {
        return when {
            left == null && right == null -> true
            left == null || right == null -> false
            else -> left.slotId == right.slotId && left.occurrenceDate == right.occurrenceDate
        }
    }

    private fun buildJoinConfirmationTarget(
        registrantType: JoinConfirmationRegistrantType,
        registrantId: String,
        occurrence: EventOccurrenceSelection? = null,
        eventId: String = selectedEvent.value.id,
    ): JoinConfirmationTarget? {
        val normalizedRegistrantId = registrantId.trim()
        val normalizedEventId = eventId.trim()
        if (normalizedRegistrantId.isBlank() || normalizedEventId.isBlank()) {
            return null
        }
        return JoinConfirmationTarget(
            eventId = normalizedEventId,
            registrantType = registrantType,
            registrantId = normalizedRegistrantId,
            occurrence = occurrence,
        )
    }

    private fun rememberWeeklyOccurrenceSummary(
        occurrence: EventOccurrenceSelection,
        summary: WeeklyOccurrenceSummary,
    ) {
        val key = weeklyOccurrenceSummaryKey(
            slotId = occurrence.slotId,
            occurrenceDate = occurrence.occurrenceDate,
        ) ?: return
        _weeklyOccurrenceSummaries.value = _weeklyOccurrenceSummaries.value + (key to summary)
        val selected = _selectedWeeklyOccurrence.value
        if (selected != null &&
            selected.slotId == occurrence.slotId &&
            selected.occurrenceDate == occurrence.occurrenceDate
        ) {
            _selectedWeeklyOccurrenceSummary.value = summary
        }
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
            _selectedWeeklyOccurrenceSummary.value = null
            return
        }

        val occurrence = currentWeeklyOccurrenceSelection()
        eventRepository.syncEventParticipants(
            event = event,
            occurrence = occurrence,
        ).onSuccess { result ->
            _selectedWeeklyOccurrenceSummary.value = if (occurrence == null || result.weeklySelectionRequired) {
                null
            } else {
                WeeklyOccurrenceSummary(
                    participantCount = result.participantCount,
                    participantCapacity = result.participantCapacity,
                ).also { summary ->
                    rememberWeeklyOccurrenceSummary(occurrence, summary)
                }
            }
        }.onFailure { throwable ->
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
                refreshSelectedWeeklyOccurrenceSummaryIfNeeded(refreshed)
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

    private fun canRequestPaidRefund(event: Event, membership: WithdrawTargetMembership): Boolean =
        event.hasAnyPaidDivision() && membership == WithdrawTargetMembership.PARTICIPANT

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
                    joinableChildren = children
                    _joinChoiceDialog.value = JoinChoiceDialogState(children = children)
                    _childJoinSelectionDialog.value = null
                    return@launch
                }
            }
            runSelfJoinFlow()
        }
    }

    override fun selectWeeklySession(
        sessionStart: Instant,
        sessionEnd: Instant,
        slotId: String?,
        occurrenceDate: String?,
        label: String?,
    ) {
        val parentEvent = selectedEvent.value
        if (!isWeeklyParentEvent(parentEvent)) {
            _errorState.value = ErrorMessage("Weekly occurrences are only available from parent weekly events.")
            return
        }
        if (sessionEnd <= sessionStart) {
            _errorState.value = ErrorMessage("Selected weekly occurrence time is invalid.")
            return
        }
        val normalizedSlotId = slotId?.trim()?.takeIf(String::isNotBlank)
        val normalizedOccurrenceDate = occurrenceDate?.trim()?.takeIf(String::isNotBlank)
        if (normalizedSlotId == null || normalizedOccurrenceDate == null) {
            _errorState.value = ErrorMessage("Select a valid weekly occurrence.")
            return
        }
        val resolvedLabel = label?.trim()?.takeIf(String::isNotBlank)
            ?: normalizedOccurrenceDate
        _selectedWeeklyOccurrence.value = SelectedWeeklyOccurrenceState(
            slotId = normalizedSlotId,
            occurrenceDate = normalizedOccurrenceDate,
            label = resolvedLabel,
            sessionStart = sessionStart,
            sessionEnd = sessionEnd,
        )
    }

    override fun prefetchWeeklyOccurrenceSummaries(occurrences: List<EventOccurrenceSelection>) {
        val event = selectedEvent.value
        if (!isWeeklyParentEvent(event)) return

        val normalizedOccurrences = occurrences
            .mapNotNull { occurrence ->
                val slotId = occurrence.slotId.trim().takeIf(String::isNotBlank) ?: return@mapNotNull null
                val occurrenceDate = occurrence.occurrenceDate.trim().takeIf(String::isNotBlank)
                    ?: return@mapNotNull null
                EventOccurrenceSelection(
                    slotId = slotId,
                    occurrenceDate = occurrenceDate,
                    label = occurrence.label,
                )
            }
            .distinctBy { occurrence -> "${occurrence.slotId}|${occurrence.occurrenceDate}" }

        if (normalizedOccurrences.isEmpty()) return

        weeklyOccurrenceSummaryPrefetchJob?.cancel()
        weeklyOccurrenceSummaryPrefetchJob = scope.launch {
            val selectedKey = currentWeeklyOccurrenceSelection()?.let { occurrence ->
                weeklyOccurrenceSummaryKey(
                    slotId = occurrence.slotId,
                    occurrenceDate = occurrence.occurrenceDate,
                )
            }
            val pending = normalizedOccurrences.filter { occurrence ->
                val key = weeklyOccurrenceSummaryKey(
                    slotId = occurrence.slotId,
                    occurrenceDate = occurrence.occurrenceDate,
                )
                key != null &&
                    key != selectedKey &&
                    !_weeklyOccurrenceSummaries.value.containsKey(key)
            }

            pending.forEach { occurrence ->
                val summary = fetchWeeklyOccurrenceSummary(event, occurrence) ?: return@forEach
                rememberWeeklyOccurrenceSummary(occurrence, summary)
            }
        }
    }

    override fun clearSelectedWeeklySession() {
        _selectedWeeklyOccurrence.value = null
    }

    private suspend fun resumePendingSignatureFlowIfNeeded(): Boolean {
        if (pendingPostSignatureAction == null || pendingSignatureContexts.isEmpty()) {
            return false
        }

        loadSignatureStepsForCurrentContext()
        return true
    }

    override fun joinEventAsTeam(team: TeamWithPlayers) {
        scope.launch {
            if (!ensureRegistrationOpen()) return@launch
            _usersTeam.value = team
            _joinChoiceDialog.value = null
            _childJoinSelectionDialog.value = null

            buildPaymentPlanPreviewDialogState(
                ownerLabel = team.team.name.trim().ifBlank { "Your team" },
                forTeamJoin = true,
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
        _joinChoiceDialog.value = null
        _childJoinSelectionDialog.value = null
        scope.launch {
            runSelfJoinFlow()
        }
    }

    override fun showChildJoinSelection() {
        val children = joinableChildren.ifEmpty {
            _joinChoiceDialog.value?.children.orEmpty()
        }
        _joinChoiceDialog.value = null
        if (children.isEmpty()) {
            _errorState.value = ErrorMessage("No linked children are available for registration.")
            _childJoinSelectionDialog.value = null
            return
        }
        _childJoinSelectionDialog.value = ChildJoinSelectionDialogState(children = children)
    }

    override fun selectChildForJoin(childUserId: String) {
        if (!ensureRegistrationOpen()) {
            _joinChoiceDialog.value = null
            _childJoinSelectionDialog.value = null
            return
        }
        val selectedChild = joinableChildren.firstOrNull { it.userId == childUserId }
        if (selectedChild == null) {
            _errorState.value = ErrorMessage("Unable to find that child profile.")
            return
        }

        _joinChoiceDialog.value = null
        _childJoinSelectionDialog.value = null
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
        _joinChoiceDialog.value = null
    }

    override fun dismissChildJoinSelectionDialog() {
        _childJoinSelectionDialog.value = null
    }

    private suspend fun runSelfJoinFlow(skipPaymentPlanPreview: Boolean = false) {
        if (!ensureRegistrationOpen()) return
        if (!skipPaymentPlanPreview) {
            buildPaymentPlanPreviewDialogState(
                ownerLabel = "You",
                forTeamJoin = false,
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

    private fun buildPaymentPlanPreviewDialogState(
        ownerLabel: String,
        forTeamJoin: Boolean,
    ): PaymentPlanPreviewDialogState? {
        val event = selectedEvent.value
        if (currentUser.value.isMinor) return null
        val preferredDivisionId = selectedDivision.value
        val paymentPlan = resolveEffectivePaymentPlan(
            event = event,
            preferredDivisionId = preferredDivisionId,
        )
        val shouldPreview = if (forTeamJoin) {
            paymentPlan.allowPaymentPlans && paymentPlan.priceCents > 0 && !isEventFull.value
        } else {
            paymentPlan.allowPaymentPlans &&
                paymentPlan.priceCents > 0 &&
                !isEventFull.value &&
                !event.teamSignup
        }
        if (!shouldPreview) return null

        val divisionLabel = if (event.singleDivision) {
            null
        } else {
            resolveSelectedDivisionDetail(event, preferredDivisionId)
                ?.name
                ?.trim()
                ?.takeIf(String::isNotBlank)
        }

        return PaymentPlanPreviewDialogState(
            ownerLabel = ownerLabel,
            totalAmountCents = paymentPlan.priceCents,
            installmentAmounts = paymentPlan.installmentAmounts,
            installmentDueDates = paymentPlan.installmentDueDates,
            divisionLabel = divisionLabel,
        )
    }

    private fun showPaymentPlanPreviewDialog(
        dialogState: PaymentPlanPreviewDialogState,
        onContinue: () -> Unit,
    ) {
        _paymentPlanPreviewDialog.value = dialogState
        pendingPaymentPlanPreviewAction = onContinue
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
                val status = registration.registrationStatus?.lowercase()
                val message = when {
                    registration.joinedWaitlist -> "${child.fullName} added to waitlist."
                    status == "active" -> "${child.fullName} registration completed."
                    registration.requiresParentApproval -> {
                        "${child.fullName} request sent. A parent/guardian must approve before registration can continue."
                    }
                    registration.requiresChildEmail -> {
                        "${child.fullName} registration started. Add child email to continue child-signature document steps."
                    }
                    !registration.consentStatus.isNullOrBlank() -> {
                        "${child.fullName} registration is pending. Consent status: ${registration.consentStatus}."
                    }
                    !status.isNullOrBlank() -> {
                        "${child.fullName} registration is pending. Status: $status."
                    }
                    else -> "${child.fullName} registration request submitted and is pending processing."
                }
                val warning = registration.warnings.firstOrNull()?.takeIf(String::isNotBlank)
                _errorState.value = ErrorMessage(
                    listOfNotNull(message, warning).joinToString(" ")
                )
            }.onFailure { throwable ->
                _errorState.value = ErrorMessage(throwable.userMessage("Failed to register child."))
            }
        } finally {
            loadingHandler.hideLoading()
        }
    }

    private enum class PaymentPlanBillStatus {
        CREATED,
        ALREADY_EXISTS,
    }

    private fun Throwable.isAlreadyRegisteredJoinError(): Boolean {
        val normalized = message?.lowercase() ?: return false
        return normalized.contains("already registered") ||
            normalized.contains("already in event") ||
            normalized.contains("already a participant")
    }

    private fun Throwable.isDuplicatePaymentPlanError(): Boolean {
        val normalized = message?.lowercase() ?: return false
        return normalized.contains("payment plan already exists")
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
        if (paymentPlan.priceCents <= 0) {
            return Result.failure(IllegalArgumentException("This event does not have a price set for a payment plan."))
        }

        val installmentDueDates = paymentPlan.installmentDueDates
            .mapNotNull { dueDate -> dueDate.trim().takeIf(String::isNotBlank) }

        return billingRepository.createBill(
            CreateBillRequest(
                ownerType = ownerType,
                ownerId = normalizedOwnerId,
                totalAmountCents = paymentPlan.priceCents,
                eventId = event.id,
                organizationId = event.organizationId,
                installmentAmounts = paymentPlan.installmentAmounts,
                installmentDueDates = installmentDueDates,
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
                when {
                    registration.requiresParentApproval ->
                        "Join request sent. A parent/guardian must approve before registration can continue."
                    registration.joinedWaitlist ->
                        "Added to event waitlist."
                    else ->
                        "Join request submitted."
                },
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
            if (currentUser.value.isMinor) {
                submitMinorJoinRequestForParentApproval()
                return
            }
            val paymentPlan = resolveEffectivePaymentPlan(
                event = selectedEvent.value,
                preferredDivisionId = selectedDivision.value,
            )
            if (
                paymentPlan.allowPaymentPlans
                && paymentPlan.priceCents > 0
                && !isEventFull.value
                && !selectedEvent.value.teamSignup
            ) {
                var joinedByThisFlow = false
                loadingHandler.showLoading("Joining Event ...")
                val registrationResult = eventRepository.addCurrentUserToEvent(
                    event = selectedEvent.value,
                    preferredDivisionId = selectedDivision.value,
                    occurrence = weeklyOccurrence,
                )
                val registration = registrationResult.getOrNull()
                if (registration != null) {
                    joinedByThisFlow = !registration.requiresParentApproval && !registration.joinedWaitlist
                    if (registration.requiresParentApproval) {
                        _errorState.value = ErrorMessage(
                            "Join request sent. A parent/guardian must approve before registration can continue."
                        )
                    } else if (registration.joinedWaitlist) {
                        _errorState.value = ErrorMessage("Added to event waitlist.")
                    }
                }
                val registrationFailure = registrationResult.exceptionOrNull()
                if (registrationFailure != null && !registrationFailure.isAlreadyRegisteredJoinError()) {
                    _errorState.value = ErrorMessage(registrationFailure.userMessage())
                    return
                }
                if (registration?.requiresParentApproval == true || registration?.joinedWaitlist == true) {
                    loadingHandler.showLoading("Reloading Event")
                    refreshEventAfterParticipantMutation(
                        eventId = selectedEvent.value.id,
                        warningMessage = "Failed to refresh event after joining waitlist.",
                    )
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
                    _errorState.value = ErrorMessage(
                        if (status == PaymentPlanBillStatus.ALREADY_EXISTS) {
                            "Joined. Payment plan already exists. You can manage installments from your Profile."
                        } else {
                            "Joined. Payment plan started. A bill was created for you. Pay installments from your Profile."
                        }
                    )
                }.onFailure { throwable ->
                    if (joinedByThisFlow) {
                        rollbackUserJoinAfterBillingFailure(selectedEvent.value)
                    }
                    _errorState.value = ErrorMessage(throwable.userMessage())
                }
                return
            }
            if (paymentPlan.priceCents <= 0 || isEventFull.value || selectedEvent.value.teamSignup) {
                loadingHandler.showLoading("Joining Event ...")
                eventRepository.addCurrentUserToEvent(
                    event = selectedEvent.value,
                    preferredDivisionId = selectedDivision.value,
                    occurrence = weeklyOccurrence,
                ).onSuccess { registration ->
                    loadingHandler.showLoading("Reloading Event")
                    refreshEventAfterParticipantMutation(
                        eventId = selectedEvent.value.id,
                        warningMessage = "Failed to refresh event after joining.",
                    )
                    when {
                        registration.requiresParentApproval -> {
                            _errorState.value = ErrorMessage(
                                "Join request sent. A parent/guardian must approve before registration can continue."
                            )
                        }
                        registration.joinedWaitlist -> {
                            _errorState.value = ErrorMessage("Added to event waitlist.")
                        }
                    }
                }.onFailure {
                    _errorState.value = ErrorMessage(it.userMessage())
                }
            } else {
                if (!ensureBillingAddressOrPrompt { scope.launch { executeJoinEvent() } }) {
                    return
                }
                loadingHandler.showLoading("Creating Purchase Request ...")
                billingRepository.createPurchaseIntent(
                    event = selectedEvent.value,
                    priceCents = paymentPlan.priceCents,
                    occurrence = weeklyOccurrence,
                )
                    .onSuccess { purchaseIntent ->
                        pendingJoinConfirmationTarget = buildJoinConfirmationTarget(
                            registrantType = JoinConfirmationRegistrantType.SELF,
                            registrantId = currentUser.value.id,
                            occurrence = weeklyOccurrence,
                        )
                        processPurchaseIntent(purchaseIntent)
                    }.onFailure {
                        _errorState.value = ErrorMessage(it.userMessage())
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
            if (currentUser.value.isMinor) {
                submitMinorJoinRequestForParentApproval()
                return
            }
            val paymentPlan = resolveEffectivePaymentPlan(
                event = selectedEvent.value,
                preferredDivisionId = selectedDivision.value,
            )
            if (
                paymentPlan.allowPaymentPlans
                && paymentPlan.priceCents > 0
                && !isEventFull.value
            ) {
                var joinedByThisFlow = false
                loadingHandler.showLoading("Joining Event ...")
                val joinResult = eventRepository.addTeamToEvent(
                    event = selectedEvent.value,
                    team = team.team,
                    preferredDivisionId = selectedDivision.value,
                    occurrence = weeklyOccurrence,
                )
                if (joinResult.isSuccess) {
                    joinedByThisFlow = true
                }
                val joinFailure = joinResult.exceptionOrNull()
                if (joinFailure != null && !joinFailure.isAlreadyRegisteredJoinError()) {
                    _errorState.value = ErrorMessage(joinFailure.userMessage())
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
                    _errorState.value = ErrorMessage(
                        if (status == PaymentPlanBillStatus.ALREADY_EXISTS) {
                            "Team joined. Payment plan already exists. Manage installments from your Profile."
                        } else {
                            "Team joined. Payment plan started. A bill was created. Manage installments from your Profile."
                        }
                    )
                }.onFailure { throwable ->
                    if (joinedByThisFlow) {
                        rollbackTeamJoinAfterBillingFailure(selectedEvent.value, team)
                    }
                    _errorState.value = ErrorMessage(throwable.userMessage())
                }
                return
            }
            if (paymentPlan.priceCents <= 0 || isEventFull.value) {
                loadingHandler.showLoading("Joining Event ...")
                eventRepository.addTeamToEvent(
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
                }.onFailure {
                    _errorState.value = ErrorMessage(it.userMessage())
                }
            } else {
                if (!ensureBillingAddressOrPrompt { scope.launch { executeJoinEventAsTeam(team) } }) {
                    return
                }
                loadingHandler.showLoading("Creating Purchase Request ...")
                billingRepository.createPurchaseIntent(
                    event = selectedEvent.value,
                    teamId = team.team.id,
                    priceCents = paymentPlan.priceCents,
                    occurrence = weeklyOccurrence,
                )
                    .onSuccess { purchaseIntent ->
                        pendingJoinConfirmationTarget = buildJoinConfirmationTarget(
                            registrantType = JoinConfirmationRegistrantType.TEAM,
                            registrantId = team.team.id,
                            occurrence = weeklyOccurrence,
                        )
                        processPurchaseIntent(purchaseIntent)
                    }.onFailure {
                        _errorState.value = ErrorMessage(it.userMessage())
                    }
            }
        } finally {
            loadingHandler.hideLoading()
        }
    }

    private fun signatureCompletionKey(
        templateId: String,
        signerContext: SignerContext,
        child: JoinChildOption?,
    ): String = "${signerContext.name}:${child?.userId.orEmpty()}:$templateId"

    private suspend fun runActionAfterRequiredSigning(
        signerContext: SignerContext = SignerContext.PARTICIPANT,
        child: JoinChildOption? = null,
        onReady: suspend () -> Unit,
    ) {
        pendingSignatureContexts = buildSignatureContextQueue(signerContext, child)
        pendingSignatureContextIndex = 0
        pendingSignatureChild = child
        pendingPostSignatureAction = onReady
        loadSignatureStepsForCurrentContext()
    }

    private fun buildSignatureContextQueue(
        baseContext: SignerContext,
        child: JoinChildOption?,
    ): List<SignerContext> {
        if (child == null) return listOf(baseContext)
        val childEmail = child.email?.trim()?.takeIf(String::isNotBlank)?.lowercase()
        val currentEmail = userRepository.currentAccount.value.getOrNull()?.email
            ?.trim()?.takeIf(String::isNotBlank)?.lowercase()
        val shouldChainChild =
            childEmail != null && currentEmail != null && childEmail == currentEmail && baseContext != SignerContext.CHILD

        return if (shouldChainChild) {
            listOf(baseContext, SignerContext.CHILD)
        } else {
            listOf(baseContext)
        }
    }

    private fun currentSignatureContext(): SignerContext =
        pendingSignatureContexts.getOrNull(pendingSignatureContextIndex) ?: SignerContext.PARTICIPANT

    private suspend fun loadSignatureStepsForCurrentContext() {
        if (pendingSignatureContexts.isEmpty()) {
            clearPendingSignatureFlow()
            return
        }

        val context = currentSignatureContext()
        pendingSignatureContext = context

        billingRepository.getRequiredSignLinks(
            eventId = selectedEvent.value.id,
            signerContext = context,
            childUserId = pendingSignatureChild?.userId,
            childUserEmail = pendingSignatureChild?.email,
        ).onFailure { throwable ->
            Napier.e("Failed to load required signing documents.", throwable)
            _errorState.value = ErrorMessage(
                "Unable to load required documents: ${throwable.userMessage("Unknown error")}"
            )
        }.onSuccess { allSteps ->
            val pendingSteps = allSteps.filterNot { step ->
                val key = signatureCompletionKey(
                    templateId = step.templateId,
                    signerContext = context,
                    child = pendingSignatureChild,
                )
                completedSignatureKeys.contains(key)
            }

            if (pendingSteps.isEmpty()) {
                advanceSigningContextOrComplete()
                return@onSuccess
            }

            pendingSignatureSteps = pendingSteps
            pendingSignatureStepIndex = 0
            processNextSignatureStep()
        }
    }

    private suspend fun advanceSigningContextOrComplete() {
        pendingSignatureSteps = emptyList()
        pendingSignatureStepIndex = 0

        if (
            pendingSignatureContexts.isNotEmpty() &&
            pendingSignatureContextIndex < pendingSignatureContexts.lastIndex
        ) {
            pendingSignatureContextIndex += 1
            loadSignatureStepsForCurrentContext()
            return
        }

        val action = pendingPostSignatureAction
        clearPendingSignatureFlow()
        action?.invoke()
    }

    private suspend fun processNextSignatureStep() {
        pendingPdfSignaturePollJob?.cancel()
        pendingPdfSignaturePollJob = null

        val currentStep = pendingSignatureSteps.getOrNull(pendingSignatureStepIndex)
        if (currentStep == null) {
            advanceSigningContextOrComplete()
            return
        }

        if (currentStep.isTextStep()) {
            _textSignaturePrompt.value = TextSignaturePromptState(
                step = currentStep,
                currentStep = pendingSignatureStepIndex + 1,
                totalSteps = pendingSignatureSteps.size
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

        _webSignaturePrompt.value = WebSignaturePromptState(
            step = currentStep,
            url = signingUrl,
            currentStep = pendingSignatureStepIndex + 1,
            totalSteps = pendingSignatureSteps.size,
        )

        val operationId = currentStep.operationId?.trim()?.takeIf(String::isNotBlank)
        if (operationId == null) {
            _errorState.value = ErrorMessage(
                "Complete signing in the modal, then tap Join/Purchase again."
            )
            return
        }

        _errorState.value = ErrorMessage("Waiting for signature sync...")
        pendingPdfSignaturePollJob = scope.launch {
            billingRepository.pollBoldSignOperation(operationId).onFailure { throwable ->
                Napier.e("Failed to poll BoldSign operation.", throwable)
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to confirm signature status.")
                )
                clearPendingSignatureFlow()
            }.onSuccess {
                _webSignaturePrompt.value = null
                val completionKey = signatureCompletionKey(
                    templateId = currentStep.templateId,
                    signerContext = pendingSignatureContext,
                    child = pendingSignatureChild,
                )
                completedSignatureKeys += completionKey
                pendingSignatureStepIndex += 1
                processNextSignatureStep()
            }
        }
    }

    private fun clearPendingSignatureFlow() {
        pendingPdfSignaturePollJob?.cancel()
        pendingPdfSignaturePollJob = null
        pendingSignatureSteps = emptyList()
        pendingSignatureStepIndex = 0
        pendingSignatureContext = SignerContext.PARTICIPANT
        pendingSignatureContexts = emptyList()
        pendingSignatureContextIndex = 0
        pendingSignatureChild = null
        pendingPostSignatureAction = null
        _textSignaturePrompt.value = null
        _webSignaturePrompt.value = null
    }

    private fun processPurchaseIntent(intent: PurchaseIntent) {
        if (!ensureDocumentSignedBeforePurchase(intent)) {
            return
        }

        intent.feeBreakdown?.let { feeBreakdown ->
            showFeeBreakdown(feeBreakdown, onConfirm = {
                scope.launch {
                    showPaymentSheet(intent)
                }
            }, onCancel = {
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

        _webSignaturePrompt.value = WebSignaturePromptState(
            step = null,
            url = signingUrl,
            currentStep = 1,
            totalSteps = 1,
        )
        _errorState.value = ErrorMessage(
            "Please complete document signing in the modal, then tap Purchase Ticket again."
        )

        return false
    }

    private suspend fun showPaymentSheet(intent: PurchaseIntent) {
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

        pendingBillingAddressAction = onReady
        _billingAddressPrompt.value = billingAddress ?: BillingAddressDraft()
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
            val normalizedTargetUserId = targetUserId
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: currentUser.value.id
            val membership = resolveWithdrawTargetMembership(
                event = event,
                userId = normalizedTargetUserId,
            )
            if (membership == null) {
                _errorState.value = ErrorMessage("Selected profile is not registered for this event.")
                return@launch
            }
            if (!canRequestPaidRefund(event, membership)) {
                _errorState.value = ErrorMessage(
                    if (!event.hasAnyPaidDivision()) {
                        "Refund requests are only available for paid events."
                    } else {
                        "Only registered participants can request refunds."
                    }
                )
                return@launch
            }
            val useTeamWithdrawal = shouldUseRegisteredTeamWithdrawal(
                event = event,
                targetUserId = normalizedTargetUserId,
                membership = membership,
            )
            if (weeklyOccurrence != null && !useTeamWithdrawal) {
                _errorState.value = ErrorMessage(
                    "Refunds for individual weekly registrations are not available here yet. Contact the host for help.",
                )
                return@launch
            }
            loadingHandler.showLoading("Requesting Refund ...")
            val refundResult = if (useTeamWithdrawal) {
                val team = _usersTeam.value
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
            val normalizedTargetUserId = targetUserId
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: currentUser.value.id
            val membership = resolveWithdrawTargetMembership(
                event = event,
                userId = normalizedTargetUserId,
            )
            if (membership == null) {
                _errorState.value = ErrorMessage("Selected profile is not registered for this event.")
                return@launch
            }
            if (!canRequestPaidRefund(event, membership)) {
                _errorState.value = ErrorMessage(
                    if (!event.hasAnyPaidDivision()) {
                        "Refund requests are only available for paid events."
                    } else {
                        "Only registered participants can request refunds."
                    }
                )
                return@launch
            }
            if (hasEventStarted(event)) {
                _errorState.value = ErrorMessage("Automatic refunds are no longer available after the event starts.")
                return@launch
            }
            val useTeamWithdrawal = shouldUseRegisteredTeamWithdrawal(
                event = event,
                targetUserId = normalizedTargetUserId,
                membership = membership,
            )
            if (weeklyOccurrence != null && !useTeamWithdrawal) {
                _errorState.value = ErrorMessage(
                    "Refunds for individual weekly registrations are not available here yet. Contact the host for help.",
                )
                return@launch
            }

            loadingHandler.showLoading("Withdrawing and Refunding ...")
            val refundResult = if (useTeamWithdrawal) {
                val team = _usersTeam.value
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
            val normalizedTargetUserId = targetUserId
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: currentUser.value.id
            val membership = resolveWithdrawTargetMembership(
                event = event,
                userId = normalizedTargetUserId,
            )
            if (membership == null) {
                _errorState.value = ErrorMessage("Selected profile is not registered for this event.")
                return@launch
            }
            if (hasEventStarted(event)) {
                _errorState.value = ErrorMessage(
                    if (canRequestPaidRefund(event, membership)) {
                        "This event has already started. Leaving is disabled. Request a refund instead."
                    } else {
                        "This event has already started. Leaving is no longer available."
                    }
                )
                return@launch
            }

            val leavingSelf = normalizedTargetUserId == currentUser.value.id
            val result = when (membership) {
                WithdrawTargetMembership.PARTICIPANT -> {
                    if (
                        leavingSelf &&
                        shouldUseRegisteredTeamWithdrawal(
                            event = event,
                            targetUserId = normalizedTargetUserId,
                            membership = membership,
                        )
                    ) {
                        loadingHandler.showLoading("Team Leaving Event ...")
                        val team = _usersTeam.value
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
        hydrateEventDetailForMobile(showDetailsOnSuccess = true)
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
        _eventTeamsAndParticipantsLoading.value = true
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
                    _selectedWeeklyOccurrenceSummary.value = if (
                        isWeeklyParentEvent(result.event) && occurrence != null && !result.weeklySelectionRequired
                    ) {
                        WeeklyOccurrenceSummary(
                            participantCount = result.participantCount,
                            participantCapacity = result.participantCapacity,
                        ).also { summary ->
                            rememberWeeklyOccurrenceSummary(occurrence, summary)
                        }
                    } else {
                        null
                    }
                }.onFailure { throwable ->
                    if (requestToken != eventDetailHydrationToken) return@onFailure
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Failed to load teams and participants."),
                    )
                }

                _eventTeamsAndParticipantsLoading.value = false

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
                    _eventTeamsAndParticipantsLoading.value = false
                    _eventMatchesLoading.value = false
                }
            }
        }
    }

    override fun toggleEdit() {
        setEventEditMode(enabled = !_isEditing.value)
    }

    override fun startEditingEvent() {
        setEventEditMode(enabled = true)
    }

    override fun cancelEditingEvent() {
        setEventEditMode(enabled = false)
    }

    private fun setEventEditMode(enabled: Boolean) {
        if (enabled && !canEditEventDetails(selectedEvent.value)) {
            _errorState.value = ErrorMessage(
                "Organization-owned events can't be edited on mobile. You can still manage matches here."
            )
            return
        }
        if (_isEditing.value == enabled) {
            return
        }
        // Initialize or reset the draft from the latest selected event when mode changes.
        val selected = selectedEvent.value
        val seededEvent = if (enabled && _sports.value.isNotEmpty()) {
            syncOfficialStaffingForSportTransition(
                previous = selected,
                updated = selected.withSportRules(),
            )
        } else {
            selected
        }
        val seededEditableFields = buildEditableFieldDrafts(
            event = seededEvent,
            sourceFields = eventFields.value.map { relation -> relation.field },
        )
        _editableLeagueScoringConfig.value = eventWithRelations.value.leagueScoringConfig?.toDto()
            ?: LeagueScoringConfigDTO()
        _editedEvent.value = seededEvent.copy(fieldIds = seededEditableFields.map { field -> field.id })
        _editableFields.value = seededEditableFields
        _fieldCount.value = seededEditableFields.size
        _editableLeagueTimeSlots.value = eventWithRelations.value.timeSlots.sortedBy { slot ->
            slot.startTimeMinutes ?: Int.MAX_VALUE
        }
        if (!enabled) {
            _pendingStaffInvites.value = emptyList()
            _suggestedUsers.value = emptyList()
        }
        _isEditing.value = enabled
    }

    override fun editEventField(update: Event.() -> Event) {
        val previous = _editedEvent.value
        _editedEvent.value = syncOfficialStaffingForSportTransition(
            previous = previous,
            updated = previous
                .update()
                .withSportRules(),
        )
    }

    override fun editTournamentField(update: Event.() -> Event) {
        val previous = _editedEvent.value
        _editedEvent.value = syncOfficialStaffingForSportTransition(
            previous = previous,
            updated = previous
                .update()
                .withSportRules(),
        )
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

        val event = _editedEvent.value
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
                    pendingStaffInvites = _pendingStaffInvites.value,
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
                _pendingStaffInvites.value = emptyList()
                _suggestedUsers.value = emptyList()
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

    override fun createTemplateFromCurrentEvent() {
        scope.launch {
            val sourceEvent = if (_isEditing.value) _editedEvent.value else selectedEvent.value
            if (sourceEvent.state.equals("TEMPLATE", ignoreCase = true)) {
                _errorState.value = ErrorMessage("This event is already a template.")
                return@launch
            }

            loadingHandler.showLoading("Creating template ...")

            val templateId = newId()
            val currentUserId = currentUser.value.id.trim().takeIf(String::isNotBlank)
            val sourceSport = resolveSport(sourceEvent.sportId)
            val templatePositions = sourceEvent.officialPositions.mapIndexed { index, position ->
                position.copy(
                    id = com.razumly.mvp.core.data.dataTypes.buildEventOfficialPositionId(
                        eventId = templateId,
                        order = index,
                        name = position.name,
                    ),
                    order = index,
                )
            }
            val templatePositionIdsByPreviousId = sourceEvent.officialPositions
                .mapIndexed { index, position -> position.id to templatePositions[index].id }
                .toMap()
            val templateEvent = sourceEvent.copy(
                id = templateId,
                name = addTemplateSuffix(sourceEvent.name),
                state = "TEMPLATE",
                hostId = currentUserId ?: sourceEvent.hostId,
                userIds = emptyList(),
                teamIds = emptyList(),
                waitListIds = emptyList(),
                freeAgentIds = emptyList(),
                officialPositions = templatePositions,
                eventOfficials = sourceEvent.eventOfficials.map { official ->
                    official.copy(
                        id = com.razumly.mvp.core.data.dataTypes.buildEventOfficialRecordId(
                            eventId = templateId,
                            userId = official.userId,
                        ),
                        positionIds = official.positionIds.mapNotNull(templatePositionIdsByPreviousId::get),
                    )
                },
            ).syncOfficialStaffing(sport = sourceSport)

            val templatePayload = prepareTemplateForCreate(templateEvent)
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
            val normalizedUserId = userId.trim().takeIf(String::isNotBlank)
            if (normalizedUserId == null) {
                _errorState.value = ErrorMessage("User id is required.")
                return@launch
            }
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
        return billingRepository.createEventTeamBill(
            eventId = normalizedEventId,
            teamId = normalizedTeamId,
            request = request,
        ).map { }
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
        return billingRepository.refundEventTeamBillPayment(
            eventId = normalizedEventId,
            teamId = normalizedTeamId,
            billPaymentId = billPaymentId,
            amountCents = amountCents,
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

    private fun usesSetScoringForSport(sportId: String?): Boolean = sportId
        ?.let { selectedSportId -> _sports.value.firstOrNull { it.id == selectedSportId } }
        ?.usePointsPerSetWin
        ?: false

    private fun resolveSport(sportId: String?): Sport? = sportId
        ?.trim()
        ?.takeIf(String::isNotBlank)
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
                matchDurationMinutes = matchDurationMinutes ?: 60,
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
                usesSets = false,
                setDurationMinutes = null,
                matchDurationMinutes = matchDurationMinutes ?: 60,
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
                matchDurationMinutes = matchDurationMinutes ?: 60,
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

    private fun generateRounds() {
        _rounds.value = buildBracketRounds(_divisionMatches.value)
    }

    override fun selectFieldCount(count: Int) {
        val normalized = count.coerceAtLeast(0)
        _fieldCount.value = normalized

        val currentEvent = _editedEvent.value
        val resized = _editableFields.value
            .take(normalized)
            .mapIndexed { index, field ->
                field.copy(
                    id = if (field.id.isBlank()) newId() else field.id,
                    fieldNumber = index + 1,
                    divisions = field.divisions
                        .normalizeDivisionIdentifiers()
                        .ifEmpty { defaultFieldDivisions(currentEvent) },
                    organizationId = resolveFieldOrganizationId(
                        fieldOrganizationId = field.organizationId,
                        eventOrganizationId = currentEvent.organizationId,
                    ),
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

        _editableFields.value = resized
        _editedEvent.value = currentEvent.copy(fieldIds = resized.map { field -> field.id })

        val validFieldIds = resized.map { field -> field.id }.toSet()
        _editableLeagueTimeSlots.value = _editableLeagueTimeSlots.value.map { slot ->
            val remainingFieldIds = slot.normalizedScheduledFieldIds().filter(validFieldIds::contains)
            slot.copy(
                scheduledFieldId = remainingFieldIds.firstOrNull(),
                scheduledFieldIds = remainingFieldIds,
            )
        }
    }

    override fun updateLocalFieldName(index: Int, name: String) {
        val fields = _editableFields.value.toMutableList()
        if (index !in fields.indices) return
        fields[index] = fields[index].copy(name = name)
        _editableFields.value = fields
    }

    override fun updateLeagueScoringConfig(update: LeagueScoringConfigDTO.() -> LeagueScoringConfigDTO) {
        _editableLeagueScoringConfig.value = _editableLeagueScoringConfig.value.update()
    }

    override fun addLeagueTimeSlot() {
        _editableLeagueTimeSlots.value = _editableLeagueTimeSlots.value + createDefaultLeagueSlot()
    }

    override fun updateLeagueTimeSlot(index: Int, update: TimeSlot.() -> TimeSlot) {
        val slots = _editableLeagueTimeSlots.value.toMutableList()
        if (index !in slots.indices) return
        slots[index] = slots[index].update()
        _editableLeagueTimeSlots.value = slots
    }

    override fun removeLeagueTimeSlot(index: Int) {
        val slots = _editableLeagueTimeSlots.value.toMutableList()
        if (index !in slots.indices) return
        slots.removeAt(index)
        _editableLeagueTimeSlots.value = slots
    }

    private data class PreparedEventForUpdate(
        val event: Event,
        val fields: List<Field>? = null,
        val timeSlots: List<TimeSlot>? = null,
        val leagueScoringConfig: LeagueScoringConfigDTO? = null,
    )

    private data class PreparedTemplateForCreate(
        val event: Event,
        val fields: List<Field>? = null,
        val timeSlots: List<TimeSlot>? = null,
        val leagueScoringConfig: LeagueScoringConfigDTO? = null,
    )

    private fun prepareTemplateForCreate(templateEvent: Event): PreparedTemplateForCreate {
        val shouldPersistFieldsAndSlots = templateEvent.eventType == EventType.LEAGUE ||
            templateEvent.eventType == EventType.TOURNAMENT ||
            templateEvent.eventType == EventType.WEEKLY_EVENT
        if (!shouldPersistFieldsAndSlots) {
            return PreparedTemplateForCreate(
                event = templateEvent,
                fields = null,
                timeSlots = null,
                leagueScoringConfig = null,
            )
        }

        val sourceFields = buildEditableFieldDrafts(
            event = templateEvent,
            sourceFields = if (_isEditing.value) {
                _editableFields.value
            } else {
                eventFields.value.map { relation -> relation.field }
            },
        )
        val sourceSlots = if (_isEditing.value) {
            _editableLeagueTimeSlots.value
        } else {
            eventWithRelations.value.timeSlots
        }

        val isOrganizationManaged = !templateEvent.organizationId.isNullOrBlank()
        val clonedFields = if (isOrganizationManaged) {
            null
        } else {
            sourceFields.mapIndexed { index, field ->
                field.copy(
                    id = newId(),
                    fieldNumber = index + 1,
                    name = field.name?.takeIf(String::isNotBlank) ?: "Field ${index + 1}",
                    divisions = field.divisions
                        .normalizeDivisionIdentifiers()
                        .ifEmpty { defaultFieldDivisions(templateEvent) },
                    organizationId = resolveFieldOrganizationId(
                        fieldOrganizationId = field.organizationId,
                        eventOrganizationId = templateEvent.organizationId,
                    ),
                )
            }
        }

        val fieldIdRemap = if (clonedFields != null) {
            sourceFields.zip(clonedFields).mapNotNull { (source, clone) ->
                val sourceId = source.id.trim().takeIf(String::isNotBlank) ?: return@mapNotNull null
                sourceId to clone.id
            }.toMap()
        } else {
            emptyMap()
        }

        val resolvedFieldIds = if (clonedFields != null) {
            clonedFields.map { field -> field.id }
        } else {
            templateEvent.fieldIds
                .map { fieldId -> fieldId.trim() }
                .filter(String::isNotBlank)
                .ifEmpty {
                    sourceFields
                        .map { field -> field.id.trim() }
                        .filter(String::isNotBlank)
                }
        }
        val resolvedFieldIdSet = resolvedFieldIds.toSet()

        val clonedTimeSlots = sourceSlots.mapNotNull { slot ->
            val mappedFieldIds = slot.normalizedScheduledFieldIds()
                .map { fieldId -> fieldIdRemap[fieldId] ?: fieldId }
                .filter(resolvedFieldIdSet::contains)
                .distinct()
            if (mappedFieldIds.isEmpty()) {
                return@mapNotNull null
            }
            val normalizedDays = slot.normalizedDaysOfWeek()
            val normalizedDivisions = slot.normalizedDivisionIds()
                .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
                .filter(String::isNotBlank)
                .distinct()
                .ifEmpty { defaultFieldDivisions(templateEvent) }
            slot.copy(
                id = newId(),
                dayOfWeek = normalizedDays.firstOrNull(),
                daysOfWeek = normalizedDays,
                divisions = normalizedDivisions,
                scheduledFieldId = mappedFieldIds.firstOrNull(),
                scheduledFieldIds = mappedFieldIds,
            )
        }

        val leagueScoringConfig = if (templateEvent.eventType == EventType.LEAGUE) {
            _editableLeagueScoringConfig.value
        } else {
            null
        }

        return PreparedTemplateForCreate(
            event = templateEvent.copy(
                fieldIds = resolvedFieldIds,
                timeSlotIds = clonedTimeSlots.map { slot -> slot.id },
            ),
            fields = clonedFields,
            timeSlots = clonedTimeSlots,
            leagueScoringConfig = leagueScoringConfig,
        )
    }

    private fun prepareEventForUpdate(): PreparedEventForUpdate {
        val eventDraft = _editedEvent.value
        val shouldPersistFields = eventDraft.eventType == EventType.LEAGUE ||
            eventDraft.eventType == EventType.TOURNAMENT ||
            eventDraft.eventType == EventType.WEEKLY_EVENT
        val preparedFields = if (shouldPersistFields) {
            buildFieldDrafts(eventDraft)
        } else {
            null
        }
        val preparedEventWithFields = if (preparedFields != null) {
            eventDraft.copy(fieldIds = preparedFields.map { field -> field.id })
        } else {
            eventDraft
        }
        val preparedLeagueScoringConfig = if (eventDraft.eventType == EventType.LEAGUE) {
            _editableLeagueScoringConfig.value
        } else {
            null
        }
        val shouldPersistTimeSlots = eventDraft.eventType == EventType.LEAGUE ||
            eventDraft.eventType == EventType.TOURNAMENT ||
            eventDraft.eventType == EventType.WEEKLY_EVENT
        if (!shouldPersistTimeSlots) {
            return PreparedEventForUpdate(
                event = preparedEventWithFields,
                fields = preparedFields,
                timeSlots = null,
                leagueScoringConfig = preparedLeagueScoringConfig,
            )
        }

        val preparedTimeSlots = buildLeagueSlotDrafts(preparedEventWithFields)
        val preparedEvent = preparedEventWithFields.copy(timeSlotIds = preparedTimeSlots.map { slot -> slot.id })
        return PreparedEventForUpdate(
            event = preparedEvent,
            fields = preparedFields,
            timeSlots = preparedTimeSlots,
            leagueScoringConfig = preparedLeagueScoringConfig,
        )
    }

    private fun buildFieldDrafts(event: Event): List<Field> {
        val drafts = _editableFields.value.mapIndexed { index, field ->
            field.copy(
                id = if (field.id.isBlank()) newId() else field.id,
                fieldNumber = index + 1,
                name = field.name?.takeIf(String::isNotBlank) ?: "Field ${index + 1}",
                divisions = field.divisions
                    .normalizeDivisionIdentifiers()
                    .ifEmpty { defaultFieldDivisions(event) },
                organizationId = resolveFieldOrganizationId(
                    fieldOrganizationId = field.organizationId,
                    eventOrganizationId = event.organizationId,
                ),
            )
        }
        _editableFields.value = drafts
        _fieldCount.value = drafts.size
        _editedEvent.value = _editedEvent.value.copy(fieldIds = drafts.map { field -> field.id })
        return drafts
    }

    private fun buildLeagueSlotDrafts(event: Event): List<TimeSlot> {
        val selectedDivisionIds = event.divisions
            .normalizeDivisionIdentifiers()
            .ifEmpty { listOf(DEFAULT_DIVISION) }
        val validFieldIds = event.fieldIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .toSet()

        return _editableLeagueTimeSlots.value.mapNotNull { slot ->
            val normalizedFieldIds = slot.normalizedScheduledFieldIds()
            val mappedFieldIds = if (validFieldIds.isEmpty()) {
                normalizedFieldIds
            } else {
                normalizedFieldIds.filter(validFieldIds::contains)
            }
            if (mappedFieldIds.isEmpty()) {
                return@mapNotNull null
            }

            val mappedDivisionIds = slot.normalizedDivisionIds()
                .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
                .filter(String::isNotBlank)
                .distinct()
            val effectiveDivisionIds = if (event.singleDivision) {
                selectedDivisionIds
            } else {
                mappedDivisionIds.ifEmpty { selectedDivisionIds }
            }

            if (!slot.repeating) {
                val slotStartDate = slot.startDate.takeUnless { it == Instant.DISTANT_PAST } ?: event.start
                val slotEndDate = slot.endDate ?: return@mapNotNull null
                if (slotEndDate <= slotStartDate) {
                    return@mapNotNull null
                }
                val slotDayOfWeek = slotStartDate.toMondayFirstDay()
                return@mapNotNull slot.copy(
                    id = slot.id.ifBlank { newId() },
                    dayOfWeek = slotDayOfWeek,
                    daysOfWeek = listOf(slotDayOfWeek),
                    divisions = effectiveDivisionIds,
                    scheduledFieldId = mappedFieldIds.first(),
                    scheduledFieldIds = mappedFieldIds,
                    startDate = slotStartDate,
                    endDate = slotEndDate,
                    startTimeMinutes = slotStartDate.toMinutesOfDay(),
                    endTimeMinutes = slotEndDate.toMinutesOfDay(),
                    repeating = false,
                )
            }

            val normalizedDays = slot.normalizedDaysOfWeek()
            val startMinutes = slot.startTimeMinutes
            val endMinutes = slot.endTimeMinutes
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
                slot.endDate?.toDateOnlyInstant()
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

    private fun buildEditableFieldDrafts(
        event: Event,
        sourceFields: List<Field>,
    ): List<Field> {
        val sourceById = sourceFields.associateBy { field -> field.id.trim() }
        val orderedEventFieldIds = event.fieldIds
            .map { fieldId -> fieldId.trim() }
            .filter(String::isNotBlank)
            .distinct()
        val baseFields = if (orderedEventFieldIds.isNotEmpty()) {
            orderedEventFieldIds.mapIndexed { index, fieldId ->
                sourceById[fieldId] ?: Field(
                    fieldNumber = index + 1,
                    organizationId = event.organizationId,
                    id = fieldId,
                ).copy(name = "Field ${index + 1}")
            }
        } else {
            sourceFields
                .sortedBy { field -> field.fieldNumber }
                .ifEmpty {
                    emptyList()
                }
        }

        return baseFields.mapIndexed { index, field ->
            field.copy(
                id = field.id.trim().takeIf(String::isNotBlank) ?: newId(),
                fieldNumber = index + 1,
                name = field.name?.takeIf(String::isNotBlank) ?: "Field ${index + 1}",
                divisions = field.divisions
                    .normalizeDivisionIdentifiers()
                    .ifEmpty { defaultFieldDivisions(event) },
                organizationId = field.organizationId?.trim()?.takeIf(String::isNotBlank) ?: event.organizationId,
            )
        }
    }

    private fun defaultFieldDivisions(event: Event): List<String> {
        val eventDivisions = event.divisions.normalizeDivisionIdentifiers()
        return eventDivisions.ifEmpty { listOf(DEFAULT_DIVISION) }
    }

    private fun resolveFieldOrganizationId(
        fieldOrganizationId: String?,
        eventOrganizationId: String?,
    ): String? {
        return fieldOrganizationId
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: eventOrganizationId?.trim()?.takeIf(String::isNotBlank)
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

    private fun LeagueScoringConfig.toDto(): LeagueScoringConfigDTO = LeagueScoringConfigDTO(
        pointsForWin = pointsForWin,
        pointsForDraw = pointsForDraw,
        pointsForLoss = pointsForLoss,
        pointsPerSetWin = pointsPerSetWin,
        pointsPerSetLoss = pointsPerSetLoss,
        pointsPerGameWin = pointsPerGameWin,
        pointsPerGameLoss = pointsPerGameLoss,
        pointsPerGoalScored = pointsPerGoalScored,
        pointsPerGoalConceded = pointsPerGoalConceded,
    )

    private fun createDefaultLeagueSlot(): TimeSlot {
        val event = _editedEvent.value
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
            repeating = true,
            endDate = endDate,
            scheduledFieldId = null,
            scheduledFieldIds = emptyList(),
            price = null,
        )
    }

    private fun Event.defaultLeagueSlotEndDate(): Instant? {
        if (eventType == EventType.WEEKLY_EVENT || noFixedEndDateTime) {
            return null
        }
        return end
            .takeIf { value -> value > start }
            ?.toDateOnlyInstant()
    }

    private fun Instant.toDateOnlyInstant(): Instant {
        val timezone = TimeZone.currentSystemDefault()
        val localDate = toLocalDateTime(timezone).date
        return localDate.atStartOfDayIn(timezone)
    }

    private fun Instant.toMinutesOfDay(): Int {
        val localTime = toLocalDateTime(TimeZone.currentSystemDefault()).time
        return localTime.hour * 60 + localTime.minute
    }

    private fun Instant.toMondayFirstDay(): Int {
        val isoDay = toLocalDateTime(TimeZone.currentSystemDefault()).date.dayOfWeek.isoDayNumber
        return (isoDay - 1).mod(7)
    }

    private fun buildBracketRounds(
        matchesById: Map<String, MatchWithRelations>,
    ): List<List<MatchWithRelations?>> {
        if (matchesById.isEmpty()) {
            return emptyList()
        }

        val rounds = mutableListOf<List<MatchWithRelations?>>()
        val visited = mutableSetOf<String>()

        fun nextInScope(matchId: String?): MatchWithRelations? {
            val normalizedId = normalizeToken(matchId) ?: return null
            return matchesById[normalizedId]
        }

        val finalRound = matchesById.values.filter { match ->
            nextInScope(match.match.winnerNextMatchId) == null &&
                nextInScope(match.match.loserNextMatchId) == null
        }

        if (finalRound.isNotEmpty()) {
            rounds += finalRound
            visited += finalRound.map { match -> match.match.id }
        }

        var currentRound: List<MatchWithRelations?> = finalRound
        while (currentRound.isNotEmpty()) {
            val nextRound = mutableListOf<MatchWithRelations?>()

            currentRound.filterNotNull().forEach { match ->
                if (!shouldIncludeInCurrentBracket(match, matchesById)) {
                    nextRound += listOf(null, null)
                    return@forEach
                }

                val leftId = normalizeToken(match.match.previousLeftId)
                val rightId = normalizeToken(match.match.previousRightId)

                val leftMatch = leftId?.let { id -> matchesById[id] }
                if (leftMatch == null) {
                    nextRound += null
                } else if (visited.add(leftMatch.match.id)) {
                    nextRound += leftMatch
                }

                val rightMatch = rightId?.let { id -> matchesById[id] }
                if (rightMatch == null) {
                    nextRound += null
                } else if (visited.add(rightMatch.match.id)) {
                    nextRound += rightMatch
                }
            }

            if (nextRound.any { it != null }) {
                rounds += nextRound
                currentRound = nextRound
            } else {
                break
            }
        }

        return rounds.reversed()
    }

    private fun shouldIncludeInCurrentBracket(
        match: MatchWithRelations,
        matchesById: Map<String, MatchWithRelations>,
    ): Boolean {
        if (!losersBracket.value) {
            return !match.match.losersBracket
        }

        val left = normalizeToken(match.match.previousLeftId)?.let { id -> matchesById[id] }
        val right = normalizeToken(match.match.previousRightId)?.let { id -> matchesById[id] }

        val finalsMatch = left != null && right != null && left.match.id == right.match.id
        val mergeMatch = left != null && right != null && left.match.losersBracket != right.match.losersBracket
        val opposite = match.match.losersBracket != losersBracket.value
        val firstRound = left == null && right == null

        return finalsMatch || mergeMatch || !opposite || firstRound
    }

    override fun checkIsUserWaitListed(event: Event): Boolean {
        if (isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() == null) {
            return false
        }
        val cachedState = resolveCachedCurrentUserRegistrationMembership(event)
        if (cachedState != null) {
            return cachedState.waitlist
        }
        val userTeamIds = currentUserTeamIds()
        return event.waitList.any { participant ->
            participant == currentUser.value.id || userTeamIds.contains(participant)
        }
    }

    override fun deleteEvent() {
        scope.launch {
            val currentEvent = selectedEvent.value
            val isTemplateEvent = currentEvent.state.equals("TEMPLATE", ignoreCase = true)
            var deleted = false
            if (isTemplateEvent || !currentEvent.hasAnyPaidDivision()) {
                loadingHandler.showLoading(if (isTemplateEvent) "Deleting Template ..." else "Deleting Event ...")
                eventRepository.deleteEvent(selectedEvent.value.id)
                    .onSuccess {
                        deleted = true
                    }.onFailure {
                        _errorState.value = ErrorMessage(it.userMessage())
                    }
            } else {
                loadingHandler.showLoading("Deleting Event and Refunding ...")
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

    override fun shareEvent() {
        val shareService = shareServiceProvider.getShareService()
        shareService.share(
            selectedEvent.value.name, createEventUrl(selectedEvent.value)
        )
    }

    override fun openEventDirections() {
        val targetEvent = selectedEvent.value
        val destinationQuery = when {
            !targetEvent.address.isNullOrBlank() -> {
                targetEvent.address.trim()
            }
            targetEvent.lat != 0.0 || targetEvent.long != 0.0 -> {
                "${targetEvent.lat},${targetEvent.long}"
            }
            else -> {
                _errorState.value = ErrorMessage("No event location available for directions.")
                return
            }
        }

        val directionsUrl = "geo:0,0?q=${destinationQuery.encodeURLQueryComponent()}"

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
        if (isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() == null) {
            return false
        }
        val cachedState = resolveCachedCurrentUserRegistrationMembership(event)
        if (cachedState != null) {
            return cachedState.freeAgent
        }
        val userTeamIds = currentUserTeamIds()
        return event.freeAgents.any { participant ->
            participant == currentUser.value.id || userTeamIds.contains(participant)
        }
    }

    private fun TeamWithPlayers.isActiveMembershipForUser(userTeamIds: Set<String>): Boolean {
        val team = team
        if (team.isPlaceholderSlot()) {
            return false
        }
        val normalizedTeamId = team.id.trim()
        val parentTeamId = team.parentTeamId?.trim()?.takeIf(String::isNotBlank)
        return (parentTeamId != null && userTeamIds.contains(parentTeamId)) ||
            userTeamIds.contains(normalizedTeamId)
    }

    private fun checkIsUserParticipant(event: Event): Boolean {
        if (isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() == null) {
            return false
        }
        val cachedState = resolveCachedCurrentUserRegistrationMembership(event)
        if (cachedState != null) {
            return cachedState.participant
        }
        return isUserParticipantInEventSnapshot(
            event = event,
            currentUserId = currentUser.value.id,
            currentUserTeamIds = currentUserTeamIds(),
        )
    }

    private fun checkIsUserCaptain(): Boolean {
        return _usersTeam.value?.team?.captainId == currentUser.value.id ||
            _usersTeam.value?.team?.managerId == currentUser.value.id
    }

    private fun checkIsUserInEvent(event: Event): Boolean {
        return checkIsUserParticipant(event) || checkIsUserFreeAgent(event) || checkIsUserWaitListed(
            event
        )
    }

    private suspend fun refreshCurrentUserMembershipState(event: Event) {
        val weeklyParentWithoutSelection =
            isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() == null
        if (weeklyParentWithoutSelection) {
            _isUserInEvent.value = false
            _isUserInWaitlist.value = false
            _isUserFreeAgent.value = false
            _isUserCaptain.value = false
            _usersTeam.value = null
            _withdrawTargets.value = emptyList()
            return
        }

        val cachedState = resolveCachedCurrentUserRegistrationMembership(event)
        if (cachedState != null) {
            _isUserInEvent.value = cachedState.participant || cachedState.waitlist || cachedState.freeAgent
            _isUserInWaitlist.value = cachedState.waitlist
            _isUserFreeAgent.value = cachedState.freeAgent
            _usersTeam.value = cachedState.teamId
                ?.let { teamId -> teamRepository.getTeamWithPlayers(teamId).getOrNull() }
            _isUserCaptain.value = checkIsUserCaptain()
            return
        }

        _isUserInEvent.value = checkIsUserInEvent(event)
        _isUserInWaitlist.value = checkIsUserWaitListed(event)
        _isUserFreeAgent.value = checkIsUserFreeAgent(event)
        if (_isUserInEvent.value) {
            val currentTeamIds = currentUserTeamIds()
            val participantTeamId = matchingParticipantTeamId(event, currentTeamIds)
            val waitlistedTeamId = event.waitList
                .map(String::trim)
                .firstOrNull { teamId -> teamId.isNotBlank() && currentTeamIds.contains(teamId) }
            val freeAgentTeamId = event.freeAgents
                .map(String::trim)
                .firstOrNull { teamId -> teamId.isNotBlank() && currentTeamIds.contains(teamId) }
            _usersTeam.value =
                participantTeamId
                    ?.let { teamId -> teamRepository.getTeamWithPlayers(teamId).getOrNull() }
                    ?: waitlistedTeamId
                        ?.let { teamId -> teamRepository.getTeamWithPlayers(teamId).getOrNull() }
                    ?: freeAgentTeamId
                        ?.let { teamId -> teamRepository.getTeamWithPlayers(teamId).getOrNull() }
        } else {
            _usersTeam.value = null
        }
        _isUserCaptain.value = checkIsUserCaptain()
    }

    private fun resolveCachedCurrentUserRegistrationMembership(
        event: Event,
    ): CurrentUserRegistrationMembershipState? {
        val registrations = cachedCurrentUserRegistrations.value
        if (registrations.isEmpty()) {
            return null
        }

        val selectedOccurrence = currentWeeklyOccurrenceSelection()
        val currentUserId = currentUser.value.id.trim()
        val currentUserTeamIds = currentUserTeamIds()
        val matchingRegistrations = registrations.filter { registration ->
            if (!registration.isActiveForMembership()) {
                return@filter false
            }
            val matchesRegistrant = when (registration.registrantType.trim().uppercase()) {
                "SELF" -> currentUserId.isNotBlank() && registration.registrantId == currentUserId
                "TEAM" -> currentUserTeamIds.contains(registration.registrantId)
                else -> false
            }
            if (!matchesRegistrant) {
                return@filter false
            }

            if (isWeeklyParentEvent(event)) {
                selectedOccurrence != null &&
                    registration.slotId == selectedOccurrence.slotId &&
                    registration.occurrenceDate == selectedOccurrence.occurrenceDate
            } else {
                registration.slotId.isNullOrBlank() && registration.occurrenceDate.isNullOrBlank()
            }
        }
        if (matchingRegistrations.isEmpty()) {
            return CurrentUserRegistrationMembershipState()
        }

        val participant = matchingRegistrations.any { registration ->
            registration.normalizedRosterRole() == "PARTICIPANT"
        }
        val waitlist = matchingRegistrations.any { registration ->
            registration.normalizedRosterRole() == "WAITLIST"
        }
        val freeAgent = matchingRegistrations.any { registration ->
            registration.normalizedRosterRole() == "FREE_AGENT"
        }
        val teamId = matchingRegistrations
            .firstOrNull { registration -> registration.registrantType.trim().uppercase() == "TEAM" }
            ?.registrantId

        return CurrentUserRegistrationMembershipState(
            participant = participant,
            waitlist = waitlist,
            freeAgent = freeAgent,
            teamId = teamId,
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

        _withdrawTargets.value = targets.values.toList()
    }

    private fun resolveWithdrawTargetMembership(
        event: Event,
        userId: String,
    ): WithdrawTargetMembership? {
        if (isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() == null) {
            return null
        }
        if (userId == currentUser.value.id) {
            resolveCachedCurrentUserRegistrationMembership(event)?.let { cachedState ->
                return when {
                    cachedState.participant -> WithdrawTargetMembership.PARTICIPANT
                    cachedState.waitlist -> WithdrawTargetMembership.WAITLIST
                    cachedState.freeAgent -> WithdrawTargetMembership.FREE_AGENT
                    else -> null
                }
            }
        }
        return when {
            event.playerIds.contains(userId) -> WithdrawTargetMembership.PARTICIPANT
            event.waitList.contains(userId) -> WithdrawTargetMembership.WAITLIST
            event.freeAgents.contains(userId) -> WithdrawTargetMembership.FREE_AGENT
            event.teamSignup && userId == currentUser.value.id -> {
                val userTeamIds = currentUserTeamIds()
                when {
                    matchingParticipantTeamId(event, userTeamIds) != null ->
                        WithdrawTargetMembership.PARTICIPANT
                    event.waitList.any { teamId -> userTeamIds.contains(teamId) } ->
                        WithdrawTargetMembership.WAITLIST
                    event.freeAgents.any { teamId -> userTeamIds.contains(teamId) } ->
                        WithdrawTargetMembership.FREE_AGENT
                    else -> null
                }
            }
            else -> null
        }
    }

    private fun currentUserTeamIds(): Set<String> {
        val teamIdsFromProfile = currentUser.value.teamIds
            .map(String::trim)
            .filter(String::isNotBlank)
        val activeTeamId = _usersTeam.value?.team?.id
            ?.trim()
            ?.takeIf(String::isNotBlank)
        return (teamIdsFromProfile + listOfNotNull(activeTeamId)).toSet()
    }

    private data class EffectivePaymentPlan(
        val priceCents: Int,
        val allowPaymentPlans: Boolean,
        val installmentAmounts: List<Int>,
        val installmentDueDates: List<String>,
    )

    private fun resolveSelectedDivisionDetail(
        event: Event,
        preferredDivisionId: String?,
    ): DivisionDetail? {
        if (event.divisions.isEmpty()) {
            return null
        }
        val normalizedPreferredDivision = preferredDivisionId
            ?.normalizeDivisionIdentifier()
            ?.ifEmpty { null }
        val divisionDetails = mergeDivisionDetailsForDivisions(
            divisions = event.divisions,
            existingDetails = event.divisionDetails,
            eventId = event.id,
        )
        if (divisionDetails.isEmpty()) {
            return null
        }
        return if (!normalizedPreferredDivision.isNullOrBlank()) {
            divisionDetails.firstOrNull { detail ->
                divisionsEquivalent(detail.id, normalizedPreferredDivision) ||
                    divisionsEquivalent(detail.key, normalizedPreferredDivision)
            } ?: divisionDetails.firstOrNull()
        } else {
            divisionDetails.firstOrNull()
        }
    }

    private fun resolveEffectivePaymentPlan(
        event: Event,
        preferredDivisionId: String?,
    ): EffectivePaymentPlan {
        val selectedDivision = resolveSelectedDivisionDetail(event, preferredDivisionId)
        val allowPaymentPlans = when (selectedDivision?.allowPaymentPlans) {
            null -> event.allowPaymentPlans == true
            else -> selectedDivision.allowPaymentPlans == true
        }

        return EffectivePaymentPlan(
            priceCents = event.resolvedDivisionPriceCents(preferredDivisionId),
            allowPaymentPlans = allowPaymentPlans,
            installmentAmounts = if (allowPaymentPlans) {
                val configuredAmounts = selectedDivision?.installmentAmounts
                    ?.takeIf { amounts -> amounts.isNotEmpty() }
                    ?: event.installmentAmounts
                configuredAmounts.map { amount -> amount.coerceAtLeast(0) }
            } else {
                emptyList()
            },
            installmentDueDates = if (allowPaymentPlans) {
                val configuredDueDates = selectedDivision?.installmentDueDates
                    ?.takeIf { dueDates -> dueDates.isNotEmpty() }
                    ?: event.installmentDueDates
                configuredDueDates
                    .map { dueDate -> dueDate.trim() }
                    .filter(String::isNotBlank)
            } else {
                emptyList()
            },
        )
    }

    private fun checkEventIsFull(
        event: Event,
        teams: List<TeamWithPlayers>,
        preferredDivisionId: String?,
    ): Boolean {
        val selectedDivision = resolveSelectedDivisionDetail(event, preferredDivisionId)
        val maxParticipants = if (event.singleDivision) {
            event.maxParticipants
        } else {
            selectedDivision?.maxParticipants ?: event.maxParticipants
        }

        if (maxParticipants <= 0) {
            return false
        }

        val participantCount = if (event.teamSignup) {
            val divisionId = selectedDivision?.id?.normalizeDivisionIdentifier()?.takeIf(String::isNotBlank)
            val divisionKey = selectedDivision?.key?.normalizeDivisionIdentifier()?.takeIf(String::isNotBlank)
            val shouldFilterDivision = !event.singleDivision && (divisionId != null || divisionKey != null)
            teams.count { teamWithPlayers ->
                val team = teamWithPlayers.team
                !team.isPlaceholderSlot(event.eventType) && (
                    !shouldFilterDivision ||
                        (divisionId != null && divisionsEquivalent(team.division, divisionId)) ||
                        (divisionKey != null && divisionsEquivalent(team.division, divisionKey))
                )
            }
        } else {
            event.playerIds.size
        }

        return participantCount >= maxParticipants
    }

    override fun showFeeBreakdown(
        feeBreakdown: FeeBreakdown, onConfirm: () -> Unit, onCancel: () -> Unit
    ) {
        _currentFeeBreakdown.value = feeBreakdown
        _showFeeBreakdown.value = true
        pendingPaymentAction = onConfirm
    }

    override fun dismissFeeBreakdown() {
        _showFeeBreakdown.value = false
        _currentFeeBreakdown.value = null
        pendingPaymentAction = null
    }

    override fun confirmFeeBreakdown() {
        pendingPaymentAction?.invoke()
        dismissFeeBreakdown()
    }

    override fun dismissPaymentPlanPreviewDialog() {
        _paymentPlanPreviewDialog.value = null
        pendingPaymentPlanPreviewAction = null
    }

    override fun confirmPaymentPlanPreviewDialog() {
        val continuation = pendingPaymentPlanPreviewAction
        dismissPaymentPlanPreviewDialog()
        continuation?.invoke()
    }

    override fun confirmTextSignature() {
        val prompt = _textSignaturePrompt.value ?: return

        scope.launch {
            loadingHandler.showLoading("Recording signature ...")

            val documentId = prompt.step.resolvedDocumentId()
                ?: "mobile-text-${prompt.step.templateId}-${Clock.System.now().toEpochMilliseconds()}"

            billingRepository.recordSignature(
                eventId = selectedEvent.value.id,
                templateId = prompt.step.templateId,
                documentId = documentId,
                type = prompt.step.type,
            ).onFailure { throwable ->
                Napier.e("Failed to record signature.", throwable)
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to record signature.")
                )
            }.onSuccess {
                completedSignatureKeys += signatureCompletionKey(
                    templateId = prompt.step.templateId,
                    signerContext = pendingSignatureContext,
                    child = pendingSignatureChild,
                )
                _textSignaturePrompt.value = null
                pendingSignatureStepIndex += 1
                processNextSignatureStep()
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
                    _billingAddressPrompt.value = null
                    val action = pendingBillingAddressAction
                    pendingBillingAddressAction = null
                    action?.invoke()
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.userMessage("Unable to save billing address."))
                }
            loadingHandler.hideLoading()
        }
    }

    override fun dismissBillingAddressPrompt() {
        _billingAddressPrompt.value = null
        pendingBillingAddressAction = null
    }

    private fun refreshEditableRounds() {
        val editable = _editableMatches.value
        if (editable.isEmpty()) {
            _editableRounds.value = emptyList()
            return
        }

        val activeDivision = selectedDivision.value
        val divisionScopedMatches = if (!selectedEvent.value.singleDivision && !activeDivision.isNullOrEmpty()) {
            editable.filter { relation ->
                divisionsEquivalent(relation.match.division, activeDivision)
            }
        } else {
            editable
        }

        val bracketMatches = divisionScopedMatches.filter { relation ->
            !(
                relation.previousRightMatch == null &&
                    relation.previousLeftMatch == null &&
                    relation.winnerNextMatch == null &&
                    relation.loserNextMatch == null
                )
        }

        if (bracketMatches.isEmpty()) {
            _editableRounds.value = emptyList()
            return
        }

        val matchesById = bracketMatches.associateBy { match -> match.match.id }
        _editableRounds.value = buildBracketRounds(matchesById)
    }

    private fun buildBracketNodes(matches: List<MatchWithRelations>): List<BracketNode> {
        return matches.map { relation ->
            val match = relation.match
            BracketNode(
                id = match.id,
                matchId = match.matchId,
                previousLeftId = normalizeToken(match.previousLeftId),
                previousRightId = normalizeToken(match.previousRightId),
                winnerNextMatchId = normalizeToken(match.winnerNextMatchId),
                loserNextMatchId = normalizeToken(match.loserNextMatchId),
            )
        }
    }

    private fun normalizeEditableBracketGraph(matches: List<MatchWithRelations>): List<MatchWithRelations> {
        if (matches.isEmpty()) {
            return matches
        }
        val graphValidation = validateAndNormalizeBracketGraph(buildBracketNodes(matches))
        if (!graphValidation.ok) {
            return matches
        }

        val withNormalizedPrevious = matches.map { relation ->
            val match = relation.match
            val normalizedNode = graphValidation.normalizedById[match.id] ?: return@map relation
            val normalizedPreviousLeftId = normalizeToken(normalizedNode.previousLeftId)
            val normalizedPreviousRightId = normalizeToken(normalizedNode.previousRightId)
            val currentPreviousLeftId = normalizeToken(match.previousLeftId)
            val currentPreviousRightId = normalizeToken(match.previousRightId)

            if (currentPreviousLeftId == normalizedPreviousLeftId &&
                currentPreviousRightId == normalizedPreviousRightId
            ) {
                relation
            } else {
                relation.copy(
                    match = match.copy(
                        previousLeftId = normalizedPreviousLeftId,
                        previousRightId = normalizedPreviousRightId,
                    ),
                    previousLeftMatch = null,
                    previousRightMatch = null,
                )
            }
        }

        val matchesById = withNormalizedPrevious.associateBy { relation -> relation.match.id }
        return withNormalizedPrevious.map { relation ->
            val match = relation.match
            relation.copy(
                winnerNextMatch = normalizeToken(match.winnerNextMatchId)?.let { id -> matchesById[id]?.match },
                loserNextMatch = normalizeToken(match.loserNextMatchId)?.let { id -> matchesById[id]?.match },
                previousLeftMatch = normalizeToken(match.previousLeftId)?.let { id -> matchesById[id]?.match },
                previousRightMatch = normalizeToken(match.previousRightId)?.let { id -> matchesById[id]?.match },
            )
        }
    }

    private fun nextEditableMatchNumber(): Int {
        val maxMatchId = _editableMatches.value.maxOfOrNull { relation -> relation.match.matchId } ?: 0
        return maxMatchId + 1
    }

    private fun placeholderCount(): Int {
        return _editableMatches.value.count { relation ->
            val team1Id = normalizeToken(relation.match.team1Id)
            val team2Id = normalizeToken(relation.match.team2Id)
            (team1Id?.startsWith(LOCAL_PLACEHOLDER_PREFIX) == true) ||
                (team2Id?.startsWith(LOCAL_PLACEHOLDER_PREFIX) == true)
        }
    }

    private fun createStagedMatch(
        creationContext: MatchCreateContext,
        seed: MatchMVP? = null,
        openEditor: Boolean = false,
    ): MatchWithRelations? {
        if (!canEditMatchesNow()) {
            return null
        }

        val event = selectedEvent.value
        val clientId = newId()
        val matchDocId = "$CLIENT_MATCH_PREFIX$clientId"
        val isTournamentEvent = event.eventType == EventType.TOURNAMENT
        val defaultDivision = normalizeToken(seed?.division)
            ?: normalizeToken(selectedDivision.value)
            ?: event.divisions.firstOrNull()?.normalizeDivisionIdentifier()
        val now = Clock.System.now()
        val placeholderSuffix = placeholderCount() + 1
        val placeholderId = "$LOCAL_PLACEHOLDER_PREFIX$placeholderSuffix"

        val match = MatchMVP(
            id = matchDocId,
            matchId = nextEditableMatchNumber(),
            team1Id = if (isTournamentEvent) placeholderId else null,
            team2Id = null,
            team1Seed = seed?.team1Seed,
            team2Seed = seed?.team2Seed,
            eventId = event.id,
            officialId = null,
            fieldId = if (creationContext == MatchCreateContext.SCHEDULE) normalizeToken(seed?.fieldId) else null,
            start = if (creationContext == MatchCreateContext.SCHEDULE) (seed?.start ?: now) else null,
            end = if (creationContext == MatchCreateContext.SCHEDULE) {
                seed?.end ?: seed?.start?.plus(1.hours) ?: now.plus(1.hours)
            } else {
                null
            },
            division = defaultDivision,
            team1Points = emptyList(),
            team2Points = emptyList(),
            setResults = emptyList(),
            side = seed?.side,
            losersBracket = seed?.losersBracket ?: false,
            winnerNextMatchId = normalizeToken(seed?.winnerNextMatchId),
            loserNextMatchId = normalizeToken(seed?.loserNextMatchId),
            previousLeftId = normalizeToken(seed?.previousLeftId),
            previousRightId = normalizeToken(seed?.previousRightId),
            officialCheckedIn = false,
            teamOfficialId = null,
            locked = false,
        )
        val relation = MatchWithRelations(
            match = match,
            field = null,
            team1 = null,
            team2 = null,
            teamOfficial = null,
            winnerNextMatch = null,
            loserNextMatch = null,
            previousLeftMatch = null,
            previousRightMatch = null,
        )

        _editableMatches.value = _editableMatches.value + relation
        _stagedMatchCreates.value = _stagedMatchCreates.value + (
            matchDocId to StagedMatchCreateMeta(
                clientId = clientId,
                creationContext = creationContext,
                autoPlaceholderTeam = isTournamentEvent,
            )
            )
        refreshEditableRounds()

        if (openEditor) {
            pendingCreateMatchId = matchDocId
            showMatchEditDialog(
                match = relation,
                creationContext = creationContext,
                isCreateMode = true,
            )
        }
        return relation
    }

    override fun startEditingMatches() {
        if (!canManageMatchEditing()) {
            return
        }
        scope.launch {
            val currentMatches = eventWithRelations.value.matches
            _editableMatches.value = currentMatches.map { matchRelation ->
                matchRelation.copy(match = matchRelation.match.copy())
            }
            _stagedMatchCreates.value = emptyMap()
            _stagedMatchDeletes.value = emptySet()
            pendingCreateMatchId = null
            refreshEditableRounds()
            _isEditingMatches.value = true
        }
    }

    override fun cancelEditingMatches() {
        _isEditingMatches.value = false
        _editableMatches.value = emptyList()
        _editableRounds.value = emptyList()
        _stagedMatchCreates.value = emptyMap()
        _stagedMatchDeletes.value = emptySet()
        pendingCreateMatchId = null
        _showTeamSelectionDialog.value = null
    }

    override fun commitMatchChanges() {
        if (!canEditMatchesNow()) {
            return
        }
        scope.launch {
            val matches = _editableMatches.value

            val validationResult = validateMatches(matches)
            if (!validationResult.isValid) {
                _errorState.value = ErrorMessage(validationResult.errorMessage)
                return@launch
            }

            loadingHandler.showLoading("Updating matches...")

            try {
                val stagedCreates = _stagedMatchCreates.value
                val updates = matches
                    .map { relation -> relation.match }
                    .filterNot { match -> isClientMatchId(match.id) }
                val creates = matches
                    .mapNotNull { relation ->
                        val match = relation.match
                        if (!isClientMatchId(match.id)) {
                            return@mapNotNull null
                        }
                        val meta = stagedCreates[match.id] ?: StagedMatchCreateMeta(
                            clientId = extractClientId(match.id),
                            creationContext = MatchCreateContext.BRACKET,
                            autoPlaceholderTeam = selectedEvent.value.eventType == EventType.TOURNAMENT,
                        )
                        StagedMatchCreate(
                            clientId = meta.clientId,
                            match = match,
                            creationContext = meta.creationContext.name.lowercase(),
                            autoPlaceholderTeam = meta.autoPlaceholderTeam,
                        )
                    }
                val deletes = _stagedMatchDeletes.value.toList()
                matchRepository.updateMatchesBulk(updates, creates, deletes).getOrThrow()

                _isEditingMatches.value = false
                _editableMatches.value = emptyList()
                _editableRounds.value = emptyList()
                _stagedMatchCreates.value = emptyMap()
                _stagedMatchDeletes.value = emptySet()
                pendingCreateMatchId = null
                loadingHandler.hideLoading()
            } catch (e: Exception) {
                _errorState.value = ErrorMessage(e.userMessage("Failed to update matches"))
                loadingHandler.hideLoading()
            }
        }
    }

    override fun updateEditableMatch(matchId: String, updater: (MatchMVP) -> MatchMVP) {
        val currentMatches = _editableMatches.value.toMutableList()
        val matchIndex = currentMatches.indexOfFirst { it.match.id == matchId }

        if (matchIndex != -1) {
            val currentMatch = currentMatches[matchIndex]
            val updatedMatch = currentMatch.copy(match = updater(currentMatch.match))
            currentMatches[matchIndex] = updatedMatch
            _editableMatches.value = normalizeEditableBracketGraph(currentMatches)
            refreshEditableRounds()
        }
    }

    override fun setLockForEditableMatches(matchIds: List<String>, locked: Boolean) {
        if (!canEditMatchesNow()) return
        if (matchIds.isEmpty()) return
        val targetIds = matchIds.map(String::trim).filter(String::isNotBlank).toSet()
        if (targetIds.isEmpty()) return

        val nextMatches = _editableMatches.value.map { match ->
            if (targetIds.contains(match.match.id)) {
                match.copy(match = match.match.copy(locked = locked))
            } else {
                match
            }
        }
        _editableMatches.value = nextMatches
        refreshEditableRounds()
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
        val normalizedAnchorId = normalizeToken(anchorMatchId) ?: return
        val anchor = _editableMatches.value.firstOrNull { relation ->
            relation.match.id == normalizedAnchorId
        } ?: return

        val staged = createStagedMatch(
            creationContext = MatchCreateContext.BRACKET,
            seed = MatchMVP(
                id = "seed",
                matchId = 0,
                eventId = anchor.match.eventId,
                division = anchor.match.division,
                losersBracket = anchor.match.losersBracket,
                winnerNextMatchId = if (slot == BracketAddSlot.FINAL_WINNER_NEXT) null else normalizedAnchorId,
                previousLeftId = if (slot == BracketAddSlot.FINAL_WINNER_NEXT) normalizedAnchorId else null,
                previousRightId = null,
            ),
            openEditor = false,
        ) ?: return

        updateEditableMatch(normalizedAnchorId) { match ->
            when (slot) {
                BracketAddSlot.PREVIOUS_LEFT -> match.copy(previousLeftId = staged.match.id)
                BracketAddSlot.PREVIOUS_RIGHT -> match.copy(previousRightId = staged.match.id)
                BracketAddSlot.FINAL_WINNER_NEXT -> match.copy(winnerNextMatchId = staged.match.id)
            }
        }
    }

    override fun showTeamSelection(matchId: String, position: TeamPosition) {
        val availableTeams = eventWithRelations.value.teams
        _showTeamSelectionDialog.value = TeamSelectionDialogState(
            matchId = matchId, position = position, availableTeams = availableTeams
        )
    }

    override fun selectTeamForMatch(matchId: String, position: TeamPosition, teamId: String?) {
        updateEditableMatch(matchId) { match ->
            when (position) {
                TeamPosition.TEAM1 -> match.copy(team1Id = teamId)
                TeamPosition.TEAM2 -> match.copy(team2Id = teamId)
                TeamPosition.OFFICIAL -> match.copy(teamOfficialId = teamId)
            }
        }
        _showTeamSelectionDialog.value = null
    }

    override fun dismissTeamSelection() {
        _showTeamSelectionDialog.value = null
    }

    private fun validateMatches(matches: List<MatchWithRelations>): ValidationResult {
        for (i in matches.indices) {
            for (j in i + 1 until matches.size) {
                val match1 = matches[i].match
                val match2 = matches[j].match

                if (doMatchesOverlap(match1, match2)) {
                    if (match1.fieldId != null && match1.fieldId == match2.fieldId) {
                        return ValidationResult(
                            isValid = false,
                            errorMessage = "Matches #${match1.matchId} and #${match2.matchId} overlap on the same field"
                        )
                    }

                    val match1Teams = setOfNotNull(match1.team1Id, match1.team2Id, match1.teamOfficialId)
                    val match2Teams = setOfNotNull(match2.team1Id, match2.team2Id, match2.teamOfficialId)
                    val sharedTeams = match1Teams.intersect(match2Teams)

                    if (sharedTeams.isNotEmpty()) {
                        return ValidationResult(
                            isValid = false,
                            errorMessage = "Matches #${match1.matchId} and #${match2.matchId} have overlapping participants"
                        )
                    }
                }
            }
        }
        val graphValidation = validateAndNormalizeBracketGraph(buildBracketNodes(matches))
        if (!graphValidation.ok) {
            return ValidationResult(
                isValid = false,
                errorMessage = graphValidation.errors.firstOrNull()?.message
                    ?: "Invalid bracket graph.",
            )
        }

        val isTournament = selectedEvent.value.eventType == EventType.TOURNAMENT
        val stagedCreates = _stagedMatchCreates.value
        matches.forEach { relation ->
            val match = relation.match
            if (!isClientMatchId(match.id)) {
                return@forEach
            }
            val createMeta = stagedCreates[match.id] ?: return@forEach

            if (createMeta.creationContext == MatchCreateContext.SCHEDULE) {
                val start = match.start
                val end = match.end
                if (normalizeToken(match.fieldId) == null || start == null || end == null) {
                    return ValidationResult(
                        isValid = false,
                        errorMessage = "Schedule match #${match.matchId} requires field, start, and end.",
                    )
                }
                if (end <= start) {
                    return ValidationResult(
                        isValid = false,
                        errorMessage = "Schedule match #${match.matchId} requires end after start.",
                    )
                }
            }

            if (isTournament) {
                val normalizedNode = graphValidation.normalizedById[match.id]
                val hasAnyLink = !normalizeToken(match.winnerNextMatchId).isNullOrBlank() ||
                    !normalizeToken(match.loserNextMatchId).isNullOrBlank() ||
                    !normalizeToken(normalizedNode?.previousLeftId).isNullOrBlank() ||
                    !normalizeToken(normalizedNode?.previousRightId).isNullOrBlank()
                if (!hasAnyLink) {
                    return ValidationResult(
                        isValid = false,
                        errorMessage = "Tournament match #${match.matchId} must include at least one bracket link.",
                    )
                }
            }
        }
        return ValidationResult(isValid = true, errorMessage = "")
    }

    private fun doMatchesOverlap(match1: MatchMVP, match2: MatchMVP): Boolean {
        val match1Start = match1.start ?: return false
        val match2Start = match2.start ?: return false
        val match1End = match1.end ?: return false
        val match2End = match2.end ?: return false

        return match1Start < match2End && match2Start < match1End
    }

    override fun showMatchEditDialog(
        match: MatchWithRelations,
        creationContext: MatchCreateContext,
        isCreateMode: Boolean,
    ) {
        if (!canEditMatchesNow()) {
            return
        }
        val availableMatches = if (_isEditingMatches.value) _editableMatches.value else eventWithRelations.value.matches
        _showMatchEditDialog.value = MatchEditDialogState(
            match = match,
            teams = eventWithRelations.value.teams,
            fields = divisionFields.value,
            allMatches = availableMatches,
            eventOfficials = selectedEvent.value.eventOfficials,
            officialPositions = selectedEvent.value.officialPositions,
            players = eventWithRelations.value.players,
            eventType = selectedEvent.value.eventType,
            isCreateMode = isCreateMode,
            creationContext = creationContext,
        )
    }

    override fun sendNotification(title: String, message: String) {
        scope.launch {
            notificationsRepository.sendEventNotification(
                eventWithRelations.value.event.id, title, message, true
            ).onFailure {
                _errorState.value = ErrorMessage("Failed to send message: ${it.userMessage()}")
            }
        }
    }

    override fun dismissMatchEditDialog() {
        val pendingId = pendingCreateMatchId
        if (!pendingId.isNullOrBlank()) {
            _editableMatches.value = _editableMatches.value.filterNot { relation ->
                relation.match.id == pendingId
            }
            _stagedMatchCreates.value = _stagedMatchCreates.value - pendingId
            refreshEditableRounds()
            pendingCreateMatchId = null
        }
        _showMatchEditDialog.value = null
    }

    override fun deleteMatchFromDialog(matchId: String) {
        if (!canEditMatchesNow()) {
            return
        }
        val normalizedId = normalizeToken(matchId) ?: return
        if (!_editableMatches.value.any { relation -> relation.match.id == normalizedId }) {
            _showMatchEditDialog.value = null
            return
        }

        val isClient = isClientMatchId(normalizedId)
        _editableMatches.value = _editableMatches.value
            .filterNot { relation -> relation.match.id == normalizedId }
            .map { relation ->
                val match = relation.match
                relation.copy(
                    match = match.copy(
                        winnerNextMatchId = if (normalizeToken(match.winnerNextMatchId) == normalizedId) null else match.winnerNextMatchId,
                        loserNextMatchId = if (normalizeToken(match.loserNextMatchId) == normalizedId) null else match.loserNextMatchId,
                        previousLeftId = if (normalizeToken(match.previousLeftId) == normalizedId) null else match.previousLeftId,
                        previousRightId = if (normalizeToken(match.previousRightId) == normalizedId) null else match.previousRightId,
                    ),
                )
            }
            .let(::normalizeEditableBracketGraph)
        _stagedMatchCreates.value = _stagedMatchCreates.value - normalizedId
        _stagedMatchDeletes.value = if (isClient) {
            _stagedMatchDeletes.value - normalizedId
        } else {
            _stagedMatchDeletes.value + normalizedId
        }
        if (pendingCreateMatchId == normalizedId) {
            pendingCreateMatchId = null
        }
        refreshEditableRounds()
        _showMatchEditDialog.value = null
    }

    override fun updateMatchFromDialog(updatedMatch: MatchWithRelations) {
        if (!canEditMatchesNow()) {
            return
        }
        val currentMatches = _editableMatches.value.toMutableList()
        val matchIndex = currentMatches.indexOfFirst { it.match.id == updatedMatch.match.id }

        if (matchIndex != -1) {
            currentMatches[matchIndex] = updatedMatch
        } else {
            currentMatches += updatedMatch
        }
        _editableMatches.value = normalizeEditableBracketGraph(currentMatches)
        if (isClientMatchId(updatedMatch.match.id) && !_stagedMatchCreates.value.containsKey(updatedMatch.match.id)) {
            _stagedMatchCreates.value = _stagedMatchCreates.value + (
                updatedMatch.match.id to StagedMatchCreateMeta(
                    clientId = extractClientId(updatedMatch.match.id),
                    creationContext = MatchCreateContext.BRACKET,
                    autoPlaceholderTeam = selectedEvent.value.eventType == EventType.TOURNAMENT,
                )
                )
        }
        pendingCreateMatchId = null
        refreshEditableRounds()

        dismissMatchEditDialog()
    }

    private fun shouldResetBracketMatch(event: Event, match: MatchMVP): Boolean {
        return when {
            event.eventType == EventType.TOURNAMENT -> true
            event.eventType == EventType.LEAGUE && event.includePlayoffs -> isBracketMatch(match)
            else -> false
        }
    }

    private fun isBracketMatch(match: MatchMVP): Boolean {
        return !match.previousLeftId.isNullOrBlank() ||
            !match.previousRightId.isNullOrBlank() ||
            !match.winnerNextMatchId.isNullOrBlank() ||
            !match.loserNextMatchId.isNullOrBlank()
    }

    private fun MatchMVP.toEmptyBracketMatch(): MatchMVP = copy(
        officialId = null,
        teamOfficialId = null,
        team1Points = emptyList(),
        team2Points = emptyList(),
        setResults = emptyList(),
        locked = false,
    )

    private suspend fun refreshUiForJoinConfirmation(
        syncResult: EventParticipantsSyncResult,
        confirmationTarget: JoinConfirmationTarget,
    ) {
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
        return eventSnapshotMatchesJoinConfirmationTarget(syncResult.event, confirmationTarget)
    }

    private suspend fun waitForUserInEventWithTimeout(
        confirmationTarget: JoinConfirmationTarget? = pendingJoinConfirmationTarget,
        timeoutS: Duration = 30.seconds,
        checkIntervalS: Duration = 1.seconds,
    ): Boolean {
        if (confirmationTarget == null) {
            val startTime = Clock.System.now()
            while (!_isUserInEvent.value) {
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

    data class ValidationResult(
        val isValid: Boolean, val errorMessage: String
    )
}

private fun addTemplateSuffix(name: String): String {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) {
        return "(TEMPLATE)"
    }
    return if (trimmed.endsWith("(TEMPLATE)", ignoreCase = true)) {
        trimmed
    } else {
        "$trimmed (TEMPLATE)"
    }
}
