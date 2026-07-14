package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.materialkolor.PaletteStyle
import com.materialkolor.dynamiccolor.ColorSpec
import com.materialkolor.ktx.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.addOfficialPosition
import com.razumly.mvp.core.data.dataTypes.addOfficialUser
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.divisionPriceRange
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.canManageEventsForViewer
import com.razumly.mvp.core.data.dataTypes.hasAnyPaidDivision
import com.razumly.mvp.core.data.dataTypes.isAffiliateEvent
import com.razumly.mvp.core.data.dataTypes.isDraftLikeState
import com.razumly.mvp.core.data.dataTypes.isPrivateState
import com.razumly.mvp.core.data.dataTypes.resolvedDivisionPriceCents
import com.razumly.mvp.core.data.dataTypes.removeOfficialPosition
import com.razumly.mvp.core.data.dataTypes.removeOfficialUser
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
import com.razumly.mvp.core.data.dataTypes.updateOfficialPosition
import com.razumly.mvp.core.data.dataTypes.updateOfficialUserPositions
import com.razumly.mvp.core.data.dataTypes.usesManualRegistrationPayments
import com.razumly.mvp.core.data.dataTypes.usesTeamOfficialScheduling
import com.razumly.mvp.core.data.dataTypes.withDoTeamsOfficiate
import com.razumly.mvp.core.data.dataTypes.withOfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.presentation.EventDetailInitialTab
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.PlayerInteractionComponent
import com.razumly.mvp.core.presentation.composables.PreparePaymentProcessor
import com.razumly.mvp.core.presentation.composables.PullToRefreshContainer
import com.razumly.mvp.core.presentation.guides.EventGuideIds
import com.razumly.mvp.core.presentation.guides.EventGuideTargets
import com.razumly.mvp.core.presentation.guides.LocalGuideController
import com.razumly.mvp.core.presentation.guides.eventBracketTabGuide
import com.razumly.mvp.core.presentation.guides.eventOverviewGuide
import com.razumly.mvp.core.presentation.guides.eventParticipantsTabGuide
import com.razumly.mvp.core.presentation.guides.eventScheduleTabGuide
import com.razumly.mvp.core.presentation.guides.eventStandingsTabGuide
import com.razumly.mvp.core.presentation.util.CircularRevealUnderlay
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.core.util.resolvedTimeZone
import com.razumly.mvp.eventDetail.composables.ParticipantsSection
import com.razumly.mvp.eventDetail.composables.ScheduleItem
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import dev.icerock.moko.geo.LatLng
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlinx.datetime.toLocalDateTime
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

val LocalTournamentComponent =
    compositionLocalOf<EventDetailComponent> { error("No tournament provided") }

@Composable
@OptIn(ExperimentalTime::class, ExperimentalMaterial3Api::class)
fun EventDetailScreen(
    component: EventDetailComponent,
    mapComponent: MapComponent,
    initialTab: EventDetailInitialTab = EventDetailInitialTab.DEFAULT,
) {
    PreparePaymentProcessor(component)

    val popupHandler = LocalPopupHandler.current
    val loadingHandler = LocalLoadingHandler.current
    val selectedEvent by component.eventWithRelations.collectAsState()
    val sports by component.sports.collectAsState()
    val eventTags by component.eventTags.collectAsState()
    val divisionTypeParameters by component.divisionTypeParameters.collectAsState()
    val currentUser by component.currentUser.collectAsState()
    val showEventTeamCheckInDialog by component.showEventTeamCheckInDialog.collectAsState()
    val eventTeamCheckInSaving by component.eventTeamCheckInSaving.collectAsState()
    val currentUserManagedEventTeamId by component.currentUserManagedEventTeamId.collectAsState()
    val playerInteractionComponent = remember {
        getKoin().get<PlayerInteractionComponent> { parametersOf(component) }
    }
    val scheduleTrackedUserIds by component.scheduleTrackedUserIds.collectAsState()
    val validTeams by component.validTeams.collectAsState()
    val showDetails by component.showDetails.collectAsState()
    val eventTeamsAndParticipantsLoading by component.eventTeamsAndParticipantsLoading.collectAsState()
    val participantDivisionWarnings by component.participantDivisionWarnings.collectAsState()
    val eventMatchesLoading by component.eventMatchesLoading.collectAsState()
    val editedEvent by component.editedEvent.collectAsState()
    val showMap by mapComponent.showMap.collectAsState()
    val editableMatches by component.editableMatches.collectAsState()
    val eventFields by component.eventFields.collectAsState()
    val selectedDivision by component.selectedDivision.collectAsState()
    val selectedWeeklyOccurrence by component.selectedWeeklyOccurrence.collectAsState()
    val selectedWeeklyOccurrenceSummary by component.selectedWeeklyOccurrenceSummary.collectAsState()
    val weeklyOccurrenceSummaries by component.weeklyOccurrenceSummaries.collectAsState()
    val overviewParticipantSummary by component.overviewParticipantSummary.collectAsState()
    val losersBracket by component.losersBracket.collectAsState()
    val showTeamDialog by component.showTeamSelectionDialog.collectAsState()
    val showMatchEditDialog by component.showMatchEditDialog.collectAsState()
    val joinChoiceDialog by component.joinChoiceDialog.collectAsState()
    val childJoinSelectionDialog by component.childJoinSelectionDialog.collectAsState()
    val teamJoinQuestionDialog by component.teamJoinQuestionDialog.collectAsState()
    val eventRegistrationQuestionDialog by component.eventRegistrationQuestionDialog.collectAsState()
    val eventRegistrationQuestions by component.eventRegistrationQuestions.collectAsState()
    val eventRegistrationQuestionAnswers by component.eventRegistrationQuestionAnswers.collectAsState()
    val eventRegistrationQuestionsExpanded by component.eventRegistrationQuestionsExpanded.collectAsState()
    val registrationHoldExpiresAt by component.registrationHoldExpiresAt.collectAsState()
    val paymentPlanPreviewDialog by component.paymentPlanPreviewDialog.collectAsState()
    val withdrawTargets by component.withdrawTargets.collectAsState()
    val textSignaturePrompt by component.textSignaturePrompt.collectAsState()
    val webSignaturePrompt by component.webSignaturePrompt.collectAsState()
    val billingAddressPrompt by component.billingAddressPrompt.collectAsState()
    val discountCodePrompt by component.discountCodePrompt.collectAsState()
    val eventImageIds by component.eventImageIds.collectAsState()
    val organizationTemplates by component.organizationTemplates.collectAsState()
    val organizationTemplatesLoading by component.organizationTemplatesLoading.collectAsState()
    val organizationTemplatesError by component.organizationTemplatesError.collectAsState()
    val leagueDivisionStandings by component.leagueDivisionStandings.collectAsState()
    val leagueDivisionStandingsLoading by component.leagueDivisionStandingsLoading.collectAsState()
    val leagueStandingsConfirming by component.leagueStandingsConfirming.collectAsState()
    val suggestedUsers by component.suggestedUsers.collectAsState()
    val inviteTeamSuggestions by component.inviteTeamSuggestions.collectAsState()
    val inviteTeamsLoading by component.inviteTeamsLoading.collectAsState()
    val pendingStaffInvites by component.pendingStaffInvites.collectAsState()
    val editableLeagueTimeSlots by component.editableLeagueTimeSlots.collectAsState()
    val editableFieldsForDetails by component.editableFields.collectAsState()
    val availableRentalResources by component.availableRentalResources.collectAsState()
    val selectedRentalResourceIds by component.selectedRentalResourceIds.collectAsState()
    val editableLeagueScoringConfig by component.editableLeagueScoringConfig.collectAsState()

    val isHost by component.isHost.collectAsState()
    val isEditing by component.isEditing.collectAsState()
    val isEventFull by component.isEventFull.collectAsState()
    val isUserInEvent by component.isUserInEvent.collectAsState()
    val isRegistrationPaymentPending by component.isRegistrationPaymentPending.collectAsState()
    val isRegistrationPaymentFailed by component.isRegistrationPaymentFailed.collectAsState()
    val isFreeAgent by component.isUserFreeAgent.collectAsState()
    val isWaitListed by component.isUserInWaitlist.collectAsState()
    val isCaptain by component.isUserCaptain.collectAsState()
    val isDark = isSystemInDarkTheme()
    val isEditingMatches by component.isEditingMatches.collectAsState()
    val isTemplateEvent = selectedEvent.event.state.equals("TEMPLATE", ignoreCase = true)
    val canShowQrCode = !isTemplateEvent &&
        !selectedEvent.event.isDraftLikeState() &&
        !selectedEvent.event.isPrivateState()
    val eventType = selectedEvent.event.eventType
    val isTournamentEvent = eventType == EventType.TOURNAMENT
    val tournamentPoolPlayEnabled = selectedEvent.event.isTournamentPoolPlayEnabled()
    val hasBracketView = isTournamentEvent ||
        (eventType == EventType.LEAGUE && selectedEvent.event.includePlayoffs)
    val hasScheduleView = eventType == EventType.LEAGUE ||
        eventType == EventType.TOURNAMENT ||
        eventType == EventType.WEEKLY_EVENT ||
        selectedEvent.matches.isNotEmpty()
    val hasStandingsView = eventType == EventType.LEAGUE || tournamentPoolPlayEnabled
    val isAssistantHost = remember(currentUser.id, selectedEvent.event.assistantHostIds) {
        val currentUserId = currentUser.id.trim()
        currentUserId.isNotBlank() && selectedEvent.event.assistantHostIds.any { assistantHostId ->
            assistantHostId.trim() == currentUserId
        }
    }
    val isEventOfficial = remember(
        currentUser.id,
        selectedEvent.event.eventOfficials,
        selectedEvent.event.officialIds,
    ) {
        isCurrentUserEventOfficial(
            currentUserId = currentUser.id,
            event = selectedEvent.event,
        )
    }
    val isOrganizationManager = remember(
        currentUser.id,
        selectedEvent.organization?.ownerId,
        selectedEvent.organization?.staffMembers,
        selectedEvent.organization?.staffInvites,
        selectedEvent.organization?.viewerPermissions,
    ) {
        val currentUserId = currentUser.id.trim()
        selectedEvent.organization?.canManageEventsForViewer(currentUserId) == true
    }
    val canManageTemplate = remember(isHost, isAssistantHost, isOrganizationManager) {
        isHost || isAssistantHost || isOrganizationManager
    }
    val canEditEventDetails = remember(
        isHost,
        canManageTemplate,
        selectedEvent.event,
    ) {
        canEditEventDetailsOnMobile(
            event = selectedEvent.event,
            isHost = isHost,
            canManageTemplate = canManageTemplate,
        )
    }
    val canDeleteEvent = remember(isHost, isTemplateEvent, canManageTemplate) {
        if (isTemplateEvent) {
            canManageTemplate
        } else {
            isHost
        }
    }
    val canCreateTemplateFromCurrentEvent = remember(isHost, isTemplateEvent, selectedEvent.event.organizationId) {
        isHost && !isTemplateEvent && selectedEvent.event.organizationId.isNullOrBlank()
    }
    val canManageLeagueStandings = remember(
        currentUser.id,
        selectedEvent.event.hostId,
        selectedEvent.event.assistantHostIds,
    ) {
        val currentUserId = currentUser.id.trim()
        currentUserId.isNotBlank() && (
            selectedEvent.event.hostId.trim() == currentUserId ||
                selectedEvent.event.assistantHostIds.any { assistantHostId ->
                    assistantHostId.trim() == currentUserId
                }
            )
    }
    val showOfficialsPanel = remember(
        currentUser.id,
        selectedEvent.event,
        selectedEvent.organization,
    ) {
        canViewOfficialsPanel(
            currentUserId = currentUser.id,
            event = selectedEvent.event,
            organization = selectedEvent.organization,
        )
    }
    val selectedSport = remember(sports, editedEvent.sportId) {
        sports.firstOrNull { it.id == editedEvent.sportId }
    }
    val standingsSport = remember(sports, selectedEvent.event.sportId) {
        sports.firstOrNull { it.id == selectedEvent.event.sportId }
    }
    val showStandingsDrawColumn = remember(selectedEvent.event, standingsSport) {
        resolveLeagueStandingsSupportsDraw(
            event = selectedEvent.event,
            sport = standingsSport,
        )
    }
    val canConfirmLeagueResultsFromDock = hasStandingsView && canManageLeagueStandings
    val canManageMatchEditingFromDock = canManageTemplate
    val canEditMatches = canManageMatchEditingFromDock && isEditingMatches
    val showScheduleMatchManagement = canManageMatchEditingFromDock &&
        shouldShowScheduleMatchManagement(eventType)
    val canManageParticipantsFromDock = canManageTemplate
    val showEventCheckInBadges = remember(
        selectedEvent.event.teamSignup,
        selectedEvent.event.teamCheckInMode,
        canManageParticipantsFromDock,
        isEventOfficial,
    ) {
        selectedEvent.event.teamSignup &&
            selectedEvent.event.teamCheckInMode.name == "EVENT" &&
            (canManageParticipantsFromDock || isEventOfficial)
    }
    val currentUserManagedEventTeam = remember(
        currentUserManagedEventTeamId,
        selectedEvent.teams,
    ) {
        selectedEvent.teams.firstOrNull { team ->
            team.team.id == currentUserManagedEventTeamId
        }
    }

    var showTeamSelectionDialog by remember { mutableStateOf(false) }
    var showFab by remember { mutableStateOf(false) }
    var showOptionsDropdown by remember { mutableStateOf(false) }
    var showQrCodeDialog by remember { mutableStateOf(false) }
    var showEventStateDropdown by remember { mutableStateOf(false) }
    var showDeleteConfirmation by remember { mutableStateOf(false) }
    var showWithdrawTargetDialog by remember { mutableStateOf(false) }
    var showRefundReasonDialog by remember { mutableStateOf(false) }
    var showReportEventDialog by remember { mutableStateOf(false) }
    var reportEventNotes by remember { mutableStateOf("") }
    var selectedWithdrawalTarget by remember { mutableStateOf<WithdrawTargetOption?>(null) }
    var refundReason by remember { mutableStateOf("") }
    var showNotifyDialog by remember { mutableStateOf(false) }
    var showJoinOptionsSheet by remember { mutableStateOf(false) }
    var showInviteTeamDialog by rememberSaveable { mutableStateOf(false) }
    var showInvitePlayerDialog by rememberSaveable { mutableStateOf(false) }
    var selectedJoinOptionDivisionId by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedSchedulePoolDivisionId by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedStandingsPoolDivisionId by rememberSaveable { mutableStateOf<String?>(null) }
    var showStandingsConfirmDialog by remember { mutableStateOf(false) }
    var showBuildBracketConfirmDialog by remember { mutableStateOf(false) }
    var showRebuildWithoutPlaceholdersConfirmDialog by remember { mutableStateOf(false) }
    var showStickyDockByScroll by remember { mutableStateOf(true) }
    var mapRevealCenter by remember { mutableStateOf(Offset.Zero) }
    var pendingMapPlace by remember { mutableStateOf<MVPPlace?>(null) }
    var isLocationPickerMapMode by remember { mutableStateOf(false) }
    var isManagingParticipants by rememberSaveable { mutableStateOf(false) }
    fun originalLocationPlace(): MVPPlace? {
        val lat = editedEvent.lat
        val long = editedEvent.long
        if (editedEvent.location.isBlank() || (lat == 0.0 && long == 0.0)) return null
        return MVPPlace(
            name = editedEvent.location,
            id = "__selected_event_location__",
            coordinates = listOf(long, lat),
            address = editedEvent.address,
        )
    }
    val hasAnyPaidDivision = remember(
        selectedEvent.event.priceCents,
        selectedEvent.event.divisions,
        selectedEvent.event.divisionDetails,
    ) {
        selectedEvent.event.hasAnyPaidDivision()
    }

    var imageScheme by remember {
        mutableStateOf(
            DynamicScheme(
                seedColor = Color(selectedEvent.event.seedColor),
                isDark = isDark,
                specVersion = ColorSpec.SpecVersion.SPEC_2025,
                style = PaletteStyle.Neutral,
            )
        )
    }

    LaunchedEffect(isEditing, selectedEvent, editedEvent) {
        imageScheme = DynamicScheme(
            seedColor = if (isEditing) Color(editedEvent.seedColor) else Color(selectedEvent.event.seedColor),
            isDark = isDark,
            specVersion = ColorSpec.SpecVersion.SPEC_2025,
            style = PaletteStyle.Neutral,
        )
    }

    val refundPolicy = getRefundPolicy(
        event = selectedEvent.event,
        effectiveStart = selectedWeeklyOccurrence?.sessionStart ?: selectedEvent.event.start,
    )
    val eventHasStarted = refundPolicy.eventHasStarted
    val isWeeklyEvent = selectedEvent.event.eventType == EventType.WEEKLY_EVENT
    val selectedWeeklyOccurrenceStarted = remember(selectedWeeklyOccurrence?.sessionStart) {
        selectedWeeklyOccurrence?.sessionStart?.let { sessionStart ->
            Clock.System.now() >= sessionStart
        } == true
    }
    val joinBlockedByStart = if (isWeeklyEvent) {
        selectedWeeklyOccurrenceStarted
    } else {
        eventHasStarted
    }
    val hasWeeklyParentTimeSlots = remember(selectedEvent.event.timeSlotIds) {
        selectedEvent.event.timeSlotIds.any { slotId -> slotId.isNotBlank() }
    }
    val hasDirectionsTarget = remember(
        selectedEvent.event.address,
        selectedEvent.event.lat,
        selectedEvent.event.long,
    ) {
        !selectedEvent.event.address.isNullOrBlank() ||
            selectedEvent.event.lat != 0.0 ||
            selectedEvent.event.long != 0.0
    }
    val isWeeklyParentEvent = isWeeklyEvent && hasWeeklyParentTimeSlots
    val weeklySessionOptions = remember(
        isWeeklyParentEvent,
        selectedEvent.event.id,
        selectedEvent.event.divisions,
        selectedEvent.event.divisionDetails,
        selectedEvent.timeSlots,
    ) {
        if (!isWeeklyParentEvent) {
            emptyList()
        } else {
            buildWeeklySessionOptions(
                event = selectedEvent.event,
                timeSlots = selectedEvent.timeSlots,
            )
        }
    }
    LaunchedEffect(
        isWeeklyParentEvent,
        selectedEvent.event.id,
        weeklySessionOptions,
    ) {
        if (!isWeeklyParentEvent) return@LaunchedEffect
        component.prefetchWeeklyOccurrenceSummaries(
            weeklySessionOptions.mapNotNull { session ->
                val slotId = session.slotId?.trim()?.takeIf(String::isNotBlank) ?: return@mapNotNull null
                EventOccurrenceSelection(
                    slotId = slotId,
                    occurrenceDate = session.occurrenceDate,
                    label = session.label,
                )
            },
        )
    }
    val weeklyScheduleOptions = remember(
        isWeeklyParentEvent,
        selectedEvent.event.id,
        selectedEvent.event.start,
        selectedEvent.event.end,
        selectedEvent.event.divisions,
        selectedEvent.event.divisionDetails,
        selectedEvent.timeSlots,
    ) {
        if (!isWeeklyParentEvent) {
            emptyList()
        } else {
            buildWeeklyScheduleOptions(
                event = selectedEvent.event,
                timeSlots = selectedEvent.timeSlots,
            )
        }
    }
    val weeklyScheduleOptionsById = remember(weeklyScheduleOptions) {
        weeklyScheduleOptions.associateBy { session -> session.id }
    }
    val weeklyScheduleItems = remember(
        weeklyScheduleOptions,
        selectedEvent.event,
    ) {
        weeklyScheduleOptions.map { session ->
            ScheduleItem.EventEntry(
                event = selectedEvent.event.copy(
                    id = session.id,
                    name = session.label,
                    location = session.divisionLabel,
                    start = session.start,
                    end = session.end,
                ),
            )
        }
    }
    val teamSignup = selectedEvent.event.teamSignup
    val teamSelectionSportLabel = remember(selectedEvent.sport, sports, selectedEvent.event.sportId) {
        selectedEvent.sport?.name
            ?: sports.firstOrNull { it.id == selectedEvent.event.sportId }?.name
            ?: selectedEvent.event.sportId
                ?.takeIf(String::isNotBlank)
                ?.replace('_', ' ')
                ?.replace('-', ' ')
                ?.toTitleCase()
            ?: "this event"
    }
    val canLeaveSelf = isUserInEvent && (!teamSignup || isCaptain || isFreeAgent || isWaitListed)
    val platformRefundsAvailable = hasAnyPaidDivision && !selectedEvent.event.usesManualRegistrationPayments()
    val selectableWithdrawTargets = remember(withdrawTargets, teamSignup, isCaptain) {
        withdrawTargets.filter { target ->
            if (!target.isSelf) return@filter true
            when (target.membership) {
                WithdrawTargetMembership.PARTICIPANT -> !teamSignup || isCaptain
                WithdrawTargetMembership.WAITLIST -> true
                WithdrawTargetMembership.FREE_AGENT -> true
            }
        }
    }
    val refundableWithdrawTargets = remember(withdrawTargets, platformRefundsAvailable) {
        if (!platformRefundsAvailable) {
            emptyList()
        } else {
            withdrawTargets.filter { it.membership == WithdrawTargetMembership.PARTICIPANT }
        }
    }
    val canRequestRefundAfterStart = eventHasStarted && refundableWithdrawTargets.isNotEmpty()
    val actionWithdrawTargets = if (canRequestRefundAfterStart) {
        refundableWithdrawTargets
    } else {
        selectableWithdrawTargets
    }
    val canLeaveEvent = !eventHasStarted && (canLeaveSelf || selectableWithdrawTargets.isNotEmpty())
    val singleWithdrawTarget = selectableWithdrawTargets.singleOrNull()
    val leaveMessage = when {
        selectableWithdrawTargets.size > 1 -> "Withdraw Profile"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.FREE_AGENT -> "Leave as Free Agent"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.WAITLIST -> "Leave Waitlist"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.PARTICIPANT &&
            platformRefundsAvailable &&
            refundPolicy.canAutoRefund -> "Withdraw and Get Refund"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.PARTICIPANT &&
            platformRefundsAvailable -> "Withdraw and Request Refund"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.PARTICIPANT -> "Leave Event"
        isFreeAgent -> "Leave as Free Agent"
        isWaitListed -> "Leave Waitlist"
        platformRefundsAvailable && refundPolicy.canAutoRefund -> "Leave and Get Refund"
        platformRefundsAvailable -> "Leave and Request Refund"
        else -> "Leave Event"
    }
    val openLeaveOrRefundForTarget: (WithdrawTargetOption?) -> Unit = { target ->
        val shouldRefund = when {
            target != null -> {
                target.membership == WithdrawTargetMembership.PARTICIPANT && platformRefundsAvailable
            }

            else -> {
                platformRefundsAvailable && !isFreeAgent && !isWaitListed
            }
        }

        if (shouldRefund) {
            if (refundPolicy.canAutoRefund) {
                component.withdrawAndRefund(target?.userId)
            } else {
                selectedWithdrawalTarget = target
                showRefundReasonDialog = true
            }
        } else {
            component.leaveEvent(target?.userId)
        }
    }
    val leaveOrRefundActionLabel = when {
        canRequestRefundAfterStart -> {
            if (actionWithdrawTargets.size > 1) {
                "Request Refunds"
            } else {
                "Request Refund"
            }
        }
        else -> leaveMessage
    }
    val openLeaveOrRefundAction: () -> Unit = {
        when {
            actionWithdrawTargets.size > 1 -> {
                showWithdrawTargetDialog = true
            }

            actionWithdrawTargets.size == 1 -> {
                openLeaveOrRefundForTarget(actionWithdrawTargets.first())
            }

            else -> {
                openLeaveOrRefundForTarget(null)
            }
        }
    }
    val selectedWeeklyOccurrenceJoined =
        isWeeklyParentEvent && selectedWeeklyOccurrence != null && isUserInEvent
    val isAffiliateEvent = selectedEvent.event.isAffiliateEvent()
    val shouldShowViewSchedulePrimaryAction = shouldUseViewSchedulePrimaryAction(
        isWeeklyParentEvent = isWeeklyParentEvent,
        isAffiliateEvent = isAffiliateEvent,
        isUserInEvent = isUserInEvent,
        isHost = isHost,
        isAssistantHost = isAssistantHost,
        isEventOfficial = isEventOfficial,
    )
    val showOverviewOpenDetailsAction = !isAffiliateEvent && (isWeeklyParentEvent || !shouldShowViewSchedulePrimaryAction)
    val showStickyActions = !showDetails && !isEditing && !showMap && showStickyDockByScroll
    val isEventRefreshInProgress = eventTeamsAndParticipantsLoading || eventMatchesLoading
    val joinDivisionOptions = remember(
        selectedDivision,
        selectedEvent.event.divisions,
        selectedEvent.event.divisionDetails,
        selectedEvent.matches,
    ) {
        val options = mutableListOf<BracketDivisionOption>()
        val seenIds = mutableSetOf<String>()
        fun addOption(rawId: String?, explicitLabel: String? = null) {
            val normalizedId = rawId
                ?.normalizeDivisionIdentifier()
                .orEmpty()
            if (normalizedId.isEmpty() || !seenIds.add(normalizedId)) {
                return
            }
            val label = explicitLabel
                ?.takeIf { it.isNotBlank() }
                ?: normalizedId.toDivisionDisplayLabel(selectedEvent.event.divisionDetails)
            options += BracketDivisionOption(
                id = normalizedId,
                label = label.ifBlank { normalizedId }
            )
        }
        selectedEvent.event.divisionDetails.forEach { detail ->
            addOption(detail.id, detail.name)
        }
        selectedEvent.event.divisions.forEach { divisionId ->
            addOption(divisionId)
        }
        selectedEvent.matches.forEach { match ->
            addOption(match.match.division)
        }
        addOption(selectedDivision)
        options
    }
    val leagueDivisionOptions = remember(
        joinDivisionOptions,
        selectedEvent.event.divisions,
        selectedEvent.event.divisionDetails,
        selectedEvent.matches,
    ) {
        selectedEvent.event.leagueDivisionOptionsForStandings(
            fallbackOptions = joinDivisionOptions,
            matches = selectedEvent.matches,
        )
    }
    val registrationDivisionOptions = remember(
        selectedEvent.event.divisions,
        selectedEvent.event.divisionDetails,
    ) {
        buildRegistrationDivisionOptions(selectedEvent.event)
    }
    val registrationJoinDivisionOptions = remember(registrationDivisionOptions) {
        registrationDivisionOptions.toJoinDivisionOptions()
    }
    val splitRegistrationDivisionOptions = remember(
        selectedEvent.event.teamSignup,
        selectedEvent.event.singleDivision,
        registrationDivisionOptions,
    ) {
        if (selectedEvent.event.teamSignup &&
            !selectedEvent.event.singleDivision &&
            registrationDivisionOptions.size > 1
        ) {
            registrationDivisionOptions
        } else {
            emptyList()
        }
    }
    val playoffDivisionOptions = remember(
        joinDivisionOptions,
        selectedEvent.event.divisions,
        selectedEvent.event.divisionDetails,
        selectedEvent.matches,
    ) {
        selectedEvent.event.playoffDivisionOptionsForBracket(
            fallbackOptions = joinDivisionOptions,
            matches = selectedEvent.matches,
        )
    }
    val selectedJoinDivisionId = remember(
        selectedDivision,
        joinDivisionOptions,
    ) {
        joinDivisionOptions.resolveSelectedDivisionId(selectedDivision)
    }
    val tournamentBracketDivisionOptions = remember(
        tournamentPoolPlayEnabled,
        selectedEvent.event.divisionDetails,
        joinDivisionOptions,
    ) {
        if (tournamentPoolPlayEnabled) {
            selectedEvent.event.tournamentBracketDivisionOptions(joinDivisionOptions)
        } else {
            emptyList()
        }
    }
    val preferredScheduleBracketDivisionId = remember(
        tournamentPoolPlayEnabled,
        selectedEvent.event.divisionDetails,
        selectedJoinDivisionId,
    ) {
        if (!tournamentPoolPlayEnabled) {
            selectedJoinDivisionId
        } else {
            selectedEvent.event.resolveBracketDivisionForPool(selectedJoinDivisionId)
                ?: selectedJoinDivisionId
        }
    }
    val selectedScheduleDivisionId = remember(
        tournamentPoolPlayEnabled,
        preferredScheduleBracketDivisionId,
        tournamentBracketDivisionOptions,
        joinDivisionOptions,
    ) {
        if (tournamentPoolPlayEnabled && tournamentBracketDivisionOptions.isNotEmpty()) {
            tournamentBracketDivisionOptions.resolveSelectedDivisionId(preferredScheduleBracketDivisionId)
        } else {
            joinDivisionOptions.resolveSelectedDivisionId(preferredScheduleBracketDivisionId)
        }
    }
    val schedulePoolDivisionOptions = remember(
        tournamentPoolPlayEnabled,
        selectedEvent.event.divisionDetails,
        selectedScheduleDivisionId,
    ) {
        if (tournamentPoolPlayEnabled) {
            selectedEvent.event.tournamentPoolDivisionOptions(selectedScheduleDivisionId)
        } else {
            emptyList()
        }
    }
    val standingsTabDivisionOptions = remember(
        joinDivisionOptions,
        leagueDivisionOptions,
        selectedEvent.event.eventType,
        tournamentPoolPlayEnabled,
        tournamentBracketDivisionOptions,
    ) {
        if (tournamentPoolPlayEnabled && tournamentBracketDivisionOptions.isNotEmpty()) {
            tournamentBracketDivisionOptions
        } else if (selectedEvent.event.eventType == EventType.LEAGUE) {
            leagueDivisionOptions
        } else {
            joinDivisionOptions
        }
    }
    val preferredStandingsBracketDivisionId = remember(
        tournamentPoolPlayEnabled,
        selectedEvent.event.divisionDetails,
        selectedEvent.event.eventType,
        selectedEvent.event.splitLeaguePlayoffDivisions,
        selectedJoinDivisionId,
    ) {
        selectedEvent.event.preferredStandingsStageDivisionId(
            tournamentPoolPlayEnabled = tournamentPoolPlayEnabled,
            selectedDivisionId = selectedJoinDivisionId,
        )
    }
    val selectedStandingsDivisionId = remember(
        preferredStandingsBracketDivisionId,
        standingsTabDivisionOptions,
    ) {
        standingsTabDivisionOptions.resolveSelectedDivisionId(preferredStandingsBracketDivisionId)
    }
    val standingsPoolDivisionOptions = remember(
        tournamentPoolPlayEnabled,
        selectedEvent.event.divisionDetails,
        selectedStandingsDivisionId,
    ) {
        if (tournamentPoolPlayEnabled) {
            selectedEvent.event.tournamentPoolDivisionOptions(selectedStandingsDivisionId)
        } else {
            emptyList()
        }
    }
    val selectedStandingsDataDivisionId = remember(
        selectedStandingsDivisionId,
        selectedStandingsPoolDivisionId,
        standingsPoolDivisionOptions,
        tournamentPoolPlayEnabled,
    ) {
        if (!tournamentPoolPlayEnabled) {
            selectedStandingsDivisionId
        } else {
            selectedStandingsPoolDivisionId
                ?.takeIf { selectedPoolId ->
                    standingsPoolDivisionOptions.any { option -> option.id == selectedPoolId }
                }
                ?: standingsPoolDivisionOptions.firstOrNull()?.id
        }
    }
    LaunchedEffect(schedulePoolDivisionOptions, selectedSchedulePoolDivisionId) {
        if (
            !selectedSchedulePoolDivisionId.isNullOrBlank() &&
            schedulePoolDivisionOptions.none { option -> option.id == selectedSchedulePoolDivisionId }
        ) {
            selectedSchedulePoolDivisionId = null
        }
    }
    LaunchedEffect(tournamentPoolPlayEnabled, standingsPoolDivisionOptions, selectedStandingsPoolDivisionId) {
        if (!tournamentPoolPlayEnabled) {
            if (!selectedStandingsPoolDivisionId.isNullOrBlank()) {
                selectedStandingsPoolDivisionId = null
            }
            return@LaunchedEffect
        }

        val firstPoolId = standingsPoolDivisionOptions.firstOrNull()?.id
        if (firstPoolId.isNullOrBlank()) {
            if (!selectedStandingsPoolDivisionId.isNullOrBlank()) {
                selectedStandingsPoolDivisionId = null
            }
            return@LaunchedEffect
        }

        if (
            selectedStandingsPoolDivisionId.isNullOrBlank() ||
            standingsPoolDivisionOptions.none { option -> option.id == selectedStandingsPoolDivisionId }
        ) {
            selectedStandingsPoolDivisionId = firstPoolId
        }
    }
    val computedLeagueStandings = remember(
        selectedEvent.teams,
        selectedEvent.matches,
        selectedEvent.event,
        selectedStandingsDataDivisionId,
        selectedEvent.leagueScoringConfig,
        showStandingsDrawColumn,
        tournamentPoolPlayEnabled,
    ) {
        val shouldFilterStandings = tournamentPoolPlayEnabled ||
            (!selectedEvent.event.singleDivision && !selectedStandingsDataDivisionId.isNullOrBlank())
        val standingsMatches = if (!shouldFilterStandings || selectedStandingsDataDivisionId.isNullOrBlank()) {
            selectedEvent.matches
        } else {
            val normalizedStandingsDivisionId = selectedStandingsDataDivisionId.normalizeDivisionIdentifier()
            selectedEvent.matches.filter { match ->
                match.match.division?.normalizeDivisionIdentifier() == normalizedStandingsDivisionId
            }
        }
        val matchTeamIds = standingsMatches
            .flatMap { match -> listOfNotNull(match.match.team1Id, match.match.team2Id) }
            .map { teamId -> teamId.trim() }
            .filter(String::isNotBlank)
            .toSet()
        val divisionTeamIds = if (shouldFilterStandings) {
            selectedEvent.event.teamIdsForDivision(selectedStandingsDataDivisionId)
        } else {
            emptySet()
        }
        val standingsTeamIds = divisionTeamIds.ifEmpty { matchTeamIds }
        val standingsTeams = if (!shouldFilterStandings || selectedStandingsDataDivisionId.isNullOrBlank()) {
            selectedEvent.teams
        } else {
            val normalizedStandingsDivisionId = selectedStandingsDataDivisionId.normalizeDivisionIdentifier()
            selectedEvent.teams.filter { team ->
                standingsTeamIds.contains(team.team.id) ||
                    team.team.division.normalizeDivisionIdentifier() == normalizedStandingsDivisionId
            }
        }

        buildLeagueStandings(
            teams = standingsTeams,
            matches = standingsMatches,
            config = selectedEvent.leagueScoringConfig,
            supportsDraw = showStandingsDrawColumn,
        )
    }
    val leagueStandings = remember(
        computedLeagueStandings,
        leagueDivisionStandings,
        selectedEvent.teams,
        selectedEvent.event,
        selectedStandingsDataDivisionId,
    ) {
        val remoteRows = if (
            !selectedStandingsDataDivisionId.isNullOrBlank() &&
            leagueDivisionStandings?.divisionId?.let { loadedDivisionId ->
                loadedDivisionId.normalizeDivisionIdentifier() ==
                    selectedStandingsDataDivisionId.normalizeDivisionIdentifier()
            } == true
        ) {
            leagueDivisionStandings?.rows.orEmpty()
        } else {
            emptyList()
        }
        val filteredRemoteRows = if (remoteRows.isEmpty() || selectedStandingsDataDivisionId.isNullOrBlank()) {
            remoteRows
        } else {
            val explicitTeamIds = selectedEvent.event.teamIdsForDivision(selectedStandingsDataDivisionId)
            val normalizedStandingsDivisionId = selectedStandingsDataDivisionId.normalizeDivisionIdentifier()
            val divisionTeamIds = selectedEvent.teams
                .filter { team ->
                    explicitTeamIds.contains(team.team.id) ||
                        team.team.division.normalizeDivisionIdentifier() == normalizedStandingsDivisionId
                }
                .map { team -> team.team.id }
                .filter(String::isNotBlank)
                .toSet()
            if (divisionTeamIds.isEmpty()) {
                remoteRows
            } else {
                remoteRows.filter { row -> row.teamId in divisionTeamIds }
            }
        }
        if (filteredRemoteRows.isEmpty()) {
            computedLeagueStandings
        } else {
            val teamsById = selectedEvent.teams.associateBy { it.team.id }
            filteredRemoteRows.map { row ->
                TeamStanding(
                    team = teamsById[row.teamId],
                    teamId = row.teamId,
                    teamName = row.teamName,
                    wins = row.wins,
                    losses = row.losses,
                    draws = row.draws,
                    goalsFor = row.goalsFor,
                    goalsAgainst = row.goalsAgainst,
                    matchesPlayed = row.matchesPlayed,
                    basePoints = row.basePoints,
                    finalPoints = row.finalPoints,
                    pointsDelta = row.pointsDelta,
                )
            }
        }
    }
    LaunchedEffect(showInviteTeamDialog, splitRegistrationDivisionOptions, selectedDivision) {
        if (!showInviteTeamDialog || splitRegistrationDivisionOptions.isEmpty()) {
            return@LaunchedEffect
        }
        val resolvedDivisionId = splitRegistrationDivisionOptions
            .resolveSelectedEventDivisionId(selectedDivision)
            ?: return@LaunchedEffect
        if (selectedDivision?.normalizeDivisionIdentifier() != resolvedDivisionId) {
            component.selectDivision(resolvedDivisionId)
        }
    }
    LaunchedEffect(showJoinOptionsSheet) {
        if (showJoinOptionsSheet) {
            selectedJoinOptionDivisionId = null
        }
    }
    val joinOptionPriceCents = remember(
        selectedEvent.event.priceCents,
        selectedEvent.event.divisions,
        selectedEvent.event.divisionDetails,
        selectedDivision,
        selectedJoinOptionDivisionId,
        hasAnyPaidDivision,
        tournamentPoolPlayEnabled,
    ) {
        val preferredDivisionId = selectedJoinOptionDivisionId ?: if (tournamentPoolPlayEnabled) {
            selectedEvent.event.resolveBracketDivisionForPool(selectedDivision) ?: selectedDivision
        } else {
            selectedDivision
        }
        when {
            !preferredDivisionId.isNullOrBlank() -> selectedEvent.event.resolvedDivisionPriceCents(preferredDivisionId) ?: 0
            selectedEvent.event.singleDivision -> selectedEvent.event.resolvedDivisionPriceCents() ?: 0
            hasAnyPaidDivision -> selectedEvent.event.divisionPriceRange().maxPriceCents
            else -> 0
        }
    }
    val joinOptions = remember(
        isUserInEvent,
        selectedWeeklyOccurrenceJoined,
        isEventFull,
        teamSignup,
        joinOptionPriceCents,
        joinBlockedByStart,
        isWeeklyParentEvent,
        selectedWeeklyOccurrence,
        selectedJoinOptionDivisionId,
        registrationJoinDivisionOptions,
        isAffiliateEvent,
    ) {
        if (isAffiliateEvent) {
            return@remember listOf(
                JoinOption(
                    label = "Register on website",
                    requiresPayment = false,
                    onClick = component::joinEvent,
                )
            )
        }
        val requiresWeeklySelection = isWeeklyParentEvent && selectedWeeklyOccurrence == null
        val shouldHideJoinOptions = when {
            joinBlockedByStart -> true
            isWeeklyParentEvent -> requiresWeeklySelection || selectedWeeklyOccurrenceJoined
            else -> isUserInEvent
        }
        if (shouldHideJoinOptions) {
            emptyList()
        } else {
            buildList {
                if (isEventFull) {
                    if (teamSignup) {
                        add(
                            JoinOption(
                                label = if (joinOptionPriceCents > 0) {
                                    "Join Waitlist as Team (No Payment Yet)"
                                } else {
                                    "Join Waitlist as Team"
                                },
                                requiresPayment = joinOptionPriceCents > 0,
                                onClick = {
                                    selectedJoinOptionDivisionId?.let { component.selectDivision(it) }
                                    showTeamSelectionDialog = true
                                }
                            )
                        )
                    } else {
                        add(
                            JoinOption(
                                label = if (joinOptionPriceCents > 0) {
                                    "Join Waitlist (No Payment Yet)"
                                } else {
                                    "Join Waitlist"
                                },
                                requiresPayment = joinOptionPriceCents > 0,
                                onClick = component::joinEvent
                            )
                        )
                    }
                } else if (teamSignup) {
                    add(
                        JoinOption(
                            label = "Join as Free Agent",
                            requiresPayment = false,
                            onClick = component::joinEvent
                        )
                    )
                    add(
                        JoinOption(
                            label = if (joinOptionPriceCents > 0) {
                                if (isRegistrationPaymentFailed) "Complete payment" else "Purchase Ticket for Team"
                            } else {
                                "Join as Team"
                            },
                            requiresPayment = joinOptionPriceCents > 0,
                            onClick = {
                                selectedJoinOptionDivisionId?.let { component.selectDivision(it) }
                                showTeamSelectionDialog = true
                            }
                        )
                    )
                } else {
                    add(
                        JoinOption(
                            label = if (joinOptionPriceCents > 0) {
                                if (isRegistrationPaymentFailed) "Complete payment" else "Purchase Ticket"
                            } else {
                                "Join Event"
                            },
                            requiresPayment = joinOptionPriceCents > 0,
                            onClick = component::joinEvent
                        )
                    )
                }
            }
        }
    }
    val guideController = LocalGuideController.current
    val guideEventId = selectedEvent.event.id.trim()
    val overviewJoinedGuideId = remember(guideEventId) {
        EventGuideIds.eventOverviewJoined(guideEventId)
    }
    val overviewMatchDayGuideId = remember(guideEventId) {
        EventGuideIds.eventOverviewMatchDay(guideEventId)
    }
    val overviewJoinedGuide = remember(overviewJoinedGuideId) {
        eventOverviewGuide(overviewJoinedGuideId)
    }
    val overviewMatchDayGuide = remember(overviewMatchDayGuideId) {
        eventOverviewGuide(overviewMatchDayGuideId)
    }
    val currentUserEventTeamIds = remember(currentUser.teamIds, validTeams) {
        (currentUser.teamIds + validTeams.map { team -> team.team.id })
            .map(String::trim)
            .filter(String::isNotBlank)
            .toSet()
    }
    val eventTimeZone = selectedEvent.event.resolvedTimeZone()
    val eventToday = remember(eventTimeZone) {
        Clock.System.now().toLocalDateTime(eventTimeZone).date
    }
    val isFirstMatchDayForCurrentUser = remember(
        selectedEvent.matches,
        scheduleTrackedUserIds,
        currentUserEventTeamIds,
        eventToday,
        eventTimeZone,
    ) {
        isFirstMatchDayForTrackedUsers(
            matches = selectedEvent.matches,
            trackedUserIds = scheduleTrackedUserIds,
            currentUserTeamIds = currentUserEventTeamIds,
            today = eventToday,
            timeZone = eventTimeZone,
        )
    }
    val completedGuideIds = guideController?.completedGuideIds.orEmpty()
    val hasOverviewHeaderTarget = guideController?.hasTarget(EventGuideTargets.OverviewHeader) == true
    val hasOverviewPrimaryActionTarget = guideController?.hasTarget(EventGuideTargets.OverviewPrimaryAction) == true
    val hasOverviewFormatTarget = guideController?.hasTarget(EventGuideTargets.OverviewFormat) == true

    LaunchedEffect(
        guideController,
        guideEventId,
        showDetails,
        isEditing,
        showMap,
        isUserInEvent,
        showStickyActions,
        isFirstMatchDayForCurrentUser,
        completedGuideIds,
        hasOverviewHeaderTarget,
        hasOverviewPrimaryActionTarget,
        hasOverviewFormatTarget,
    ) {
        val controller = guideController ?: return@LaunchedEffect
        if (guideEventId.isBlank()) return@LaunchedEffect
        if (showDetails || isEditing || showMap || !isUserInEvent || !showStickyActions) return@LaunchedEffect

        val requiredTargets = setOf(
            EventGuideTargets.OverviewHeader,
            EventGuideTargets.OverviewPrimaryAction,
        )
        if (!controller.isGuideCompleted(overviewJoinedGuideId)) {
            controller.maybeStartGuide(
                guide = overviewJoinedGuide,
                requiredTargetIds = requiredTargets,
            )
            return@LaunchedEffect
        }

        if (isFirstMatchDayForCurrentUser) {
            controller.maybeStartGuide(
                guide = overviewMatchDayGuide,
                requiredTargetIds = requiredTargets,
            )
        }
    }

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
        component.errorState.collect { error ->
            if (error != null) {
                popupHandler.showPopup(error)
                component.clearError()
            }
        }
    }

    LaunchedEffect(playerInteractionComponent, loadingHandler, popupHandler) {
        playerInteractionComponent.setLoadingHandler(loadingHandler)
        playerInteractionComponent.errorState.collect { error ->
            if (error != null) {
                popupHandler.showPopup(error)
            }
        }
    }

    LaunchedEffect(showDetails, isEditing, showMap) {
        if (showDetails || isEditing || showMap) {
            showJoinOptionsSheet = false
            showStickyDockByScroll = true
        }
    }

    LaunchedEffect(isEditing) {
        if (!isEditing) {
            pendingMapPlace = null
            isLocationPickerMapMode = false
        }
    }

    LaunchedEffect(showMap) {
        if (!showMap) {
            pendingMapPlace = null
            isLocationPickerMapMode = false
        }
    }

    CompositionLocalProvider(LocalTournamentComponent provides component) {
        CircularRevealUnderlay(
            isRevealed = showMap,
            revealCenterInWindow = mapRevealCenter,
            animationDurationMillis = 800,
            modifier = Modifier.fillMaxSize(),
            backgroundContent = {
                EventMap(
                    component = mapComponent,
                    onEventSelected = { _ ->
                        pendingMapPlace = null
                        isLocationPickerMapMode = false
                        mapComponent.toggleMap()
                    },
                    onPlaceSelected = { place ->
                        if (isLocationPickerMapMode) {
                            pendingMapPlace = place
                        }
                    },
                    onPlaceSelectionPoint = { x, y ->
                        mapRevealCenter = Offset(x, y)
                    },
                    selectionRequiresConfirmation = isLocationPickerMapMode,
                    originalPlace = originalLocationPlace(),
                    selectedPlace = pendingMapPlace,
                    onPlaceSelectionCleared = {
                        pendingMapPlace = null
                    },
                    canClickPOI = isLocationPickerMapMode,
                    focusedLocation = when {
                        pendingMapPlace != null -> {
                            LatLng(pendingMapPlace!!.latitude, pendingMapPlace!!.longitude)
                        }
                        originalLocationPlace() != null -> {
                            LatLng(originalLocationPlace()!!.latitude, originalLocationPlace()!!.longitude)
                        }
                        editedEvent.location.isNotBlank() -> {
                            LatLng(editedEvent.lat, editedEvent.long)
                        }
                        else -> {
                            mapComponent.currentLocation.value ?: LatLng(0.0, 0.0)
                        }
                    },
                    focusedEvent = if (!isLocationPickerMapMode && selectedEvent.event.location.isNotBlank()) {
                        selectedEvent.event
                    } else {
                        null
                    },
                    mapActionLabel = if (pendingMapPlace != null) {
                        "Select Location"
                    } else {
                        "Close Map"
                    },
                    usePrimaryActionButton = pendingMapPlace != null,
                    onBackPressed = {
                        pendingMapPlace?.let(component::selectPlace)
                        pendingMapPlace = null
                        isLocationPickerMapMode = false
                        mapComponent.toggleMap()
                    },
                )
            },
        ) {
            PullToRefreshContainer(
                isRefreshing = isEventRefreshInProgress,
                onRefresh = component::refreshEventDetails,
                enabled = !showMap,
                modifier = Modifier.fillMaxSize(),
            ) {
                Scaffold(Modifier.fillMaxSize()) { innerPadding ->
                Box(
                    Modifier.background(MaterialTheme.colorScheme.background).fillMaxSize()
                ) {
                    Column(Modifier.fillMaxSize()) {
                AnimatedVisibility(
                    !showDetails,
                    enter = EnterTransition.None,
                    exit = ExitTransition.None,
                ) {
                    Box {
                        EventDetailOverviewEditHost(
                            state = EventDetailOverviewEditHostState(
                                paymentProcessor = component,
                                mapComponent = mapComponent,
                                hostHasAccount = currentUser.hasStripeAccount == true,
                                eventWithRelations = selectedEvent,
                                editEvent = editedEvent,
                                navPadding = LocalNavBarPadding.current,
                                topInset = innerPadding.calculateTopPadding(),
                                editView = isEditing,
                                showOfficialsPanel = showOfficialsPanel,
                                showMap = showMap,
                                imageScheme = imageScheme,
                                imageIds = eventImageIds,
                                eventRegistrationQuestions = eventRegistrationQuestions,
                                eventRegistrationQuestionAnswers = eventRegistrationQuestionAnswers,
                                eventRegistrationQuestionsExpanded = eventRegistrationQuestionsExpanded,
                                availableRentalResources = availableRentalResources,
                                selectedRentalResourceIds = selectedRentalResourceIds,
                                registrationHoldExpiresAt = registrationHoldExpiresAt,
                                sports = sports,
                                eventTagOptions = eventTags,
                                divisionTypeParameters = divisionTypeParameters,
                                editableFields = editableFieldsForDetails,
                                leagueTimeSlots = editableLeagueTimeSlots,
                                leagueScoringConfig = editableLeagueScoringConfig,
                                currentUserForHostActions = currentUser,
                                organizationTemplates = organizationTemplates,
                                organizationTemplatesLoading = organizationTemplatesLoading,
                                organizationTemplatesError = organizationTemplatesError,
                                pendingStaffInvites = pendingStaffInvites,
                                userSuggestions = suggestedUsers,
                                canEditEventDetails = canEditEventDetails,
                                canCreateTemplateFromCurrentEvent = canCreateTemplateFromCurrentEvent,
                                canShowQrCode = canShowQrCode,
                                canRequestLeaveOrRefund = canRequestRefundAfterStart || canLeaveEvent,
                                leaveOrRefundActionLabel = leaveOrRefundActionLabel,
                                canDeleteEvent = canDeleteEvent,
                                showHostJoinAction = isHost && joinOptions.isNotEmpty(),
                                isAffiliateEvent = isAffiliateEvent,
                                isHost = isHost,
                                showOptionsDropdown = showOptionsDropdown,
                                showEventStateDropdown = showEventStateDropdown,
                                teamsAndParticipantsLoading = eventTeamsAndParticipantsLoading,
                                matchesLoading = eventMatchesLoading,
                                showFullnessSummary = !isWeeklyParentEvent ||
                                    selectedWeeklyOccurrenceSummary != null,
                                selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                                selectedWeeklyOccurrenceSummary = selectedWeeklyOccurrenceSummary,
                                overviewParticipantSummary = overviewParticipantSummary,
                                showOpenDetailsAction = showOverviewOpenDetailsAction,
                            ),
                            actions = EventDetailOverviewEditHostActions(
                                onOpenLocationMap = {
                                    pendingMapPlace = null
                                    isLocationPickerMapMode = true
                                    mapComponent.toggleMap()
                                },
                                onRentalResourceSelectionChange = component::setRentalResourceSelected,
                                onToggleEventRegistrationQuestions =
                                    component::toggleEventRegistrationQuestionsExpanded,
                                onEventRegistrationQuestionAnswerChange =
                                    component::updateEventRegistrationQuestionAnswer,
                                onRegistrationHoldExpired = component::registrationHoldExpired,
                                onHostCreateAccount = component::onHostCreateAccount,
                                onPlaceSelected = component::selectPlace,
                                onEditEvent = component::editEventField,
                                onEditTournament = component::editTournamentField,
                                onEventTypeSelected = component::onTypeSelected,
                                quoteInclusivePrice = component::quoteInclusivePrice,
                                onSportSelected = { sportId ->
                                    component.editEventField {
                                        copy(
                                            sportId = sportId.takeIf(String::isNotBlank),
                                            matchRulesOverride = null,
                                            resolvedMatchRules = null,
                                        )
                                    }
                                },
                                onUpdateDoTeamsOfficiate = { doTeamsOfficiate ->
                                    component.editEventField {
                                        withDoTeamsOfficiate(doTeamsOfficiate)
                                    }
                                },
                                onUpdateTeamOfficialsMaySwap = { teamOfficialsMaySwap ->
                                    component.editEventField {
                                        copy(
                                            teamOfficialsMaySwap =
                                                if (usesTeamOfficialScheduling()) teamOfficialsMaySwap else false,
                                        )
                                    }
                                },
                                onUpdateTeamCheckInMode = { mode ->
                                    component.editEventField {
                                        copy(teamCheckInMode = if (teamSignup) mode else TeamCheckInMode.OFF)
                                    }
                                },
                                onUpdateTeamCheckInOpenMinutesBefore = { minutes ->
                                    component.editEventField {
                                        copy(teamCheckInOpenMinutesBefore = minutes.coerceAtLeast(0))
                                    }
                                },
                                onUpdateAllowMatchRosterEdits = { enabled ->
                                    component.editEventField {
                                        copy(
                                            allowMatchRosterEdits = teamSignup && enabled,
                                            allowTemporaryMatchPlayers =
                                                teamSignup && enabled && allowTemporaryMatchPlayers,
                                        )
                                    }
                                },
                                onUpdateAllowTemporaryMatchPlayers = { enabled ->
                                    component.editEventField {
                                        copy(
                                            allowTemporaryMatchPlayers =
                                                teamSignup && allowMatchRosterEdits && enabled,
                                        )
                                    }
                                },
                                onUpdateOfficialSchedulingMode = { mode ->
                                    component.editEventField {
                                        withOfficialSchedulingMode(mode)
                                    }
                                },
                                onLoadOfficialPositionDefaults = {
                                    component.editEventField {
                                        syncOfficialStaffing(
                                            sport = sports.firstOrNull { sport -> sport.id == sportId },
                                            replacePositionsWithSportDefaults = true,
                                        )
                                    }
                                },
                                onAddOfficialPosition = {
                                    component.editEventField {
                                        addOfficialPosition(sport = selectedSport)
                                    }
                                },
                                onUpdateOfficialPositionName = { positionId, name ->
                                    component.editEventField {
                                        updateOfficialPosition(
                                            positionId = positionId,
                                            name = name,
                                            sport = selectedSport,
                                        )
                                    }
                                },
                                onUpdateOfficialPositionCount = { positionId, count ->
                                    component.editEventField {
                                        updateOfficialPosition(
                                            positionId = positionId,
                                            count = count,
                                            sport = selectedSport,
                                        )
                                    }
                                },
                                onRemoveOfficialPosition = { positionId ->
                                    component.editEventField {
                                        removeOfficialPosition(
                                            positionId = positionId,
                                            sport = selectedSport,
                                        )
                                    }
                                },
                                onUpdateOfficialUserPositions = { userId, positionIds ->
                                    component.editEventField {
                                        updateOfficialUserPositions(
                                            userId = userId,
                                            positionIds = positionIds,
                                            sport = selectedSport,
                                        )
                                    }
                                },
                                onAddLeagueTimeSlot = component::addLeagueTimeSlot,
                                onUpdateLeagueTimeSlot = { index, updated ->
                                    component.updateLeagueTimeSlot(index) { updated }
                                },
                                onRemoveLeagueTimeSlot = component::removeLeagueTimeSlot,
                                onSelectFieldCount = component::selectFieldCount,
                                onUpdateLocalFieldName = component::updateLocalFieldName,
                                onLeagueScoringConfigChange = { updated ->
                                    component.updateLeagueScoringConfig { updated }
                                },
                                onUploadSelected = component::onUploadSelected,
                                onDeleteImage = component::deleteImage,
                                onHostMessageUser = component::onNavigateToChat,
                                onHostSendFriendRequest = playerInteractionComponent::sendFriendRequest,
                                onHostFollowUser = playerInteractionComponent::followUser,
                                onHostUnfollowUser = playerInteractionComponent::unfollowUser,
                                onHostBlockUser = playerInteractionComponent::blockUser,
                                onHostUnblockUser = playerInteractionComponent::unblockUser,
                                onMapRevealCenterChange = { mapRevealCenter = it },
                                onFloatingDockVisibilityChange = { showStickyDockByScroll = it },
                                onSearchUsers = component::searchUsers,
                                onAddPendingStaffInvite = component::addPendingStaffInvite,
                                onRemovePendingStaffInvite = component::removePendingStaffInvite,
                                onUpdateAssistantHostIds = { assistantHostIds ->
                                    component.editEventField {
                                        copy(
                                            assistantHostIds = assistantHostIds
                                                .map(String::trim)
                                                .filter(String::isNotBlank)
                                                .filterNot { userId -> userId == hostId }
                                                .distinct(),
                                        )
                                    }
                                },
                                onAddOfficialId = { officialId ->
                                    component.editEventField {
                                        addOfficialUser(userId = officialId, sport = selectedSport)
                                    }
                                },
                                onRemoveOfficialId = { officialId ->
                                    component.editEventField {
                                        removeOfficialUser(userId = officialId, sport = selectedSport)
                                    }
                                },
                                onBack = { component.backCallback.onBack() },
                                onOptionsDropdownChanged = { showOptionsDropdown = it },
                                onStartEditing = component::startEditingEvent,
                                onCreateTemplate = component::createTemplateFromCurrentEvent,
                                onHostJoinAction = {
                                    if (isAffiliateEvent) {
                                        component.joinEvent()
                                    } else {
                                        showJoinOptionsSheet = true
                                    }
                                },
                                onShare = component::shareEvent,
                                onShowQrCode = { showQrCodeDialog = true },
                                onReportEvent = { showReportEventDialog = true },
                                onLeaveOrRefund = openLeaveOrRefundAction,
                                onNotifyPlayers = { showNotifyDialog = true },
                                onDelete = { showDeleteConfirmation = true },
                                onConfirmEdit = component::updateEvent,
                                onCancelEdit = component::cancelEditingEvent,
                                onEventStateDropdownChanged = { showEventStateDropdown = it },
                                onLifecycleStateSelected = { option ->
                                    component.editEventField {
                                        copy(state = option.toEventState(currentState = state))
                                    }
                                    showEventStateDropdown = false
                                },
                                onRescheduleEvent = component::rescheduleEvent,
                                onBuildBrackets = { showBuildBracketConfirmDialog = true },
                                onRebuildWithoutPlaceholders = {
                                    showRebuildWithoutPlaceholdersConfirmDialog = true
                                },
                                onOpenDetails = component::viewEvent,
                            ),
                        )
                    }
                }
                AnimatedVisibility(
                    showDetails,
                    enter = EnterTransition.None,
                    exit = ExitTransition.None,
                ) {
                    Column(Modifier.padding(innerPadding).padding(top = 4.dp)) {
                        val availableTabs = remember(hasBracketView, hasScheduleView, hasStandingsView) {
                            availableEventDetailTabs(
                                hasBracketView = hasBracketView,
                                hasScheduleView = hasScheduleView,
                                hasStandingsView = hasStandingsView,
                            )
                        }
                        val requestedInitialTab = remember(initialTab, availableTabs) {
                            resolveInitialEventDetailTab(
                                initialTab = initialTab,
                                availableTabs = availableTabs,
                            )
                        }
                        var selectedTab by rememberSaveable { mutableStateOf(requestedInitialTab) }
                        val bracketTabDivisionOptions = remember(
                            tournamentPoolPlayEnabled,
                            tournamentBracketDivisionOptions,
                            selectedEvent.event.eventType,
                            selectedEvent.event.splitLeaguePlayoffDivisions,
                            joinDivisionOptions,
                            leagueDivisionOptions,
                            playoffDivisionOptions,
                        ) {
                            selectedEvent.event.detailBracketDivisionOptions(
                                tournamentPoolPlayEnabled = tournamentPoolPlayEnabled,
                                tournamentBracketDivisionOptions = tournamentBracketDivisionOptions,
                                joinDivisionOptions = joinDivisionOptions,
                                leagueDivisionOptions = leagueDivisionOptions,
                                playoffDivisionOptions = playoffDivisionOptions,
                            )
                        }
                        val preferredBracketDivisionId = remember(
                            tournamentPoolPlayEnabled,
                            selectedEvent.event.divisionDetails,
                            selectedEvent.event.eventType,
                            selectedEvent.event.splitLeaguePlayoffDivisions,
                            playoffDivisionOptions,
                            selectedJoinDivisionId,
                        ) {
                            selectedEvent.event.preferredBracketStageDivisionId(
                                tournamentPoolPlayEnabled = tournamentPoolPlayEnabled,
                                playoffDivisionOptions = playoffDivisionOptions,
                                selectedDivisionId = selectedJoinDivisionId,
                            )
                        }
                        val selectedBracketDivisionId = remember(
                            preferredBracketDivisionId,
                            bracketTabDivisionOptions,
                        ) {
                            bracketTabDivisionOptions.resolveSelectedDivisionId(preferredBracketDivisionId)
                        }
                        val showLosersBracketSelector = remember(
                            selectedEvent.event.doubleElimination,
                            selectedEvent.event.divisionDetails,
                            selectedEvent.matches,
                            selectedBracketDivisionId,
                        ) {
                            selectedEvent.event.hasLosersBracketSelector(
                                selectedDivisionId = selectedBracketDivisionId,
                                matches = selectedEvent.matches,
                            )
                        }
                        val participantSections = remember(selectedEvent.event.teamSignup) {
                            if (selectedEvent.event.teamSignup) {
                                listOf(
                                    ParticipantsSection.TEAMS,
                                    ParticipantsSection.PARTICIPANTS,
                                    ParticipantsSection.FREE_AGENTS
                                )
                            } else {
                                listOf(ParticipantsSection.PARTICIPANTS)
                            }
                        }
                        var selectedParticipantsSection by rememberSaveable {
                            mutableStateOf(
                                if (selectedEvent.event.teamSignup) {
                                    ParticipantsSection.TEAMS
                                } else {
                                    ParticipantsSection.PARTICIPANTS
                                }
                            )
                        }
                        val selectedParticipantsDivisionId = remember(
                            selectedDivision,
                            registrationDivisionOptions,
                            selectedJoinDivisionId,
                        ) {
                            registrationDivisionOptions.resolveSelectedEventDivisionId(selectedDivision)
                                ?: selectedJoinDivisionId
                        }
                        val participantsTabDivisionOptions = remember(
                            registrationJoinDivisionOptions,
                            joinDivisionOptions,
                        ) {
                            registrationJoinDivisionOptions.ifEmpty { joinDivisionOptions }.distinctById()
                        }
                        var isDetailDockExpanded by rememberSaveable { mutableStateOf(false) }
                        LaunchedEffect(availableTabs) {
                            if (selectedTab !in availableTabs) {
                                selectedTab = availableTabs.first()
                            }
                        }
                        LaunchedEffect(initialTab, availableTabs) {
                            if (
                                initialTab == EventDetailInitialTab.SCHEDULE &&
                                selectedTab == DetailTab.PARTICIPANTS &&
                                DetailTab.SCHEDULE in availableTabs
                            ) {
                                selectedTab = DetailTab.SCHEDULE
                            }
                        }
                        LaunchedEffect(selectedTab) {
                            isDetailDockExpanded = false
                        }
                        LaunchedEffect(showFab) {
                            if (!showFab) {
                                isDetailDockExpanded = false
                            }
                        }
                        LaunchedEffect(
                            selectedTab,
                            selectedStandingsDivisionId,
                            selectedStandingsDataDivisionId,
                            selectedBracketDivisionId,
                            selectedDivision,
                        ) {
                            val targetDivisionId = when (selectedTab) {
                                DetailTab.LEAGUES -> selectedStandingsDataDivisionId
                                DetailTab.BRACKET -> selectedBracketDivisionId
                                DetailTab.PARTICIPANTS,
                                DetailTab.SCHEDULE,
                                -> null
                            }
                            if (!targetDivisionId.isNullOrBlank() &&
                                selectedDivision?.normalizeDivisionIdentifier() != targetDivisionId.normalizeDivisionIdentifier()
                            ) {
                                component.selectDivision(targetDivisionId)
                            }
                        }
                        LaunchedEffect(participantSections) {
                            if (selectedParticipantsSection !in participantSections) {
                                selectedParticipantsSection = participantSections.first()
                            }
                        }
                        val selectedDivisionSelectorState = remember(
                            selectedTab,
                            selectedDivision,
                            selectedParticipantsDivisionId,
                            participantsTabDivisionOptions,
                            selectedScheduleDivisionId,
                            selectedSchedulePoolDivisionId,
                            schedulePoolDivisionOptions,
                            selectedStandingsDivisionId,
                            selectedStandingsPoolDivisionId,
                            selectedStandingsDataDivisionId,
                            standingsTabDivisionOptions,
                            standingsPoolDivisionOptions,
                            tournamentPoolPlayEnabled,
                            tournamentBracketDivisionOptions,
                            selectedBracketDivisionId,
                            bracketTabDivisionOptions,
                            joinDivisionOptions,
                            selectedEvent.event.singleDivision,
                            selectedEvent.event.divisionDetails,
                        ) {
                            val selectedDivisionForTab = when (selectedTab) {
                                DetailTab.BRACKET -> selectedBracketDivisionId
                                DetailTab.SCHEDULE -> selectedScheduleDivisionId
                                DetailTab.LEAGUES -> selectedStandingsDivisionId
                                DetailTab.PARTICIPANTS -> selectedParticipantsDivisionId
                                    ?: selectedDivision
                            }
                            val divisionOptionsForTab = when (selectedTab) {
                                DetailTab.BRACKET -> bracketTabDivisionOptions
                                DetailTab.SCHEDULE -> if (tournamentPoolPlayEnabled &&
                                    tournamentBracketDivisionOptions.isNotEmpty()
                                ) {
                                    tournamentBracketDivisionOptions
                                } else {
                                    joinDivisionOptions
                                }
                                DetailTab.LEAGUES -> standingsTabDivisionOptions
                                DetailTab.PARTICIPANTS -> participantsTabDivisionOptions
                            }.distinctById()
                            val divisionState = buildSelectedDivisionPillState(
                                selectedDivisionId = selectedDivisionForTab,
                                options = divisionOptionsForTab,
                                divisionDetails = selectedEvent.event.divisionDetails,
                                singleDivision = selectedEvent.event.singleDivision,
                            )
                            val poolState = when (selectedTab) {
                                DetailTab.SCHEDULE -> {
                                    if (tournamentPoolPlayEnabled && schedulePoolDivisionOptions.isNotEmpty()) {
                                        buildSelectedDivisionPillState(
                                            selectedDivisionId = selectedSchedulePoolDivisionId
                                                ?: AllPoolsDivisionOptionId,
                                            options = listOf(
                                                BracketDivisionOption(
                                                    id = AllPoolsDivisionOptionId,
                                                    label = "All pools",
                                                ),
                                            ) + schedulePoolDivisionOptions,
                                            divisionDetails = selectedEvent.event.divisionDetails,
                                            singleDivision = false,
                                        )
                                    } else {
                                        null
                                    }
                                }
                                DetailTab.LEAGUES -> {
                                    if (tournamentPoolPlayEnabled && standingsPoolDivisionOptions.isNotEmpty()) {
                                        buildSelectedDivisionPillState(
                                            selectedDivisionId = selectedStandingsDataDivisionId
                                                ?: selectedStandingsPoolDivisionId,
                                            options = standingsPoolDivisionOptions,
                                            divisionDetails = selectedEvent.event.divisionDetails,
                                            singleDivision = false,
                                        )
                                    } else {
                                        null
                                    }
                                }
                                DetailTab.BRACKET,
                                DetailTab.PARTICIPANTS,
                                -> null
                            }
                            if (divisionState == null && poolState == null) {
                                null
                            } else {
                                SelectedDivisionSelectorState(
                                    divisionState = divisionState,
                                    poolState = poolState,
                                )
                            }
                        }
                            val tabContentTopOffset = if (selectedDivisionSelectorState != null) {
                                DivisionPillContentTopOffset
                            } else {
                                0.dp
                            }
                            val selectedTabContentTarget = when (selectedTab) {
                                DetailTab.BRACKET -> EventGuideTargets.BracketContent
                                DetailTab.SCHEDULE -> EventGuideTargets.ScheduleContent
                                DetailTab.LEAGUES -> EventGuideTargets.StandingsContent
                                DetailTab.PARTICIPANTS -> EventGuideTargets.ParticipantsContent
                            }
                            val selectedTabGuideId = remember(selectedTab, guideEventId) {
                                when (selectedTab) {
                                    DetailTab.BRACKET -> EventGuideIds.eventBracketTab(guideEventId)
                                    DetailTab.SCHEDULE -> EventGuideIds.eventScheduleTab(guideEventId)
                                    DetailTab.LEAGUES -> EventGuideIds.eventStandingsTab(guideEventId)
                                    DetailTab.PARTICIPANTS -> EventGuideIds.eventParticipantsTab(guideEventId)
                                }
                            }
                            val selectedTabGuide = remember(selectedTab, selectedTabGuideId) {
                                when (selectedTab) {
                                    DetailTab.BRACKET -> eventBracketTabGuide(selectedTabGuideId)
                                    DetailTab.SCHEDULE -> eventScheduleTabGuide(selectedTabGuideId)
                                    DetailTab.LEAGUES -> eventStandingsTabGuide(selectedTabGuideId)
                                    DetailTab.PARTICIPANTS -> eventParticipantsTabGuide(selectedTabGuideId)
                                }
                            }
                            val canStartEventTabGuide = isUserInEvent || isHost || isAssistantHost || isEventOfficial
                            val hasDetailTabsTarget = guideController?.hasTarget(EventGuideTargets.DetailTabs) == true
                            val hasSelectedTabContentTarget =
                                guideController?.hasTarget(selectedTabContentTarget) == true
                            val hasDivisionSelectorTarget =
                                guideController?.hasTarget(EventGuideTargets.DetailDivisionSelector) == true
                            val selectedTabGuideRequiredTargets = remember(selectedTab, selectedTabContentTarget) {
                                eventDetailTabGuideRequiredTargetIds(
                                    selectedTab = selectedTab,
                                    selectedTabContentTarget = selectedTabContentTarget,
                                )
                            }
                            LaunchedEffect(
                                guideController,
                                guideEventId,
                                selectedTab,
                                showDetails,
                                isEditing,
                                showMap,
                                canStartEventTabGuide,
                                selectedTabGuideId,
                                completedGuideIds,
                                hasDetailTabsTarget,
                                hasSelectedTabContentTarget,
                                hasDivisionSelectorTarget,
                                selectedTabGuideRequiredTargets,
                            ) {
                                val controller = guideController ?: return@LaunchedEffect
                                if (guideEventId.isBlank()) return@LaunchedEffect
                                if (!showDetails || isEditing || showMap || !canStartEventTabGuide) return@LaunchedEffect

                                controller.maybeStartGuide(
                                    guide = selectedTabGuide,
                                    requiredTargetIds = selectedTabGuideRequiredTargets,
                                )
                            }
                            EventDetailTabsHost(
                                state = EventDetailTabsHostState(
                                    availableTabs = availableTabs,
                                    selectedTab = selectedTab,
                                    selectedDivisionSelectorState = selectedDivisionSelectorState,
                                    tabContentTopOffset = tabContentTopOffset,
                                    showFab = showFab,
                                    isDetailDockExpanded = isDetailDockExpanded,
                                    selectedEvent = selectedEvent,
                                    tournamentPoolPlayEnabled = tournamentPoolPlayEnabled,
                                    selectedSchedulePoolDivisionId = selectedSchedulePoolDivisionId,
                                    selectedScheduleDivisionId = selectedScheduleDivisionId,
                                    schedulePoolDivisionOptions = schedulePoolDivisionOptions,
                                    isWeeklyParentEvent = isWeeklyParentEvent,
                                    weeklyScheduleItems = weeklyScheduleItems,
                                    weeklyScheduleOptionsById = weeklyScheduleOptionsById,
                                    selectedWeeklyOccurrence = selectedWeeklyOccurrence,
                                    selectedWeeklyOccurrenceSummary = selectedWeeklyOccurrenceSummary,
                                    eventFields = eventFields,
                                    eventMatchesLoading = eventMatchesLoading,
                                    editableMatches = editableMatches,
                                    canEditMatches = canEditMatches,
                                    scheduleTrackedUserIds = scheduleTrackedUserIds,
                                    isEventOfficial = isEventOfficial,
                                    selectedStandingsDataDivisionId = selectedStandingsDataDivisionId,
                                    selectedStandingsDivisionId = selectedStandingsDivisionId,
                                    leagueDivisionStandings = leagueDivisionStandings,
                                    leagueStandings = leagueStandings,
                                    showStandingsDrawColumn = showStandingsDrawColumn,
                                    leagueStandingsConfirming = leagueStandingsConfirming,
                                    canManageLeagueStandings = canManageLeagueStandings,
                                    eventTeamsAndParticipantsLoading = eventTeamsAndParticipantsLoading,
                                    selectedParticipantsSection = selectedParticipantsSection,
                                    participantSections = participantSections,
                                    isManagingParticipants = isManagingParticipants,
                                    canManageParticipantsFromDock = canManageParticipantsFromDock,
                                    showEventCheckInBadges = showEventCheckInBadges,
                                    selectedParticipantsDivisionId = selectedParticipantsDivisionId,
                                    selectedDivisionId = selectedDivision,
                                    registrationDivisionOptions = registrationDivisionOptions,
                                    participantDivisionWarnings = participantDivisionWarnings,
                                    showLosersBracketSelector = showLosersBracketSelector,
                                    losersBracket = losersBracket,
                                    canManageMatchEditingFromDock = canManageMatchEditingFromDock,
                                    showScheduleMatchManagement = showScheduleMatchManagement,
                                    canConfirmLeagueResultsFromDock = canConfirmLeagueResultsFromDock,
                                    leagueDivisionStandingsLoading = leagueDivisionStandingsLoading,
                                ),
                                actions = EventDetailTabsHostActions(
                                    onTabSelected = { selectedTab = it },
                                    onShowFabChanged = { showFab = it },
                                    onDivisionSelected = { tab, divisionId ->
                                        when (tab) {
                                            DetailTab.BRACKET,
                                            DetailTab.PARTICIPANTS,
                                            -> component.selectDivision(divisionId)

                                            DetailTab.SCHEDULE -> {
                                                selectedSchedulePoolDivisionId = null
                                                component.selectDivision(divisionId)
                                            }

                                            DetailTab.LEAGUES -> {
                                                selectedStandingsPoolDivisionId = null
                                                component.selectDivision(divisionId)
                                            }
                                        }
                                    },
                                    onPoolSelected = { tab, poolDivisionId ->
                                        when (tab) {
                                            DetailTab.SCHEDULE -> {
                                                selectedSchedulePoolDivisionId =
                                                    poolDivisionId.takeUnless { selectedId ->
                                                        selectedId == AllPoolsDivisionOptionId
                                                    }
                                            }

                                            DetailTab.LEAGUES -> {
                                                selectedStandingsPoolDivisionId = poolDivisionId
                                                component.selectDivision(poolDivisionId)
                                            }

                                            DetailTab.BRACKET,
                                            DetailTab.PARTICIPANTS,
                                            -> Unit
                                        }
                                    },
                                    onWeeklySessionSelected = { session ->
                                        component.selectWeeklySession(
                                            sessionStart = session.start,
                                            sessionEnd = session.end,
                                            slotId = session.slotId,
                                            occurrenceDate = session.occurrenceDate,
                                            label = session.label,
                                        )
                                    },
                                    onMatchSelected = component::matchSelected,
                                    onEditBracketMatch = component::showMatchEditDialog,
                                    onEditScheduleMatch = { match ->
                                        component.showMatchEditDialog(
                                            match = match,
                                            creationContext = MatchCreateContext.SCHEDULE,
                                        )
                                    },
                                    onSetLockForEditableMatches = component::setLockForEditableMatches,
                                    onNavigateToChat = component::onNavigateToChat,
                                    onMoveTeamParticipantDivision = component::moveTeamParticipantDivision,
                                    onDetailDockExpandedChanged = { isDetailDockExpanded = it },
                                    onToggleLosersBracket = component::toggleLosersBracket,
                                    onStartEditingMatches = component::startEditingMatches,
                                    onCancelEditingMatches = component::cancelEditingMatches,
                                    onCommitMatchChanges = component::commitMatchChanges,
                                    onAddBracketMatch = component::addBracketMatch,
                                    onAddScheduleMatch = component::addScheduleMatch,
                                    onRequestStandingsConfirmation = {
                                        showStandingsConfirmDialog = true
                                    },
                                    onParticipantsSectionSelected = {
                                        selectedParticipantsSection = it
                                    },
                                    onManagingParticipantsChanged = { isManaging ->
                                        isManagingParticipants = isManaging
                                        if (isManaging) {
                                            component.startManagingParticipants()
                                        } else {
                                            component.stopManagingParticipants()
                                        }
                                    },
                                    onInviteTeam = {
                                        component.searchInviteTeams("")
                                        showInviteTeamDialog = true
                                    },
                                    onInvitePlayer = {
                                        component.searchUsers("")
                                        showInvitePlayerDialog = true
                                    },
                                    onClearSelectedWeeklyOccurrence = component::clearSelectedWeeklySession,
                                    onShowDetails = component::toggleDetails,
                                ),
                            )
                    }
                }
            }
            EventDetailOverviewStickyActionHost(
                state = EventDetailOverviewStickyActionState(
                    visible = showStickyActions,
                    isAffiliateEvent = isAffiliateEvent,
                    isRegistrationPaymentPending = isRegistrationPaymentPending,
                    isRegistrationPaymentFailed = isRegistrationPaymentFailed,
                    joinBlockedByStart = joinBlockedByStart,
                    isWeeklyParentEvent = isWeeklyParentEvent,
                    shouldShowViewSchedulePrimaryAction = shouldShowViewSchedulePrimaryAction,
                    isUserInEvent = isUserInEvent,
                    directionsEnabled = hasDirectionsTarget,
                    selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                ),
                actions = EventDetailOverviewStickyActionActions(
                    onAffiliateJoin = component::joinEvent,
                    onOpenJoinOptions = { showJoinOptionsSheet = true },
                    onViewEvent = component::viewEvent,
                    onMapClick = mapComponent::toggleMap,
                    onDirectionsClick = component::openEventDirections,
                    onMapButtonPositioned = { mapRevealCenter = it },
                    onShareClick = component::shareEvent,
                    onClearSelectedWeeklyOccurrence = component::clearSelectedWeeklySession,
                ),
            )
            }
                }
        }

        EventDetailOverlayHost(
            state = EventDetailOverlayHostState(
                showWithdrawTargetDialog = showWithdrawTargetDialog,
                withdrawTargets = actionWithdrawTargets,
                showJoinOptionsSheet = showJoinOptionsSheet,
                joinSheetsState = EventDetailJoinSheetsState(
                    options = joinOptions,
                    paymentProcessor = component,
                    registrationHoldExpiresAt = registrationHoldExpiresAt,
                    isWeeklyParentEvent = isWeeklyParentEvent,
                    weeklySessionOptions = weeklySessionOptions,
                    weeklyOccurrenceSummaries = weeklyOccurrenceSummaries,
                    selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                    selectedWeeklyOccurrenceSummary = selectedWeeklyOccurrenceSummary,
                    selectedWeeklyOccurrenceJoined = selectedWeeklyOccurrenceJoined,
                    selectedWeeklyOccurrenceStarted = joinBlockedByStart && isWeeklyParentEvent,
                    selectedDivisionId = selectedJoinOptionDivisionId,
                    divisionOptions = if (teamSignup) {
                        registrationJoinDivisionOptions
                    } else {
                        emptyList()
                    },
                ),
                showTeamDialog = showTeamDialog,
                showMatchEditDialog = showMatchEditDialog,
                showTeamSelectionDialog = showTeamSelectionDialog,
                teamSelectionSportLabel = teamSelectionSportLabel,
                validTeams = validTeams,
                showEventTeamCheckInDialog = showEventTeamCheckInDialog,
                eventTeamCheckInSaving = eventTeamCheckInSaving,
                eventTeamName = currentUserManagedEventTeam
                    ?.team
                    ?.name
                    ?.takeIf(String::isNotBlank)
                    ?: "your team",
                joinChoiceDialog = joinChoiceDialog,
                childJoinSelectionDialog = childJoinSelectionDialog,
                teamJoinQuestionDialog = teamJoinQuestionDialog,
                eventRegistrationQuestionDialog = eventRegistrationQuestionDialog,
                paymentPlanPreviewDialog = paymentPlanPreviewDialog,
                showStandingsConfirmDialog = showStandingsConfirmDialog,
                showBuildBracketConfirmDialog = showBuildBracketConfirmDialog,
                showRebuildWithoutPlaceholdersConfirmDialog =
                    showRebuildWithoutPlaceholdersConfirmDialog,
                showQrCodeDialog = showQrCodeDialog,
                canShowQrCode = canShowQrCode,
                eventName = selectedEvent.event.name,
                eventId = selectedEvent.event.id,
                showDeleteConfirmation = showDeleteConfirmation,
                isTemplateEvent = isTemplateEvent,
                hasAnyPaidDivision = hasAnyPaidDivision,
                showNotifyDialog = showNotifyDialog,
                showInviteTeamDialog = showInviteTeamDialog,
                inviteTeamSuggestions = inviteTeamSuggestions,
                inviteTeamsLoading = inviteTeamsLoading,
                selectedDivisionId = selectedDivision,
                registrationDivisionOptions = splitRegistrationDivisionOptions,
                showInvitePlayerDialog = showInvitePlayerDialog,
                suggestedUsers = suggestedUsers,
                existingParticipantIds = (
                    selectedEvent.event.playerIds +
                        selectedEvent.event.waitListIds +
                        selectedEvent.event.freeAgentIds
                    ).map(String::trim).filter(String::isNotBlank).toSet(),
                showReportEventDialog = showReportEventDialog,
                reportEventNotes = reportEventNotes,
                showRefundReasonDialog = showRefundReasonDialog,
                refundReason = refundReason,
                textSignaturePrompt = textSignaturePrompt,
                webSignaturePrompt = webSignaturePrompt,
                discountCodePrompt = discountCodePrompt,
                billingAddressPrompt = billingAddressPrompt,
            ),
            actions = EventDetailOverlayHostActions(
                joinSheetsActions = EventDetailJoinSheetsActions(
                    onDivisionSelected = { divisionId ->
                        selectedJoinOptionDivisionId = divisionId
                        component.selectDivision(divisionId)
                    },
                    onDismiss = { showJoinOptionsSheet = false },
                    onSelectOption = { action ->
                        showJoinOptionsSheet = false
                        action.onClick()
                    },
                    onSelectWeeklySession = { session ->
                        component.selectWeeklySession(
                            sessionStart = session.start,
                            sessionEnd = session.end,
                            slotId = session.slotId,
                            occurrenceDate = session.occurrenceDate,
                            label = session.label,
                        )
                    },
                    onRegistrationHoldExpired = component::registrationHoldExpired,
                ),
                onDismissWithdrawTargetDialog = { showWithdrawTargetDialog = false },
                onWithdrawTargetSelected = { target ->
                    showWithdrawTargetDialog = false
                    openLeaveOrRefundForTarget(target)
                },
                onMatchTeamSelected = { matchId, position, teamId ->
                    component.selectTeamForMatch(matchId, position, teamId)
                },
                onDismissMatchTeamSelection = component::dismissTeamSelection,
                onDismissMatchEdit = component::dismissMatchEditDialog,
                onConfirmMatchEdit = component::updateMatchFromDialog,
                onDeleteMatch = component::deleteMatchFromDialog,
                onJoinTeamSelected = { selectedTeam ->
                    showTeamSelectionDialog = false
                    component.joinEventAsTeam(selectedTeam)
                },
                onDismissJoinTeamSelection = { showTeamSelectionDialog = false },
                onCreateTeam = component::createNewTeam,
                onDismissEventTeamCheckIn = component::dismissEventTeamCheckInDialog,
                onConfirmEventTeamCheckIn = component::confirmEventTeamCheckIn,
                onDismissJoinChoice = component::dismissJoinChoiceDialog,
                onConfirmJoinAsSelf = component::confirmJoinAsSelf,
                onShowChildJoinSelection = component::showChildJoinSelection,
                onDismissChildJoinSelection = component::dismissChildJoinSelectionDialog,
                onChildSelected = component::selectChildForJoin,
                onDismissTeamJoinQuestions = component::dismissTeamJoinQuestionDialog,
                onSubmitTeamJoinQuestions = component::submitTeamJoinQuestionAnswers,
                onDismissRegistrationQuestions = component::dismissEventRegistrationQuestionDialog,
                onSubmitRegistrationQuestions =
                    component::submitEventRegistrationQuestionDialogAnswers,
                onContinuePaymentPlan = component::confirmPaymentPlanPreviewDialog,
                onCancelPaymentPlan = component::dismissPaymentPlanPreviewDialog,
                onDismissStandingsConfirmation = { showStandingsConfirmDialog = false },
                onConfirmStandings = { applyReassignment ->
                    showStandingsConfirmDialog = false
                    selectedStandingsDataDivisionId?.let(component::selectDivision)
                    component.confirmLeagueStandings(applyReassignment = applyReassignment)
                },
                onDismissBuildBracketConfirmation = {
                    showBuildBracketConfirmDialog = false
                },
                onBuildBrackets = {
                    showBuildBracketConfirmDialog = false
                    component.buildBrackets()
                },
                onDismissRebuildWithoutPlaceholdersConfirmation = {
                    showRebuildWithoutPlaceholdersConfirmDialog = false
                },
                onRebuildWithoutPlaceholders = {
                    showRebuildWithoutPlaceholdersConfirmDialog = false
                    component.rebuildWithoutPlaceholderTeams()
                },
                onDismissQrCode = { showQrCodeDialog = false },
                onShareQrCode = component::shareEventQrCode,
                onDismissDeleteConfirmation = { showDeleteConfirmation = false },
                onDeleteEvent = {
                    component.deleteEvent()
                    showDeleteConfirmation = false
                },
                onSendNotification = component::sendNotification,
                onDismissNotification = { showNotifyDialog = false },
                onSearchInviteTeams = component::searchInviteTeams,
                onInviteTeamDivisionSelected = component::selectDivision,
                onInviteTeamSelected = { team ->
                    component.inviteTeamToEvent(team)
                    component.searchInviteTeams("")
                    showInviteTeamDialog = false
                },
                onDismissInviteTeam = {
                    component.searchInviteTeams("")
                    showInviteTeamDialog = false
                },
                onSearchUsers = component::searchUsers,
                onInvitePlayerSelected = { user ->
                    component.invitePlayerToEvent(user)
                    component.searchUsers("")
                    showInvitePlayerDialog = false
                },
                onInvitePlayerByEmail = { firstName, lastName, email ->
                    component.invitePlayerToEventByEmail(firstName, lastName, email)
                    component.searchUsers("")
                    showInvitePlayerDialog = false
                },
                onDismissInvitePlayer = {
                    component.searchUsers("")
                    showInvitePlayerDialog = false
                },
                onReportNotesChanged = { reportEventNotes = it },
                onSubmitReport = {
                    component.reportEvent(reportEventNotes)
                    reportEventNotes = ""
                    showReportEventDialog = false
                },
                onRequestDismissReport = { showReportEventDialog = false },
                onDismissReport = {
                    reportEventNotes = ""
                    showReportEventDialog = false
                },
                onRefundReasonChanged = { refundReason = it },
                onConfirmRefundRequest = {
                    component.requestRefund(
                        reason = refundReason,
                        targetUserId = selectedWithdrawalTarget?.userId,
                    )
                    showRefundReasonDialog = false
                    refundReason = ""
                    selectedWithdrawalTarget = null
                },
                onDismissRefundRequest = {
                    showRefundReasonDialog = false
                    refundReason = ""
                    selectedWithdrawalTarget = null
                },
                onConfirmTextSignature = component::confirmTextSignature,
                onDismissTextSignature = component::dismissTextSignature,
                onDismissWebSignature = component::dismissWebSignaturePrompt,
                onApplyDiscountCode = component::applyDiscountCodePrompt,
                onDiscountCodeChanged = component::clearDiscountCodePromptFeedback,
                onContinueDiscountCode = component::continueFromDiscountCodePrompt,
                onDismissDiscountCode = component::dismissDiscountCodePrompt,
                onSubmitBillingAddress = component::submitBillingAddress,
                onDismissBillingAddress = component::dismissBillingAddressPrompt,
            ),
        )
        }
    }
}
