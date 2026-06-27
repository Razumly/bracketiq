@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
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
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventComplianceUserSummary
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantDivisionWarning
import com.razumly.mvp.core.data.repositories.EventParticipantManagementSnapshot
import com.razumly.mvp.core.data.repositories.EventParticipantsSummary
import com.razumly.mvp.core.data.repositories.EventTeamBillCreateRequest
import com.razumly.mvp.core.data.repositories.EventTeamBillingSnapshot
import com.razumly.mvp.core.data.repositories.EventTeamComplianceSummary
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckout
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckoutRequest
import com.razumly.mvp.core.data.repositories.FeeBreakdown
import com.razumly.mvp.core.data.repositories.LeagueDivisionStandings
import com.razumly.mvp.core.data.repositories.RentalResourceOption
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.TeamJoinQuestion
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable
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
    val discountCodePrompt: StateFlow<DiscountCodePromptState?>
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
    suspend fun reviewParticipantManualPaymentProof(
        billId: String,
        billPaymentId: String,
        proofId: String,
        decision: String,
        amountAcceptedCents: Int? = null,
        reviewNote: String? = null,
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
    fun continueFromDiscountCodePrompt(code: String?)
    fun dismissDiscountCodePrompt()
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
