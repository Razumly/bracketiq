@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.RegistrationProgressDraft
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameters
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
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.canManageEventsForViewer
import com.razumly.mvp.core.data.dataTypes.isPaymentPending
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
import com.razumly.mvp.core.data.repositories.isActive
import com.razumly.mvp.core.data.repositories.requiresAdditionalSigning
import com.razumly.mvp.core.data.repositories.requiresChildEmail
import com.razumly.mvp.core.data.repositories.userMessage
import com.razumly.mvp.core.data.util.isPlaceholderSlot
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.InviteCreateDto
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.presentation.PaymentResult
import com.razumly.mvp.core.presentation.util.ShareServiceProvider
import com.razumly.mvp.core.presentation.util.convertPhotoResultToUploadFile
import com.razumly.mvp.core.presentation.util.createEventUrl
import com.razumly.mvp.core.presentation.util.getEventQrCodePath
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.emailAddressRegex
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.core.util.resolvedTimeZone
import com.razumly.mvp.core.util.toTimeZoneOrUtc
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

data class PaymentPlanPreviewDialogState(
    val ownerLabel: String,
    val totalAmountCents: Int,
    val installmentAmounts: List<Int>,
    val installmentDueDates: List<String>,
    val installmentDueRelativeDays: List<Int> = emptyList(),
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
    val expectedRegistrantType = target.registrantType.name
    if (!registration.registrantType.trim().equals(expectedRegistrantType, ignoreCase = true)) {
        return false
    }
    val registrationMatchesRegistrant = when (expectedRegistrantType) {
        "TEAM" -> setOf(
            registration.registrantId,
            registration.parentId,
            registration.eventTeamId,
        ).any { value -> value?.trim() == target.registrantId }

        else -> registration.registrantId == target.registrantId
    }
    if (!registrationMatchesRegistrant) {
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
    !isCancelledLike() &&
        normalizedStatus() != "CONSENTFAILED" &&
        normalizedStatus() != "PAYMENT_FAILED"

private fun EventRegistrationCacheEntry.isPaymentPending(): Boolean =
    normalizedStatus() == "PENDING"

private fun EventRegistrationCacheEntry.isPaymentFailed(): Boolean =
    normalizedStatus() == "PAYMENT_FAILED"

private fun EventRegistrationCacheEntry.matchesCurrentUserTeamIds(currentUserTeamIds: Set<String>): Boolean {
    if (currentUserTeamIds.isEmpty()) {
        return false
    }
    return sequenceOf(
        parentId,
        eventTeamId,
        registrantId,
    )
        .mapNotNull { value -> value?.trim()?.takeIf(String::isNotBlank) }
        .any(currentUserTeamIds::contains)
}

private fun EventRegistrationCacheEntry.resolvedEventTeamId(): String? =
    eventTeamId?.trim()?.takeIf(String::isNotBlank)
        ?: registrantId.trim().takeIf(String::isNotBlank)

private data class CurrentUserRegistrationMembershipState(
    val participant: Boolean = false,
    val waitlist: Boolean = false,
    val freeAgent: Boolean = false,
    val paymentPending: Boolean = false,
    val paymentFailed: Boolean = false,
    val teamId: String? = null,
)

private data class ParticipantManagementRoomTarget(
    val eventId: String,
    val slotId: String?,
    val occurrenceDate: String?,
    val teamSignup: Boolean,
) {
    fun toOccurrence(): EventOccurrenceSelection? {
        val resolvedSlotId = slotId ?: return null
        val resolvedOccurrenceDate = occurrenceDate ?: return null
        return EventOccurrenceSelection(
            slotId = resolvedSlotId,
            occurrenceDate = resolvedOccurrenceDate,
        )
    }
}

private data class ParticipantManagementLocalState(
    val snapshot: EventParticipantManagementSnapshot = EventParticipantManagementSnapshot(),
    val teamSummaries: Map<String, EventTeamComplianceSummary> = emptyMap(),
    val userSummaries: Map<String, EventComplianceUserSummary> = emptyMap(),
)

private data class EventScopedValue<T>(
    val eventId: String,
    val value: T,
)

private data class EventTimeSlotLoadTarget(
    val eventId: String,
    val slotIds: List<String>,
    val bootstrapSlots: List<TimeSlot>?,
    val bootstrapped: Boolean,
)

private data class EventLeagueScoringLoadTarget(
    val eventId: String,
    val scoringConfigId: String,
    val bootstrapConfig: LeagueScoringConfig?,
    val bootstrapped: Boolean,
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
    private val currentUserDataSource: CurrentUserDataSource? = null,
    private val apiClient: MvpApiClient? = null,

) : EventDetailComponent, PaymentProcessor(), ComponentContext by componentContext {
    private companion object {
        const val CLIENT_MATCH_PREFIX = "client:"
        const val LOCAL_PLACEHOLDER_PREFIX = "placeholder-local:"
        const val MATCH_REALTIME_EDIT_PAUSE_REASON = "event-detail-editing"
    }

    private fun canEditEventDetails(targetEvent: Event): Boolean {
        return mobileEventEditUnsupportedFeatures(targetEvent).isEmpty()
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
        return organization?.canManageEventsForViewer(currentUserId) == true
    }

    private fun canManageParticipantData(
        event: Event = selectedEvent.value,
        user: UserData = currentUser.value,
        organization: Organization? = eventWithRelations.value.organization,
    ): Boolean {
        val currentUserId = user.id.trim()
        if (currentUserId.isBlank()) {
            return false
        }
        return event.hostId.trim() == currentUserId ||
            event.assistantHostIds.any { assistantHostId -> assistantHostId.trim() == currentUserId } ||
            organization?.canManageEventsForViewer(currentUserId) == true
    }

    private fun canEditMatchesNow(): Boolean = _isEditingMatches.value && canManageMatchEditing()

    private fun normalizeToken(value: String?): String? =
        value?.trim()?.takeIf(String::isNotBlank)

    private fun Iterable<String>.normalizedTeamIds(): List<String> =
        map(String::trim).filter(String::isNotBlank).distinct()

    private fun Event.playoffPlacementDivisionIdsNormalized(): Set<String> {
        val mappedPlayoffIds = divisionDetails
            .flatMap { detail -> detail.playoffPlacementDivisionIds }
            .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
            .filter(String::isNotBlank)
            .toMutableSet()

        divisionDetails
            .filter { detail -> detail.isTournamentPlayoffDivision() }
            .map { detail -> detail.normalizedTournamentDivisionId() }
            .filter(String::isNotBlank)
            .forEach { divisionId -> mappedPlayoffIds += divisionId }

        inferredTournamentBracketDivisionIds()
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
    private val _inviteTeamSuggestions = MutableStateFlow<List<Team>>(emptyList())
    override val inviteTeamSuggestions = _inviteTeamSuggestions.asStateFlow()
    private val _inviteTeamsLoading = MutableStateFlow(false)
    override val inviteTeamsLoading = _inviteTeamsLoading.asStateFlow()
    private val _pendingStaffInvites = MutableStateFlow<List<PendingStaffInviteDraft>>(emptyList())
    override val pendingStaffInvites = _pendingStaffInvites.asStateFlow()
    private val _eventStaffInvites = MutableStateFlow<List<Invite>>(emptyList())
    private val _bootstrappedEventIds = MutableStateFlow<Set<String>>(emptySet())
    private val _bootstrapTimeSlots = MutableStateFlow<EventScopedValue<List<TimeSlot>>?>(null)
    private val _bootstrapLeagueScoringConfig = MutableStateFlow<EventScopedValue<LeagueScoringConfig?>?>(null)
    private var managedDetailBootstrapRequest: ParticipantManagementRoomTarget? = null

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()
    private val _billingAddressPrompt = MutableStateFlow<BillingAddressDraft?>(null)
    override val billingAddressPrompt = _billingAddressPrompt.asStateFlow()
    private val _startingTeamRegistrationId = MutableStateFlow<String?>(null)
    override val startingTeamRegistrationId = _startingTeamRegistrationId.asStateFlow()

    private lateinit var loadingHandler: LoadingHandler

    override fun setLoadingHandler(loadingHandler: LoadingHandler) {
        this.loadingHandler = loadingHandler
    }

    override fun clearError() {
        _errorState.value = null
    }

    override fun updateEventRegistrationQuestionAnswer(questionId: String, answer: String) {
        val normalizedQuestionId = questionId.trim().takeIf(String::isNotBlank) ?: return
        _eventRegistrationQuestionAnswers.value = _eventRegistrationQuestionAnswers.value + (normalizedQuestionId to answer)
        scope.launch {
            saveCurrentRegistrationProgress(step = "questions")
        }
    }

    override fun toggleEventRegistrationQuestionsExpanded() {
        _eventRegistrationQuestionsExpanded.value = !_eventRegistrationQuestionsExpanded.value
    }

    override fun dismissEventRegistrationQuestionDialog() {
        _eventRegistrationQuestionDialog.value = null
        pendingEventRegistrationQuestionContinuation = null
    }

    override fun submitEventRegistrationQuestionDialogAnswers(answers: Map<String, String>) {
        val dialog = _eventRegistrationQuestionDialog.value ?: return
        val normalizedAnswers = dialog.questions.associate { question ->
            question.id to answers[question.id].orEmpty()
        }
        val missingQuestion = dialog.questions.firstOrNull { question ->
            question.required && normalizedAnswers[question.id].orEmpty().trim().isBlank()
        }
        if (missingQuestion != null) {
            _errorState.value = ErrorMessage("Answer \"${missingQuestion.prompt}\" before continuing.")
            return
        }

        _eventRegistrationQuestionAnswers.value = _eventRegistrationQuestionAnswers.value + normalizedAnswers
        eventRegistrationQuestionsConfirmed = true
        _eventRegistrationQuestionDialog.value = null
        val continuation = pendingEventRegistrationQuestionContinuation
        pendingEventRegistrationQuestionContinuation = null
        scope.launch {
            saveCurrentRegistrationProgress(step = "questions")
            continuation?.invoke()
        }
    }

    override fun registrationHoldExpired() {
        scope.launch {
            clearCurrentRegistrationProgress()
            pendingTeamRegistration = null
            pendingJoinConfirmationTarget = null
            pendingEventRegistrationQuestionContinuation = null
            _eventRegistrationQuestionDialog.value = null
            _startingTeamRegistrationId.value = null
            _errorState.value = ErrorMessage("Registration hold expired. Start registration again to reserve a new spot.")
        }
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
    private val _availableRentalResources = MutableStateFlow<List<RentalResourceOption>>(emptyList())
    override val availableRentalResources = _availableRentalResources.asStateFlow()
    private val _selectedRentalResourceIds = MutableStateFlow<Set<String>>(emptySet())
    override val selectedRentalResourceIds = _selectedRentalResourceIds.asStateFlow()
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
    private var sportsLoadJob: Job? = null
    private var sportsCatalogLoaded = false
    private var reportSportsLoadErrors = false

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

    private val _sports = MutableStateFlow<List<Sport>>(emptyList())
    override val sports = _sports.asStateFlow()
    private val _divisionTypeParameters = MutableStateFlow(DivisionTypeParameters())
    override val divisionTypeParameters = _divisionTypeParameters.asStateFlow()

    override val selectedEvent: StateFlow<Event> =
        eventRelations.map { it.event }.stateIn(scope, SharingStarted.Eagerly, event)

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

    private val eventTimeSlots: StateFlow<List<TimeSlot>> = selectedEvent
        .map { selected ->
            selected.id to selected.timeSlotIds
                .map { slotId -> slotId.trim() }
                .filter(String::isNotBlank)
                .distinct()
        }
        .distinctUntilChanged()
        .combine(_bootstrapTimeSlots) { (eventId, slotIds), bootstrap ->
            val scopedSlots = bootstrap
                ?.takeIf { scoped -> scoped.eventId == eventId }
                ?.value
                .orEmpty()
            val slotsById = scopedSlots.associateBy { slot -> slot.id.trim() }
            val orderedBootstrapSlots = slotIds.mapNotNull(slotsById::get)
            EventTimeSlotLoadTarget(
                eventId = eventId,
                slotIds = slotIds,
                bootstrapSlots = orderedBootstrapSlots.takeIf { slots -> slots.size == slotIds.size },
                bootstrapped = _bootstrappedEventIds.value.contains(eventId),
            )
        }
        .distinctUntilChanged()
        .flatMapLatest { target ->
            val eventId = target.eventId
            val slotIds = target.slotIds
            if (slotIds.isEmpty()) {
                flowOf(emptyList())
            } else if (target.bootstrapSlots != null) {
                flowOf(target.bootstrapSlots)
            } else if (!target.bootstrapped) {
                flowOf(emptyList())
            } else {
                flow {
                    val slots = fieldRepository.getTimeSlots(slotIds)
                        .onFailure { error ->
                            Napier.w("Failed to refresh time slots for event $eventId: ${error.message}")
                        }
                        .getOrElse { emptyList() }
                    emit(slots)
                }
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val eventLeagueScoringConfig: StateFlow<LeagueScoringConfig?> = eventRelations
        .map { relations ->
            relations.event.id to relations.event.leagueScoringConfigId
                .orEmpty()
                .trim()
        }
        .distinctUntilChanged()
        .combine(_bootstrapLeagueScoringConfig) { (eventId, scoringConfigId), bootstrap ->
            EventLeagueScoringLoadTarget(
                eventId = eventId,
                scoringConfigId = scoringConfigId,
                bootstrapConfig = bootstrap?.takeIf { scoped -> scoped.eventId == eventId }?.value,
                bootstrapped = _bootstrappedEventIds.value.contains(eventId),
            )
        }
        .distinctUntilChanged()
        .flatMapLatest { target ->
            val eventId = target.eventId
            val scoringConfigId = target.scoringConfigId
            if (scoringConfigId.isBlank()) {
                flowOf<LeagueScoringConfig?>(null)
            } else if (target.bootstrapped) {
                flowOf(target.bootstrapConfig)
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
        _sports,
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

    private val _overviewParticipantSummary = MutableStateFlow<EventParticipantsSummary?>(null)
    override val overviewParticipantSummary = _overviewParticipantSummary.asStateFlow()

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
        _bootstrappedEventIds,
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

    private val _rounds = MutableStateFlow<List<List<MatchWithRelations?>>>(emptyList())
    override val rounds = _rounds.asStateFlow()

    private val _losersBracket = MutableStateFlow(false)
    override val losersBracket = _losersBracket.asStateFlow()

    private val _showDetails = MutableStateFlow(false)
    override val showDetails = _showDetails.asStateFlow()

    private val _eventTeamsAndParticipantsLoading = MutableStateFlow(
        event.id.isNotBlank() && event.eventType != EventType.WEEKLY_EVENT
    )
    override val eventTeamsAndParticipantsLoading = _eventTeamsAndParticipantsLoading.asStateFlow()

    private val _participantManagementSnapshot = MutableStateFlow(EventParticipantManagementSnapshot())
    override val participantManagementSnapshot = _participantManagementSnapshot.asStateFlow()

    private val _participantDivisionWarnings = MutableStateFlow<List<EventParticipantDivisionWarning>>(emptyList())
    override val participantDivisionWarnings = _participantDivisionWarnings.asStateFlow()

    private val _participantManagementLoading = MutableStateFlow(false)
    override val participantManagementLoading = _participantManagementLoading.asStateFlow()

    private val _teamComplianceSummaries = MutableStateFlow<Map<String, EventTeamComplianceSummary>>(emptyMap())
    override val teamComplianceSummaries = _teamComplianceSummaries.asStateFlow()

    private val _userComplianceSummaries = MutableStateFlow<Map<String, EventComplianceUserSummary>>(emptyMap())
    override val userComplianceSummaries = _userComplianceSummaries.asStateFlow()

    private val _participantComplianceLoading = MutableStateFlow(false)
    override val participantComplianceLoading = _participantComplianceLoading.asStateFlow()

    private val _eventMatchesLoading = MutableStateFlow(false)
    override val eventMatchesLoading = _eventMatchesLoading.asStateFlow()

    private var eventDetailHydrationJob: Job? = null
    private var eventDetailHydrationToken: Long = 0L
    private var weeklyOccurrenceSummaryPrefetchJob: Job? = null
    private var participantManagementRequestToken: Long = 0L
    private var participantComplianceRequestToken: Long = 0L

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

    private val _isUserInEvent: MutableStateFlow<Boolean> =
        MutableStateFlow(checkIsUserInEvent(event))
    override val isUserInEvent = _isUserInEvent.asStateFlow()

    private val _isRegistrationPaymentPending = MutableStateFlow(false)
    override val isRegistrationPaymentPending = _isRegistrationPaymentPending.asStateFlow()

    private val _isRegistrationPaymentFailed = MutableStateFlow(false)
    override val isRegistrationPaymentFailed = _isRegistrationPaymentFailed.asStateFlow()

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

    private val _teamJoinQuestionDialog = MutableStateFlow<TeamJoinQuestionDialogState?>(null)
    override val teamJoinQuestionDialog = _teamJoinQuestionDialog.asStateFlow()
    private var pendingTeamJoinQuestionTeam: TeamWithPlayers? = null

    private val _eventRegistrationQuestionDialog = MutableStateFlow<EventRegistrationQuestionDialogState?>(null)
    override val eventRegistrationQuestionDialog = _eventRegistrationQuestionDialog.asStateFlow()
    private val _eventRegistrationQuestions = MutableStateFlow<List<TeamJoinQuestion>>(emptyList())
    override val eventRegistrationQuestions = _eventRegistrationQuestions.asStateFlow()
    private val _eventRegistrationQuestionAnswers = MutableStateFlow<Map<String, String>>(emptyMap())
    override val eventRegistrationQuestionAnswers = _eventRegistrationQuestionAnswers.asStateFlow()
    private val _eventRegistrationQuestionsExpanded = MutableStateFlow(false)
    override val eventRegistrationQuestionsExpanded = _eventRegistrationQuestionsExpanded.asStateFlow()
    private val _registrationHoldExpiresAt = MutableStateFlow<String?>(null)
    override val registrationHoldExpiresAt = _registrationHoldExpiresAt.asStateFlow()

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
    private var pendingTeamRegistration: TeamWithPlayers? = null
    private var pendingSignatureContext: SignerContext = SignerContext.PARTICIPANT
    private var pendingSignatureContexts: List<SignerContext> = emptyList()
    private var pendingSignatureContextIndex = 0
    private var pendingSignatureChild: JoinChildOption? = null
    private var pendingSignatureTeamId: String? = null
    private var pendingPdfSignaturePollJob: Job? = null
    private var pendingPaymentPlanPreviewAction: (() -> Unit)? = null
    private var pendingEventRegistrationQuestionContinuation: (() -> Unit)? = null
    private var eventRegistrationQuestionsConfirmed = false

    private val shareServiceProvider = ShareServiceProvider()

    private fun currentRegistrationProgressKey(): String? {
        val userId = currentUser.value.id.trim().takeIf(String::isNotBlank) ?: return null
        val eventId = selectedEvent.value.id.trim().takeIf(String::isNotBlank) ?: return null
        val occurrence = currentWeeklyOccurrenceSelection()
        return listOf(
            "event",
            userId,
            eventId,
            occurrence?.slotId?.trim()?.takeIf(String::isNotBlank) ?: "none",
            occurrence?.occurrenceDate?.trim()?.takeIf(String::isNotBlank) ?: "none",
        ).joinToString(":")
    }

    private suspend fun saveCurrentRegistrationProgress(
        step: String? = null,
        registrationId: String? = null,
        holdExpiresAt: String? = _registrationHoldExpiresAt.value,
    ) {
        val key = currentRegistrationProgressKey() ?: return
        val userId = currentUser.value.id.trim().takeIf(String::isNotBlank) ?: return
        val eventId = selectedEvent.value.id.trim().takeIf(String::isNotBlank) ?: return
        val occurrence = currentWeeklyOccurrenceSelection()
        currentUserDataSource?.saveRegistrationProgress(
            key = key,
            draft = RegistrationProgressDraft(
                scope = "event",
                userId = userId,
                eventId = eventId,
                step = step,
                answers = _eventRegistrationQuestionAnswers.value,
                selectedDivisionId = selectedDivision.value,
                slotId = occurrence?.slotId,
                occurrenceDate = occurrence?.occurrenceDate,
                registrationId = registrationId,
                holdExpiresAt = holdExpiresAt,
                updatedAt = Clock.System.now().toString(),
            ),
        )
    }

    private suspend fun loadCurrentRegistrationProgress() {
        val key = currentRegistrationProgressKey() ?: run {
            _registrationHoldExpiresAt.value = null
            return
        }
        val draft = currentUserDataSource?.loadRegistrationProgress(key)
        if (draft == null) {
            _registrationHoldExpiresAt.value = null
            eventRegistrationQuestionsConfirmed = false
            return
        }
        eventRegistrationQuestionsConfirmed = draft.step == "checkout" ||
            !draft.holdExpiresAt.isNullOrBlank()
        if (draft.answers.isNotEmpty()) {
            _eventRegistrationQuestionAnswers.value = _eventRegistrationQuestionAnswers.value + draft.answers
        }
        draft.selectedDivisionId
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let { restoredDivisionId ->
                _selectedDivision.value = restoredDivisionId
            }
        _registrationHoldExpiresAt.value = draft.holdExpiresAt
    }

    private suspend fun clearCurrentRegistrationProgress() {
        currentRegistrationProgressKey()?.let { key ->
            currentUserDataSource?.clearRegistrationProgress(key)
        }
        _registrationHoldExpiresAt.value = null
        eventRegistrationQuestionsConfirmed = false
    }

    private fun missingEventRegistrationQuestion(): TeamJoinQuestion? =
        _eventRegistrationQuestions.value.firstOrNull { question ->
            question.required && _eventRegistrationQuestionAnswers.value[question.id].orEmpty().trim().isBlank()
        }

    private fun ensureEventRegistrationQuestionsAnswered(onReady: () -> Unit): Boolean {
        val questions = _eventRegistrationQuestions.value
        if (questions.isEmpty()) return true
        val missingQuestion = missingEventRegistrationQuestion()
        if (missingQuestion == null && eventRegistrationQuestionsConfirmed) {
            return true
        }

        _eventRegistrationQuestionsExpanded.value = true
        _eventRegistrationQuestionDialog.value = EventRegistrationQuestionDialogState(
            eventName = selectedEvent.value.name.ifBlank { "this event" },
            questions = questions,
            answers = _eventRegistrationQuestionAnswers.value,
        )
        pendingEventRegistrationQuestionContinuation = onReady
        return false
    }

    private fun eventRegistrationAnswersForRequest(): Map<String, String> {
        val questionIds = _eventRegistrationQuestions.value
            .mapNotNull { question -> question.id.trim().takeIf(String::isNotBlank) }
            .toSet()
        return _eventRegistrationQuestionAnswers.value
            .filter { (questionId, answer) ->
                val normalizedQuestionId = questionId.trim()
                normalizedQuestionId.isNotBlank() &&
                    answer.trim().isNotBlank() &&
                    (questionIds.isEmpty() || normalizedQuestionId in questionIds)
            }
            .mapKeys { (questionId, _) -> questionId.trim() }
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
        if (_isEditing.value) {
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
                _selectedWeeklyOccurrence,
            ) { eventId, userId, occurrence ->
                Triple(eventId, userId, occurrence)
            }
                .distinctUntilChanged()
                .collectLatest { (eventId, userId, _) ->
                    if (eventId.isBlank() || userId.isBlank()) {
                        _eventRegistrationQuestions.value = emptyList()
                        _eventRegistrationQuestionAnswers.value = emptyMap()
                        _registrationHoldExpiresAt.value = null
                        eventRegistrationQuestionsConfirmed = false
                        return@collectLatest
                    }
                    eventRepository.getRegistrationQuestions("EVENT", eventId)
                        .onSuccess { questions ->
                            val previousQuestionIds = _eventRegistrationQuestions.value.map { question -> question.id }
                            val nextQuestionIds = questions.map { question -> question.id }
                            if (previousQuestionIds != nextQuestionIds) {
                                eventRegistrationQuestionsConfirmed = false
                            }
                            _eventRegistrationQuestions.value = questions
                            _eventRegistrationQuestionAnswers.value = _eventRegistrationQuestionAnswers.value.filterKeys { questionId ->
                                questions.any { question -> question.id == questionId }
                            } + questions.associate { question ->
                                question.id to _eventRegistrationQuestionAnswers.value[question.id].orEmpty()
                            }
                        }
                        .onFailure { throwable ->
                            Napier.w("Failed to load event registration questions.", throwable)
                            _eventRegistrationQuestions.value = emptyList()
                            _eventRegistrationQuestionAnswers.value = emptyMap()
                            eventRegistrationQuestionsConfirmed = false
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
                    _weeklyOccurrenceSummaries.value = emptyMap()
                    if (!weeklyParent) {
                        _selectedWeeklyOccurrence.value = null
                        _selectedWeeklyOccurrenceSummary.value = null
                    }
                    _overviewParticipantSummary.value = null
                }
        }
        scope.launch {
            selectedEvent
                .map { selected -> selected.id.trim() to isWeeklyParentEvent(selected) }
                .distinctUntilChanged()
                .collectLatest { (eventId, weeklyParent) ->
                    if (eventId.isEmpty() || weeklyParent) {
                        _eventTeamsAndParticipantsLoading.value = false
                        return@collectLatest
                    }
                    _overviewParticipantSummary.value = null
                    _eventTeamsAndParticipantsLoading.value = true
                    try {
                        prefetchNonWeeklyParticipants(selectedEvent.value)
                    } finally {
                        _eventTeamsAndParticipantsLoading.value = false
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
            combine(selectedEvent, _selectedWeeklyOccurrence) { eventValue, occurrenceState ->
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
                    _participantManagementSnapshot.value = localState.snapshot
                    _teamComplianceSummaries.value = localState.teamSummaries
                    _userComplianceSummaries.value = localState.userSummaries
                }
        }
        scope.launch {
            combine(
                selectedEvent,
                currentUser,
                eventWithRelations.map { relations -> relations.organization }.distinctUntilChanged(),
                _selectedWeeklyOccurrence,
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
                    if (target == null) {
                        _participantManagementLoading.value = false
                        _participantComplianceLoading.value = false
                        return@collectLatest
                    }
                    if (target == managedDetailBootstrapRequest) {
                        _participantManagementLoading.value = false
                        _participantComplianceLoading.value = false
                        return@collectLatest
                    }
                    managedDetailBootstrapRequest = target
                    _participantManagementLoading.value = true
                    _participantComplianceLoading.value = true
                    try {
                        eventRepository.syncEventDetail(
                            event = selectedEvent.value,
                            occurrence = target.toOccurrence(),
                            manage = true,
                        ).onSuccess { result ->
                            applyEventDetailSyncResult(result)
                        }.onFailure { throwable ->
                            if (managedDetailBootstrapRequest == target) {
                                managedDetailBootstrapRequest = null
                            }
                            Napier.w("Failed to refresh event detail management bootstrap.", throwable)
                        }
                    } finally {
                        _participantManagementLoading.value = false
                        _participantComplianceLoading.value = false
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
                    val pendingTeam = pendingTeamRegistration
                    val confirmationTarget = pendingJoinConfirmationTarget
                    when (it) {
                        PaymentResult.Canceled -> {
                            _errorState.value = ErrorMessage("Payment canceled.")
                            _startingTeamRegistrationId.value = null
                            pendingTeamRegistration = null
                        }

                        is PaymentResult.Failed -> {
                            _errorState.value = ErrorMessage(it.error)
                            _startingTeamRegistrationId.value = null
                            pendingTeamRegistration = null
                        }

                        PaymentResult.Completed -> {
                            if (pendingTeam != null) {
                                loadingHandler.showLoading("Refreshing Team")
                                _startingTeamRegistrationId.value = null
                                val teamRegisteredSuccessfully = waitForTeamRegistrationWithTimeout(
                                    teamId = pendingTeam.team.id,
                                )
                                pendingTeamRegistration = null
                                if (teamRegisteredSuccessfully) {
                                    val refreshedTeam = teamRepository.getTeamWithPlayers(pendingTeam.team.id)
                                        .getOrNull()
                                    val paymentPending = refreshedTeam
                                        ?.team
                                        ?.playerRegistrations
                                        ?.any { registration ->
                                            registration.userId == currentUser.value.id && registration.isPaymentPending()
                                        } == true
                                    _usersTeam.value = refreshedTeam ?: pendingTeam
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
                                } else if (_isRegistrationPaymentPending.value) {
                                    _errorState.value = ErrorMessage(
                                        "Payment submitted. Registration is pending until the bank payment clears."
                                    )
                                }
                            }
                            clearCurrentRegistrationProgress()
                        }
                    }
                    loadingHandler.hideLoading()
                    pendingJoinConfirmationTarget = null
                    clearPaymentResult()
                }
            }
        }
        scope.launch {
            matchRepository.setIgnoreMatch(null)
            try {
                combine(selectedEventId, _isEditing, _isEditingMatches) { eventId, isEditing, isEditingMatches ->
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
                if (!canEditEventDetails(relations.event) && _isEditing.value) {
                    _isEditing.value = false
                    _editedEvent.value = relations.event
                }
                if (!_isEditing.value) {
                    _editableLeagueTimeSlots.value = editableLeagueTimeSlotsForEvent(
                        event = relations.event,
                        timeSlots = relations.timeSlots,
                    )
                }
                val activeDivision = _selectedDivision.value ?: relations.event.resolveDefaultSelectedDivisionId()
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
                    val currentDivisionId = _selectedDivision.value?.normalizeDivisionIdentifier()?.takeIf(String::isNotBlank)
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
                val supportsStandings = eventValue.eventType == EventType.LEAGUE ||
                    eventValue.isTournamentPoolPlayEnabled()
                if (!supportsStandings || normalizedDivision == null) {
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
        _participantDivisionWarnings.value = result.divisionWarnings
        _overviewParticipantSummary.value = if (
            isWeeklyParentEvent(result.event) ||
            result.weeklySelectionRequired
        ) {
            null
        } else {
            EventParticipantsSummary(
                participantCount = result.participantCount,
                participantCapacity = result.participantCapacity,
                weeklySelectionRequired = false,
            )
        }
    }

    private fun markManagedBootstrapRequested(
        event: Event,
        occurrence: EventOccurrenceSelection?,
        manage: Boolean,
    ) {
        if (!manage) {
            return
        }
        managedDetailBootstrapRequest = participantManagementRoomTarget(
            event = event,
            occurrence = occurrence,
        )
    }

    private fun clearManagedBootstrapRequestIfCurrent(
        event: Event,
        occurrence: EventOccurrenceSelection?,
    ) {
        val target = participantManagementRoomTarget(
            event = event,
            occurrence = occurrence,
        )
        if (managedDetailBootstrapRequest == target) {
            managedDetailBootstrapRequest = null
        }
    }

    private fun applyEventDetailSyncResult(result: EventDetailSyncResult) {
        applyParticipantSyncResult(result.participants)
        val normalizedEventId = result.event.id.trim()
        if (normalizedEventId.isNotBlank()) {
            _bootstrappedEventIds.value = _bootstrappedEventIds.value + normalizedEventId
            _bootstrapTimeSlots.value = EventScopedValue(normalizedEventId, result.timeSlots)
            _bootstrapLeagueScoringConfig.value = EventScopedValue(normalizedEventId, result.leagueScoringConfig)
        }
        _eventStaffInvites.value = result.staffInvites
    }

    private fun loadSports(reportErrors: Boolean) {
        reportSportsLoadErrors = reportSportsLoadErrors || reportErrors
        if (sportsLoadJob?.isActive == true) {
            return
        }
        sportsLoadJob = scope.launch {
            var loadedSports = false
            var loadedDivisionTypes = false
            sportsRepository.getSports()
                .onSuccess {
                    loadedSports = true
                    _sports.value = it
                    if (_isEditing.value) {
                        _editedEvent.value = syncOfficialStaffingForSportTransition(
                            previous = _editedEvent.value,
                            updated = _editedEvent.value.withSportRules(),
                        )
                    }
                }
                .onFailure {
                    Napier.w("Failed to load sports.", it)
                    if (reportSportsLoadErrors || _isEditing.value) {
                        _errorState.value = ErrorMessage("Failed to load sports: ${it.userMessage()}")
                    }
                }
            sportsRepository.getDivisionTypeParameters()
                .onSuccess {
                    loadedDivisionTypes = true
                    _divisionTypeParameters.value = it
                }
                .onFailure {
                    Napier.w("Failed to load division options.", it)
                    if (reportSportsLoadErrors || _isEditing.value) {
                        _errorState.value = ErrorMessage("Failed to load division options: ${it.userMessage()}")
                    }
                }
            sportsCatalogLoaded = loadedSports && loadedDivisionTypes
            reportSportsLoadErrors = false
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
        refreshSelectedDivisionContent()
    }

    private fun refreshSelectedDivisionContent() {
        _divisionTeams.value = eventWithRelations.value.teams.associateBy { it.team.id }
        val divisionFilter = _selectedDivision.value
        _divisionMatches.value = if (!selectedEvent.value.singleDivision && !divisionFilter.isNullOrEmpty()) {
            val normalizedDivisionFilter = divisionFilter.normalizeDivisionIdentifier()
            eventWithRelations.value.matches.filter {
                it.match.division?.normalizeDivisionIdentifier() == normalizedDivisionFilter && !(
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
        if (event.eventType != EventType.LEAGUE && !event.isTournamentPoolPlayEnabled()) return
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

        if ((event.eventType != EventType.LEAGUE && !event.isTournamentPoolPlayEnabled()) || divisionId == null) {
            _errorState.value = ErrorMessage("Select a standings division before confirming standings.")
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
        if (normalizedEventId.isEmpty()) {
            _participantManagementLoading.value = false
            return
        }

        participantManagementRequestToken += 1
        val requestToken = participantManagementRequestToken
        _participantManagementLoading.value = true
        try {
            eventRepository.getEventParticipantManagementSnapshot(
                eventId = normalizedEventId,
                occurrence = occurrence,
            ).onFailure { throwable ->
                if (requestToken != participantManagementRequestToken) return@onFailure
                if (reportErrors) {
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Failed to load participant registrations."),
                    )
                } else {
                    Napier.w("Failed to refresh participant registrations.", throwable)
                }
            }
        } finally {
            if (requestToken == participantManagementRequestToken) {
                _participantManagementLoading.value = false
            }
        }
    }

    private suspend fun refreshParticipantComplianceSummaries(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
        teamSignup: Boolean,
        reportErrors: Boolean = true,
    ) {
        val normalizedEventId = eventId.trim()
        if (normalizedEventId.isEmpty()) {
            _participantComplianceLoading.value = false
            return
        }

        participantComplianceRequestToken += 1
        val requestToken = participantComplianceRequestToken
        _participantComplianceLoading.value = true

        try {
            val result = if (teamSignup) {
                eventRepository.getEventTeamCompliance(normalizedEventId, occurrence).map { }
            } else {
                eventRepository.getEventUserCompliance(normalizedEventId, occurrence).map { }
            }
            result.onFailure { throwable ->
                if (requestToken != participantComplianceRequestToken) return@onFailure
                if (reportErrors) {
                    _errorState.value = ErrorMessage(
                        throwable.userMessage("Failed to load participant payment and document status."),
                    )
                } else {
                    Napier.w("Failed to refresh participant compliance.", throwable)
                }
            }
        } finally {
            if (requestToken == participantComplianceRequestToken) {
                _participantComplianceLoading.value = false
            }
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
        val manage = canManageParticipantData(event)
        markManagedBootstrapRequested(event, occurrence = occurrence, manage = manage)
        eventRepository.syncEventDetail(
            event = event,
            occurrence = occurrence,
            manage = manage,
        ).onSuccess { result ->
            applyEventDetailSyncResult(result)
            val participantResult = result.participants
            _selectedWeeklyOccurrenceSummary.value = if (occurrence == null || participantResult.weeklySelectionRequired) {
                null
            } else {
                WeeklyOccurrenceSummary(
                    participantCount = participantResult.participantCount,
                    participantCapacity = participantResult.participantCapacity,
                ).also { summary ->
                    rememberWeeklyOccurrenceSummary(occurrence, summary)
                }
            }
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

    override fun startTeamRegistration(team: TeamWithPlayers) {
        scope.launch {
            val teamId = team.team.registrationTargetTeamId()
            if (teamId.isBlank() || _startingTeamRegistrationId.value != null) return@launch

            if (currentUser.value.id.isBlank()) {
                _errorState.value = ErrorMessage("Please sign in to join this team.")
                return@launch
            }

            _startingTeamRegistrationId.value = teamId
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
                if (!joinPolicy.isOpenTeamJoinPolicy() && !joinPolicy.isRequestToJoinPolicy()) {
                    _errorState.value = ErrorMessage("This team is not accepting registrations.")
                    loadingHandler.hideLoading()
                    return@launch
                }

                if (context.questions.isNotEmpty()) {
                    pendingTeamJoinQuestionTeam = registrationTeam
                    _teamJoinQuestionDialog.value = TeamJoinQuestionDialogState(
                        teamId = context.teamId,
                        teamName = registrationTeam.team.name.ifBlank { "this team" },
                        joinPolicy = joinPolicy,
                        questions = context.questions,
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
                if (pendingTeamRegistration == null) {
                    _startingTeamRegistrationId.value = null
                }
            }
        }
    }

    override fun submitTeamJoinQuestionAnswers(answers: Map<String, String>) {
        val dialog = _teamJoinQuestionDialog.value ?: return
        val missingQuestion = dialog.questions.firstOrNull { question ->
            question.required && answers[question.id].orEmpty().trim().isBlank()
        }
        if (missingQuestion != null) {
            _errorState.value = ErrorMessage("Answer \"${missingQuestion.prompt}\" before continuing.")
            return
        }
        val team = pendingTeamJoinQuestionTeam
        if (team == null) {
            _teamJoinQuestionDialog.value = null
            _errorState.value = ErrorMessage("Unable to continue team registration.")
            return
        }

        _teamJoinQuestionDialog.value = null
        pendingTeamJoinQuestionTeam = null
        scope.launch {
            val teamId = dialog.teamId.trim().takeIf(String::isNotBlank) ?: team.team.registrationTargetTeamId()
            if (teamId.isBlank() || _startingTeamRegistrationId.value != null) return@launch
            _startingTeamRegistrationId.value = teamId
            try {
                loadingHandler.showLoading(
                    if (dialog.joinPolicy.isRequestToJoinPolicy()) {
                        "Submitting join request..."
                    } else {
                        "Starting team registration..."
                    },
                )
                submitTeamJoin(
                    team = team,
                    joinPolicy = dialog.joinPolicy,
                    answers = answers,
                )
                loadingHandler.hideLoading()
            } finally {
                if (pendingTeamRegistration == null) {
                    _startingTeamRegistrationId.value = null
                }
            }
        }
    }

    override fun dismissTeamJoinQuestionDialog() {
        _teamJoinQuestionDialog.value = null
        pendingTeamJoinQuestionTeam = null
    }

    private suspend fun submitTeamJoin(
        team: TeamWithPlayers,
        joinPolicy: String,
        answers: Map<String, String>,
    ) {
        val teamId = team.team.registrationTargetTeamId()
        if (joinPolicy.isRequestToJoinPolicy()) {
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

    private fun String?.isRequestToJoinPolicy(): Boolean =
        equals("REQUEST_TO_JOIN", ignoreCase = true)

    private fun String?.isOpenTeamJoinPolicy(): Boolean =
        equals("OPEN_REGISTRATION", ignoreCase = true)

    private fun Team.registrationTargetTeamId(): String =
        parentTeamId?.trim()?.takeIf { it.isNotBlank() } ?: id.trim()

    private suspend fun resolveTeamRegistrationTarget(team: TeamWithPlayers): Result<TeamWithPlayers> = runCatching {
        val targetTeamId = team.team.registrationTargetTeamId()
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
        if (result.requiresParentApproval) {
            _errorState.value = ErrorMessage(
                result.userMessage("A parent or guardian must approve this team request before registration can continue."),
            )
            refreshEventDetails()
            return
        }

        if (result.requiresChildEmail()) {
            _errorState.value = ErrorMessage(
                result.userMessage("Add the child's email before continuing."),
            )
            return
        }

        if (result.requiresAdditionalSigning()) {
            runActionAfterRequiredSigning(teamId = team.team.id) {
                scope.launch {
                    _startingTeamRegistrationId.value = team.team.id
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
                    if (pendingTeamRegistration == null) {
                        _startingTeamRegistrationId.value = null
                    }
                }
            }
            return
        }

        continueTeamRegistration(team, result)
    }

    private suspend fun continueTeamRegistration(
        team: TeamWithPlayers,
        result: TeamRegistrationResult,
    ) {
        val teamId = team.team.id.trim()
        if (teamId.isBlank()) {
            _errorState.value = ErrorMessage("This team is missing an id.")
            return
        }

        _startingTeamRegistrationId.value = teamId
        try {
            if (team.team.registrationPriceCents > 0) {
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
                            _registrationHoldExpiresAt.value = holdExpiresAt
                            saveCurrentRegistrationProgress(
                                step = "checkout",
                                registrationId = intent.registrationId,
                                holdExpiresAt = holdExpiresAt,
                            )
                        }
                    pendingTeamRegistration = team
                    showPaymentSheet(intent)
                }.onFailure { throwable ->
                    _errorState.value = ErrorMessage(
                        throwable.userMessage(result.userMessage("Unable to start team registration.")),
                    )
                    loadingHandler.hideLoading()
                }
                return
            }

            if (!result.isActive()) {
                _errorState.value = ErrorMessage(
                    result.userMessage("Unable to join this team."),
                )
                return
            }

            _usersTeam.value = teamRepository.getTeamWithPlayers(teamId).getOrNull() ?: team
            refreshCurrentUserMembershipState(selectedEvent.value)
            refreshEventDetails()
            clearCurrentRegistrationProgress()
            _errorState.value = ErrorMessage("You joined ${team.team.name}.")
        } finally {
            if (pendingTeamRegistration == null) {
                _startingTeamRegistrationId.value = null
            }
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
        _participantManagementSnapshot.value = EventParticipantManagementSnapshot()
        _participantManagementLoading.value = false
        _teamComplianceSummaries.value = emptyMap()
        _userComplianceSummaries.value = emptyMap()
        _participantComplianceLoading.value = false
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
            if (!ensureEventRegistrationQuestionsAnswered { joinEventAsTeam(team) }) return@launch
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
        _joinChoiceDialog.value = null
    }

    override fun dismissChildJoinSelectionDialog() {
        _childJoinSelectionDialog.value = null
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
            paymentPlan.allowPaymentPlans && paymentPlan.configuredPriceCents > 0 && !isEventFull.value
        } else {
            paymentPlan.allowPaymentPlans &&
                paymentPlan.configuredPriceCents > 0 &&
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
            totalAmountCents = paymentPlan.configuredPriceCents,
            installmentAmounts = paymentPlan.installmentAmounts,
            installmentDueDates = paymentPlan.installmentDueDates,
            installmentDueRelativeDays = paymentPlan.installmentDueRelativeDays,
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
            if (paymentPlan.priceCents == null) {
                _errorState.value = ErrorMessage("Set a price for this division before joining.")
                return
            }
            if (
                paymentPlan.allowPaymentPlans
                && paymentPlan.configuredPriceCents > 0
                && !isEventFull.value
                && !selectedEvent.value.teamSignup
            ) {
                var joinedByThisFlow = false
                loadingHandler.showLoading("Joining Event ...")
                val registrationResult = addCurrentUserToEventWithRegistrationAnswers(
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
                    clearCurrentRegistrationProgress()
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
            if (paymentPlan.configuredPriceCents <= 0 || isEventFull.value || selectedEvent.value.teamSignup) {
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
                createPurchaseIntentWithRegistrationAnswers(
                    event = selectedEvent.value,
                    priceCents = paymentPlan.configuredPriceCents,
                    occurrence = weeklyOccurrence,
                    divisionId = selectedDivision.value,
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
            if (paymentPlan.priceCents == null) {
                _errorState.value = ErrorMessage("Set a price for this division before joining.")
                return
            }
            if (
                paymentPlan.allowPaymentPlans
                && paymentPlan.configuredPriceCents > 0
                && !isEventFull.value
            ) {
                var joinedByThisFlow = false
                loadingHandler.showLoading("Joining Event ...")
                val joinResult = addTeamToEventWithRegistrationAnswers(
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
                    clearCurrentRegistrationProgress()
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
            if (paymentPlan.configuredPriceCents <= 0 || isEventFull.value) {
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
            } else {
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

    private suspend fun runActionAfterRequiredSigning(
        signerContext: SignerContext = SignerContext.PARTICIPANT,
        child: JoinChildOption? = null,
        teamId: String? = null,
        onReady: suspend () -> Unit,
    ) {
        pendingSignatureContexts = buildSignatureContextQueue(signerContext, child)
        pendingSignatureContextIndex = 0
        pendingSignatureChild = child
        pendingSignatureTeamId = teamId?.trim()?.takeIf(String::isNotBlank)
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

    private suspend fun fetchRequiredSignatureStepsForCurrentContext(): Result<List<SignStep>> {
        if (pendingSignatureContexts.isEmpty()) {
            return Result.success(emptyList())
        }

        val context = currentSignatureContext()
        pendingSignatureContext = context

        return pendingSignatureTeamId?.let { teamId ->
            billingRepository.getRequiredTeamSignLinks(
                teamId = teamId,
                signerContext = context,
                childUserId = pendingSignatureChild?.userId,
                childUserEmail = pendingSignatureChild?.email,
            )
        } ?: billingRepository.getRequiredSignLinks(
            eventId = selectedEvent.value.id,
            signerContext = context,
            childUserId = pendingSignatureChild?.userId,
            childUserEmail = pendingSignatureChild?.email,
        )
    }

    private fun SignStep.matchesPendingSignatureStep(other: SignStep): Boolean {
        if (templateId != other.templateId) {
            return false
        }
        val currentDocumentId = resolvedDocumentId()
        val otherDocumentId = other.resolvedDocumentId()
        return currentDocumentId == null || otherDocumentId == null || currentDocumentId == otherDocumentId
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

            if (refreshedSteps.none { refreshedStep -> refreshedStep.matchesPendingSignatureStep(step) }) {
                pendingSignatureSteps = refreshedSteps
                pendingSignatureStepIndex = 0
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
        if (pendingSignatureContexts.isEmpty()) {
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

            pendingSignatureSteps = allSteps
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

        _errorState.value = ErrorMessage("Waiting for signature sync...")
        pendingPdfSignaturePollJob = scope.launch {
            if (awaitSignatureStepClearance(currentStep)) {
                _webSignaturePrompt.value = null
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
        pendingSignatureTeamId = null
        pendingPostSignatureAction = null
        _textSignaturePrompt.value = null
        _webSignaturePrompt.value = null
    }

    private fun processPurchaseIntent(intent: PurchaseIntent) {
        if (!ensureDocumentSignedBeforePurchase(intent)) {
            return
        }

        intent.registrationHoldExpiresAt
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let { holdExpiresAt ->
                _registrationHoldExpiresAt.value = holdExpiresAt
                scope.launch {
                    saveCurrentRegistrationProgress(
                        step = "checkout",
                        registrationId = intent.registrationId,
                        holdExpiresAt = holdExpiresAt,
                    )
                }
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
            if (hasSelectedEventOrOccurrenceStarted(event)) {
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
            if (hasSelectedEventOrOccurrenceStarted(event)) {
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
                    applyParticipantSyncResult(result)
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
                    refreshParticipantManagementSnapshotIfNeeded(result.event)
                    refreshParticipantComplianceIfNeeded(result.event)
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
        val unsupportedFeatures = mobileEventEditUnsupportedFeatures(selectedEvent.value)
        if (enabled && unsupportedFeatures.isNotEmpty()) {
            _errorState.value = ErrorMessage(
                mobileEventEditUnsupportedMessage(unsupportedFeatures)
            )
            return
        }
        if (_isEditing.value == enabled) {
            return
        }
        if (enabled && !sportsCatalogLoaded) {
            loadSports(reportErrors = true)
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
        _editableLeagueTimeSlots.value = editableLeagueTimeSlotsForEvent(
            event = seededEvent,
            timeSlots = eventWithRelations.value.timeSlots,
        )
        if (enabled) {
            val selectedRentalIds = resolveAttachedRentalResourceIds(
                options = _availableRentalResources.value,
                slots = _editableLeagueTimeSlots.value,
                eventId = seededEvent.id,
            )
            _selectedRentalResourceIds.value = selectedRentalIds
            if (selectedRentalIds.isNotEmpty()) {
                syncSelectedRentalResourcesIntoEditDraft()
            }
        }
        if (!enabled) {
            _pendingStaffInvites.value = emptyList()
            _suggestedUsers.value = emptyList()
        }
        _isEditing.value = enabled
    }

    override fun editEventField(update: Event.() -> Event) {
        val previous = _editedEvent.value
        val updated = syncOfficialStaffingForSportTransition(
            previous = previous,
            updated = previous
                .update()
                .withSportRules(),
        )
        _editedEvent.value = updated
        _editableFields.value = syncEditableFieldsForEvent(previous, updated, _editableFields.value)
        _editableLeagueTimeSlots.value = syncEditableLeagueSlotBoundaries(
            previousEvent = previous,
            updatedEvent = updated,
            slots = _editableLeagueTimeSlots.value,
        )
    }

    override fun editTournamentField(update: Event.() -> Event) {
        val previous = _editedEvent.value
        val updated = syncOfficialStaffingForSportTransition(
            previous = previous,
            updated = previous
                .update()
                .withSportRules(),
        )
        _editedEvent.value = updated
        _editableFields.value = syncEditableFieldsForEvent(previous, updated, _editableFields.value)
        _editableLeagueTimeSlots.value = syncEditableLeagueSlotBoundaries(
            previousEvent = previous,
            updatedEvent = updated,
            slots = _editableLeagueTimeSlots.value,
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

    override fun searchInviteTeams(query: String) {
        val normalizedQuery = query.trim()
        if (normalizedQuery.length < 2) {
            _inviteTeamSuggestions.value = emptyList()
            _inviteTeamsLoading.value = false
            return
        }
        val event = selectedEvent.value
        if (!event.teamSignup) {
            _inviteTeamSuggestions.value = emptyList()
            _inviteTeamsLoading.value = false
            return
        }

        scope.launch {
            _inviteTeamsLoading.value = true
            teamRepository.searchTeamsForEventInvite(
                query = normalizedQuery,
                eventId = event.id,
                organizationId = currentInviteOrganizationId(event),
                sportName = currentInviteSportName(event),
                excludeTeamIds = eventParticipantTeamIdsForInviteSearch(event),
            ).onSuccess { teams ->
                _inviteTeamSuggestions.value = teams
            }.onFailure { error ->
                _inviteTeamSuggestions.value = emptyList()
                _errorState.value = ErrorMessage(error.userMessage("Unable to search teams."))
            }
            _inviteTeamsLoading.value = false
        }
    }

    override fun inviteTeamToEvent(team: Team) {
        val normalizedTeamId = team.id.trim()
        if (normalizedTeamId.isBlank()) {
            _errorState.value = ErrorMessage("Team id is required.")
            return
        }

        scope.launch {
            val event = selectedEvent.value
            if (!event.teamSignup) {
                _errorState.value = ErrorMessage("This event accepts individual players, not teams.")
                return@launch
            }
            if (eventParticipantTeamIdsForInviteSearch(event).contains(normalizedTeamId)) {
                _errorState.value = ErrorMessage("${team.name.ifBlank { "Team" }} is already in this event.")
                return@launch
            }
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
                _inviteTeamSuggestions.value = _inviteTeamSuggestions.value.filterNot { candidate ->
                    candidate.id == normalizedTeamId
                }
                _errorState.value = ErrorMessage("${team.name.ifBlank { "Team" }} added to the event.")
            }.onFailure { error ->
                _errorState.value = ErrorMessage(error.userMessage("Unable to add team."))
            }
            loadingHandler.hideLoading()
        }
    }

    override fun invitePlayerToEvent(user: UserData) {
        val normalizedUserId = user.id.trim()
        if (normalizedUserId.isBlank()) {
            _errorState.value = ErrorMessage("User id is required.")
            return
        }

        scope.launch {
            val event = selectedEvent.value
            if (event.teamSignup) {
                _errorState.value = ErrorMessage("This event accepts teams, not individual players.")
                return@launch
            }
            if (eventParticipantUserIdsForInviteSearch(event).contains(normalizedUserId)) {
                _errorState.value = ErrorMessage("${user.fullName.ifBlank { "Player" }} is already in this event.")
                return@launch
            }
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
                _suggestedUsers.value = _suggestedUsers.value.filterNot { candidate ->
                    candidate.id == normalizedUserId
                }
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
        return event.organizationId
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: eventWithRelations.value.organization?.id?.trim()?.takeIf(String::isNotBlank)
    }

    private fun currentInviteSportName(event: Event = selectedEvent.value): String? {
        return eventWithRelations.value.sport?.name
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: event.sportId?.trim()?.takeIf(String::isNotBlank)
    }

    private fun eventParticipantTeamIdsForInviteSearch(event: Event = selectedEvent.value): Set<String> = buildSet {
        event.teamIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .forEach(::add)
        eventWithRelations.value.teams.forEach { teamWithPlayers ->
            val team = teamWithPlayers.team
            team.id.trim().takeIf(String::isNotBlank)?.let(::add)
            team.parentTeamId?.trim()?.takeIf(String::isNotBlank)?.let(::add)
        }
    }

    private fun eventParticipantUserIdsForInviteSearch(event: Event = selectedEvent.value): Set<String> = buildSet {
        addAll(event.playerIds.map(String::trim).filter(String::isNotBlank))
        addAll(event.waitListIds.map(String::trim).filter(String::isNotBlank))
        addAll(event.freeAgentIds.map(String::trim).filter(String::isNotBlank))
        eventWithRelations.value.players
            .map { player -> player.id.trim() }
            .filter(String::isNotBlank)
            .forEach(::add)
    }

    private suspend fun createEventPlayerInvite(
        event: Event,
        userId: String?,
        email: String?,
        firstName: String?,
        lastName: String?,
    ): Result<List<Invite>> {
        val eventId = event.id.trim()
        if (eventId.isBlank()) {
            return Result.failure(IllegalArgumentException("Event id is required."))
        }
        val creatorId = currentUser.value.id.trim().takeIf(String::isNotBlank)
        return userRepository.createInvites(
            invites = listOf(
                InviteCreateDto(
                    type = "EVENT",
                    status = "PENDING",
                    eventId = eventId,
                    organizationId = currentInviteOrganizationId(event),
                    userId = userId?.trim()?.takeIf(String::isNotBlank),
                    email = email?.trim()?.lowercase()?.takeIf(String::isNotBlank),
                    firstName = firstName?.trim()?.takeIf(String::isNotBlank),
                    lastName = lastName?.trim()?.takeIf(String::isNotBlank),
                    createdBy = creatorId,
                ),
            ),
        )
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
                setDurationMinutes = setDurationMinutes,
                pointsToVictory = normalizedPoints,
                matchDurationMinutes = null,
                divisionDetails = divisionDetails.map { detail ->
                    detail.applyLeagueDivisionSportRules(requiresSets = true)
                },
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
                divisionDetails = divisionDetails.map { detail ->
                    detail.applyLeagueDivisionSportRules(requiresSets = false)
                },
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
                divisionDetails = divisionDetails.map { detail ->
                    detail.copy(playoffConfig = detail.playoffConfig?.applyTournamentSportRules(requiresSets = false))
                },
            )
        } else {
            val allowedSetCounts = setOf(1, 3, 5)
            val winnerSets = winnerSetCount.takeIf { allowedSetCounts.contains(it) } ?: 1
            val loserSets = loserSetCount.takeIf { allowedSetCounts.contains(it) } ?: 1
            copy(
                usesSets = true,
                setDurationMinutes = setDurationMinutes,
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
                divisionDetails = divisionDetails.map { detail ->
                    detail.copy(playoffConfig = detail.playoffConfig?.applyTournamentSportRules(requiresSets = true))
                },
            )
        }
    }

    private fun DivisionDetail.applyLeagueDivisionSportRules(requiresSets: Boolean): DivisionDetail {
        return if (requiresSets) {
            val allowedSetCounts = setOf(1, 3, 5)
            val normalizedSets = setsPerMatch?.takeIf { count -> count in allowedSetCounts } ?: 1
            val normalizedPoints = pointsToVictory
                .take(normalizedSets)
                .toMutableList()
                .apply {
                    while (size < normalizedSets) add(21)
                }
            copy(
                usesSets = true,
                setsPerMatch = normalizedSets,
                setDurationMinutes = setDurationMinutes,
                pointsToVictory = normalizedPoints,
                matchDurationMinutes = null,
                playoffConfig = playoffConfig?.applyTournamentSportRules(requiresSets = true),
            )
        } else {
            copy(
                usesSets = false,
                setsPerMatch = null,
                setDurationMinutes = null,
                pointsToVictory = emptyList(),
                matchDurationMinutes = matchDurationMinutes,
                playoffConfig = playoffConfig?.applyTournamentSportRules(requiresSets = false),
            )
        }
    }

    private fun TournamentConfig.applyTournamentSportRules(requiresSets: Boolean): TournamentConfig {
        return if (requiresSets) {
            val allowedSetCounts = setOf(1, 3, 5)
            val winnerSets = winnerSetCount.takeIf { count -> count in allowedSetCounts } ?: 1
            val loserSets = loserSetCount.takeIf { count -> count in allowedSetCounts } ?: 1
            copy(
                usesSets = true,
                setDurationMinutes = setDurationMinutes,
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
        } else {
            copy(
                usesSets = false,
                setDurationMinutes = null,
                matchDurationMinutes = matchDurationMinutes,
                winnerSetCount = 1,
                loserSetCount = 1,
                winnerBracketPointsToVictory = winnerBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
                loserBracketPointsToVictory = loserBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
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
                    location = eventFieldLocationDefault(field, currentEvent),
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
                location = defaultFieldLocation(currentEvent),
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

    override fun setRentalResourceSelected(optionId: String, selected: Boolean) {
        val normalizedOptionId = optionId.trim()
        if (normalizedOptionId.isEmpty()) return
        _availableRentalResources.value.firstOrNull { option -> option.id == normalizedOptionId } ?: return
        val nextSelected = if (selected) {
            _selectedRentalResourceIds.value + normalizedOptionId
        } else {
            _selectedRentalResourceIds.value - normalizedOptionId
        }
        if (nextSelected == _selectedRentalResourceIds.value) {
            return
        }
        _selectedRentalResourceIds.value = nextSelected
        syncSelectedRentalResourcesIntoEditDraft()
    }

    override fun updateLeagueScoringConfig(update: LeagueScoringConfigDTO.() -> LeagueScoringConfigDTO) {
        _editableLeagueScoringConfig.value = _editableLeagueScoringConfig.value.update()
    }

    override fun addLeagueTimeSlot() {
        _editableLeagueTimeSlots.value = _editableLeagueTimeSlots.value + createDefaultLeagueSlot(_editedEvent.value)
    }

    override fun updateLeagueTimeSlot(index: Int, update: TimeSlot.() -> TimeSlot) {
        val slots = _editableLeagueTimeSlots.value.toMutableList()
        if (index !in slots.indices) return
        val validFieldIds = _editableFields.value.map { field -> field.id }.toSet()
        slots[index] = normalizeRentalSlotResourceSelection(slots[index].update(), validFieldIds)
        _editableLeagueTimeSlots.value = slots
    }

    override fun removeLeagueTimeSlot(index: Int) {
        val slots = _editableLeagueTimeSlots.value.toMutableList()
        if (index !in slots.indices) return
        slots.removeAt(index)
        _editableLeagueTimeSlots.value = slots
    }

    private fun loadAvailableRentalResources(eventId: String) {
        scope.launch {
            billingRepository.listRentalResourceOptions(eventId = eventId.takeIf(String::isNotBlank))
                .onSuccess { options ->
                    _availableRentalResources.value = options
                    val availableIds = options.map { option -> option.id }.toSet()
                    val attachedIds = resolveAttachedRentalResourceIds(options, _editableLeagueTimeSlots.value, eventId)
                    val normalizedSelected = (_selectedRentalResourceIds.value.filter(availableIds::contains) + attachedIds)
                        .toSet()
                    if (normalizedSelected != _selectedRentalResourceIds.value) {
                        _selectedRentalResourceIds.value = normalizedSelected
                        if (_isEditing.value) {
                            syncSelectedRentalResourcesIntoEditDraft()
                        }
                    }
                }
                .onFailure { error ->
                    Napier.w("Unable to load event rental resources: ${error.message}")
                }
        }
    }

    private fun resolveAttachedRentalResourceIds(
        options: List<RentalResourceOption>,
        slots: List<TimeSlot>,
        eventId: String,
    ): Set<String> {
        val rentalSlotItemIds = slots
            .filter { slot -> slot.isRentalBacked() }
            .mapNotNull { slot -> slot.rentalBookingItemId?.trim()?.takeIf(String::isNotBlank) }
            .toSet()
        val rentalSlotBookingIds = slots
            .filter { slot -> slot.isRentalBacked() }
            .mapNotNull { slot -> slot.rentalBookingId?.trim()?.takeIf(String::isNotBlank) }
            .toSet()
        return options
            .filter { option ->
                option.eventId == eventId ||
                    rentalSlotItemIds.contains(option.bookingItemId) ||
                    rentalSlotBookingIds.contains(option.bookingId)
            }
            .map { option -> option.id }
            .toSet()
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
        validFieldIds: Set<String> = _editableFields.value.map { field -> field.id }.toSet(),
    ): TimeSlot {
        val availableRentalOptions = _availableRentalResources.value
        val rentalOptionsByFieldId = availableRentalOptions
            .mapNotNull { option ->
                option.field.id.trim().takeIf(String::isNotBlank)?.let { fieldId -> fieldId to option }
            }
            .toMap()

        if (!slot.isRentalBacked()) {
            if (rentalOptionsByFieldId.isEmpty()) {
                return slot
            }
            val retainedFieldIds = slot.normalizedScheduledFieldIds().filter { fieldId ->
                (validFieldIds.isEmpty() || fieldId in validFieldIds) && !rentalOptionsByFieldId.containsKey(fieldId)
            }
            return slot.copy(
                scheduledFieldId = retainedFieldIds.firstOrNull(),
                scheduledFieldIds = retainedFieldIds,
            )
        }

        val primaryRentalFieldId = availableRentalOptions
            .firstOrNull { option -> slot.rentalBookingItemId == option.bookingItemId }
            ?.field
            ?.id
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: slot.scheduledFieldId?.trim()?.takeIf(String::isNotBlank)

        val retainedFieldIds = slot.normalizedScheduledFieldIds().filter { fieldId ->
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

    private fun syncSelectedRentalResourcesIntoEditDraft() {
        val selectedOptions = selectedRentalResourceOptions()
        val rentalFields = selectedRentalResourceFields(selectedOptions)
        val rentalFieldIds = rentalFields.map { field -> field.id.trim() }.filter(String::isNotBlank).toSet()
        val customFields = _editableFields.value.filterNot { field -> rentalFieldIds.contains(field.id.trim()) }
        val nextFields = (rentalFields + customFields)
            .distinctBy { field -> field.id.trim() }
            .mapIndexed { index, field -> field.copy(fieldNumber = index + 1) }

        val rentalSlots = selectedOptions.map { option -> option.toRentalTimeSlot(_editedEvent.value) }
        val rentalSlotIds = rentalSlots.map { slot -> slot.id }.toSet()
        val validFieldIds = nextFields.map { field -> field.id }.toSet()
        val customSlots = _editableLeagueTimeSlots.value
            .filterNot { slot -> slot.isRentalBacked() || rentalSlotIds.contains(slot.id) }
            .map { slot ->
                val remainingFieldIds = slot.normalizedScheduledFieldIds().filter { fieldId ->
                    validFieldIds.contains(fieldId) && !rentalFieldIds.contains(fieldId)
                }
                slot.copy(
                    scheduledFieldId = remainingFieldIds.firstOrNull(),
                    scheduledFieldIds = remainingFieldIds,
                )
            }
            .filter { slot -> slot.normalizedScheduledFieldIds().isNotEmpty() }

        _editableFields.value = nextFields
        _fieldCount.value = nextFields.size
        _editableLeagueTimeSlots.value = (rentalSlots + customSlots).sortedWith(
            compareBy<TimeSlot> { slot -> slot.startDate }
                .thenBy { slot -> slot.startTimeMinutes ?: Int.MAX_VALUE }
                .thenBy { slot -> slot.id }
        )
        _editedEvent.value = _editedEvent.value.copy(
            fieldIds = nextFields.map { field -> field.id },
            timeSlotIds = _editableLeagueTimeSlots.value.map { slot -> slot.id },
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
                    location = eventFieldLocationDefault(field, templateEvent),
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
        val result = EventEditPayloadBuilder.prepareForUpdate(
            EventEditPayloadInput(
                editedEvent = _editedEvent.value.copy(
                    matchRulesOverride = matchRulesOverrideWithoutSegmentCount(_editedEvent.value.matchRulesOverride),
                ),
                editableFields = _editableFields.value,
                editableLeagueTimeSlots = _editableLeagueTimeSlots.value,
                selectedRentalFields = selectedRentalResourceFields(),
                leagueScoringConfig = _editableLeagueScoringConfig.value,
                originalEventStart = eventWithRelations.value.event.start,
                normalizeSlotResourceSelection = { slot, validFieldIds ->
                    normalizeRentalSlotResourceSelection(slot, validFieldIds)
                },
            )
        )
        result.editableFields?.let { fields ->
            _editableFields.value = fields
            _fieldCount.value = fields.size
            _editedEvent.value = _editedEvent.value.copy(fieldIds = fields.map { field -> field.id })
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
        val shareService = shareServiceProvider.getShareService()
        shareService.share(
            selectedEvent.value.name, createEventUrl(selectedEvent.value)
        )
    }

    override fun shareEventQrCode() {
        val targetEvent = selectedEvent.value
        val client = apiClient ?: run {
            _errorState.value = ErrorMessage("Failed to share QR code.")
            return
        }
        scope.launch {
            runCatching {
                client.getBytes(getEventQrCodePath(targetEvent.id))
            }.onSuccess { imageBytes ->
                shareServiceProvider.getShareService().shareImage(
                    title = "${targetEvent.name} QR Code",
                    imageBytes = imageBytes,
                    fileName = "event-qr-code.png",
                    mimeType = "image/png",
                )
            }.onFailure { throwable ->
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to share QR code.")
                )
            }
        }
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
            _isRegistrationPaymentPending.value = false
            _isRegistrationPaymentFailed.value = false
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
            _isRegistrationPaymentPending.value = cachedState.paymentPending
            _isRegistrationPaymentFailed.value = cachedState.paymentFailed
            _isUserInWaitlist.value = cachedState.waitlist
            _isUserFreeAgent.value = cachedState.freeAgent
            _usersTeam.value = cachedState.teamId
                ?.let { teamId -> teamRepository.getTeamWithPlayers(teamId).getOrNull() }
            _isUserCaptain.value = checkIsUserCaptain()
            return
        }

        _isUserInEvent.value = checkIsUserInEvent(event)
        _isRegistrationPaymentPending.value = false
        _isRegistrationPaymentFailed.value = false
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
            val matchesRegistrant = when (registration.registrantType.trim().uppercase()) {
                "SELF" -> currentUserId.isNotBlank() && registration.registrantId == currentUserId
                "TEAM" -> registration.matchesCurrentUserTeamIds(currentUserTeamIds)
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

        val activeRegistrations = matchingRegistrations.filter { registration ->
            registration.isActiveForMembership()
        }
        val participant = activeRegistrations.any { registration ->
            registration.normalizedRosterRole() == "PARTICIPANT"
        }
        val waitlist = activeRegistrations.any { registration ->
            registration.normalizedRosterRole() == "WAITLIST"
        }
        val freeAgent = activeRegistrations.any { registration ->
            registration.normalizedRosterRole() == "FREE_AGENT"
        }
        val paymentPending = activeRegistrations.any { registration ->
            registration.isPaymentPending()
        }
        val paymentFailed = matchingRegistrations.any { registration ->
            registration.isPaymentFailed()
        }
        val teamId = activeRegistrations
            .firstOrNull { registration -> registration.registrantType.trim().uppercase() == "TEAM" }
            ?.resolvedEventTeamId()

        return CurrentUserRegistrationMembershipState(
            participant = participant,
            waitlist = waitlist,
            freeAgent = freeAgent,
            paymentPending = paymentPending,
            paymentFailed = paymentFailed,
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
        val priceCents: Int?,
        val allowPaymentPlans: Boolean,
        val installmentAmounts: List<Int>,
        val installmentDueDates: List<String>,
        val installmentDueRelativeDays: List<Int>,
    ) {
        val configuredPriceCents: Int get() = priceCents ?: 0
    }

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
                detail.id.normalizeDivisionIdentifier() == normalizedPreferredDivision
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
        val allowPaymentPlans = selectedDivision?.allowPaymentPlans == true
        val useRelativeDueDates = isWeeklyParentEvent(event)

        return EffectivePaymentPlan(
            priceCents = event.resolvedDivisionPriceCents(preferredDivisionId),
            allowPaymentPlans = allowPaymentPlans,
            installmentAmounts = if (allowPaymentPlans) {
                val configuredAmounts = selectedDivision?.installmentAmounts
                    ?.takeIf { amounts -> amounts.isNotEmpty() }
                    ?: emptyList()
                configuredAmounts.map { amount -> amount.coerceAtLeast(0) }
            } else {
                emptyList()
            },
            installmentDueDates = if (allowPaymentPlans && !useRelativeDueDates) {
                val configuredDueDates = selectedDivision?.installmentDueDates
                    ?.takeIf { dueDates -> dueDates.isNotEmpty() }
                    ?: emptyList()
                configuredDueDates
                    .map { dueDate -> dueDate.trim() }
                    .filter(String::isNotBlank)
            } else {
                emptyList()
            },
            installmentDueRelativeDays = if (allowPaymentPlans && useRelativeDueDates) {
                val configuredRelativeDays = selectedDivision?.installmentDueRelativeDays
                    ?.takeIf { dueDays -> dueDays.isNotEmpty() }
                    ?: emptyList()
                configuredRelativeDays
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

            val recordSignatureResult = pendingSignatureTeamId?.let { teamId ->
                billingRepository.recordTeamSignature(
                    teamId = teamId,
                    templateId = prompt.step.templateId,
                    documentId = documentId,
                    type = prompt.step.type,
                    signerContext = pendingSignatureContext,
                    childUserId = pendingSignatureChild?.userId,
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
                _textSignaturePrompt.value = null
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
            val normalizedActiveDivision = activeDivision.normalizeDivisionIdentifier()
            editable.filter { relation ->
                relation.match.division?.normalizeDivisionIdentifier() == normalizedActiveDivision
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
