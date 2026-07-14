package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.animateDp
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.updateTransition
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Announcement
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.materialkolor.PaletteStyle
import com.materialkolor.dynamiccolor.ColorSpec
import com.materialkolor.ktx.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.addOfficialPosition
import com.razumly.mvp.core.data.dataTypes.addOfficialUser
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.divisionPriceRange
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
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
import com.razumly.mvp.core.data.util.resolveParticipantCapacity
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.presentation.EventDetailInitialTab
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.PlayerInteractionComponent
import com.razumly.mvp.core.presentation.composables.BillingAddressDialog
import com.razumly.mvp.core.presentation.composables.DiscountCodeDialog
import com.razumly.mvp.core.presentation.composables.EmbeddedWebModal
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.composables.PreparePaymentProcessor
import com.razumly.mvp.core.presentation.composables.PullToRefreshContainer
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.presentation.guides.EventGuideIds
import com.razumly.mvp.core.presentation.guides.EventGuideTargets
import com.razumly.mvp.core.presentation.guides.LocalGuideController
import com.razumly.mvp.core.presentation.guides.eventBracketTabGuide
import com.razumly.mvp.core.presentation.guides.eventOverviewGuide
import com.razumly.mvp.core.presentation.guides.eventParticipantsTabGuide
import com.razumly.mvp.core.presentation.guides.eventScheduleTabGuide
import com.razumly.mvp.core.presentation.guides.eventStandingsTabGuide
import com.razumly.mvp.core.presentation.guides.guideTarget
import com.razumly.mvp.core.presentation.util.buttonTransitionSpec
import com.razumly.mvp.core.presentation.util.CircularRevealUnderlay
import com.razumly.mvp.core.presentation.util.getEventQrCodeUrl
import com.razumly.mvp.core.presentation.util.toNameCase
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.core.util.resolvedTimeZone
import com.razumly.mvp.eventDetail.composables.MatchEditDialog
import com.razumly.mvp.eventDetail.composables.ParticipantsSection
import com.razumly.mvp.eventDetail.composables.ParticipantsView
import com.razumly.mvp.eventDetail.composables.ScheduleItem
import com.razumly.mvp.eventDetail.composables.ScheduleView
import com.razumly.mvp.eventDetail.composables.SendNotificationDialog
import com.razumly.mvp.eventDetail.composables.TeamSelectionDialog
import com.razumly.mvp.eventDetail.composables.TournamentBracketView
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import dev.icerock.moko.geo.LatLng
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
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
                            EventDetails(
                                paymentProcessor = component,
                                mapComponent = mapComponent,
                            hostHasAccount = currentUser.hasStripeAccount == true,
                            eventWithRelations = selectedEvent,
                            editEvent = editedEvent,
                            navPadding = LocalNavBarPadding.current,
                            topInset = innerPadding.calculateTopPadding(),
                            editView = isEditing,
                            showOfficialsPanel = showOfficialsPanel,
                            isNewEvent = false,
                            onOpenLocationMap = {
                                pendingMapPlace = null
                                isLocationPickerMapMode = true
                                mapComponent.toggleMap()
                            },
                            onAddCurrentUser = {},
                            imageScheme = imageScheme,
                            imageIds = eventImageIds,
                            eventRegistrationQuestions = eventRegistrationQuestions,
                            eventRegistrationQuestionAnswers = eventRegistrationQuestionAnswers,
                            eventRegistrationQuestionsExpanded = eventRegistrationQuestionsExpanded,
                            availableRentalResources = availableRentalResources,
                            selectedRentalResourceIds = selectedRentalResourceIds,
                            onRentalResourceSelectionChange = component::setRentalResourceSelected,
                            registrationHoldExpiresAt = registrationHoldExpiresAt,
                            onToggleEventRegistrationQuestions = component::toggleEventRegistrationQuestionsExpanded,
                            onEventRegistrationQuestionAnswerChange = component::updateEventRegistrationQuestionAnswer,
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
                            sports = sports,
                            eventTagOptions = eventTags,
                            divisionTypeParameters = divisionTypeParameters,
                            onUpdateDoTeamsOfficiate = { doTeamsOfficiate ->
                                component.editEventField {
                                    withDoTeamsOfficiate(doTeamsOfficiate)
                                }
                            },
                            onUpdateTeamOfficialsMaySwap = { teamOfficialsMaySwap ->
                                component.editEventField {
                                    copy(
                                        teamOfficialsMaySwap = if (usesTeamOfficialScheduling()) teamOfficialsMaySwap else false,
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
                                        allowTemporaryMatchPlayers = teamSignup && enabled && allowTemporaryMatchPlayers,
                                    )
                                }
                            },
                            onUpdateAllowTemporaryMatchPlayers = { enabled ->
                                component.editEventField {
                                    copy(
                                        allowTemporaryMatchPlayers = teamSignup && allowMatchRosterEdits && enabled,
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
                            editableFields = editableFieldsForDetails,
                            leagueTimeSlots = editableLeagueTimeSlots,
                            leagueScoringConfig = editableLeagueScoringConfig,
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
                            currentUserForHostActions = currentUser,
                            onHostMessageUser = component::onNavigateToChat,
                            onHostSendFriendRequest = { user ->
                                playerInteractionComponent.sendFriendRequest(user)
                            },
                            onHostFollowUser = { user ->
                                playerInteractionComponent.followUser(user)
                            },
                            onHostUnfollowUser = { user ->
                                playerInteractionComponent.unfollowUser(user)
                            },
                            onHostBlockUser = { user, leaveSharedChats ->
                                playerInteractionComponent.blockUser(user, leaveSharedChats)
                            },
                            onHostUnblockUser = { user ->
                                playerInteractionComponent.unblockUser(user)
                            },
                            onMapRevealCenterChange = { center ->
                                mapRevealCenter = center
                            },
                            onFloatingDockVisibilityChange = { shouldShow ->
                                showStickyDockByScroll = shouldShow
                            },
                            organizationTemplates = organizationTemplates,
                            organizationTemplatesLoading = organizationTemplatesLoading,
                            organizationTemplatesError = organizationTemplatesError,
                            pendingStaffInvites = pendingStaffInvites,
                            userSuggestions = suggestedUsers,
                            onSearchUsers = component::searchUsers,
                            onAddPendingStaffInvite = { firstName, lastName, email, roles ->
                                component.addPendingStaffInvite(firstName, lastName, email, roles)
                            },
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
                                        addOfficialUser(
                                            userId = officialId,
                                            sport = selectedSport,
                                        )
                                    }
                                },
                                onRemoveOfficialId = { officialId ->
                                    component.editEventField {
                                        removeOfficialUser(
                                            userId = officialId,
                                            sport = selectedSport,
                                        )
                                    }
                                },
                                heroTopControls = {
                                    if (!showMap) {
                                        Box(
                                            Modifier.padding(top = 64.dp, start = 16.dp)
                                                .align(Alignment.TopStart)
                                        ) {
                                            IconButton(
                                                { component.backCallback.onBack() },
                                                modifier = Modifier.background(
                                                    Color(imageScheme.surface).copy(alpha = 0.7f),
                                                    shape = CircleShape
                                                ),
                                            ) {
                                                Icon(
                                                    Icons.Default.Close,
                                                    contentDescription = "Close",
                                                    tint = Color(imageScheme.onSurface)
                                                )
                                            }
                                        }
                                        Box(
                                            modifier = Modifier.align(Alignment.TopEnd)
                                                .padding(top = 64.dp, end = 16.dp)
                                        ) {
                                            IconButton(
                                                onClick = { showOptionsDropdown = true },
                                                modifier = Modifier.background(
                                                    Color(imageScheme.surface).copy(alpha = 0.7f),
                                                    shape = CircleShape
                                                )
                                            ) {
                                                Icon(
                                                    Icons.Default.MoreVert,
                                                    contentDescription = "More options",
                                                    tint = Color(imageScheme.onSurface)
                                                )
                                            }

                                            DropdownMenu(
                                                expanded = showOptionsDropdown,
                                                onDismissRequest = { showOptionsDropdown = false }) {
                                                // Edit option
                                                if (canEditEventDetails) {
                                                    DropdownMenuItem(
                                                        text = { Text("Edit") }, onClick = {
                                                        component.startEditingEvent()
                                                        showOptionsDropdown = false
                                                    }, leadingIcon = {
                                                        Icon(Icons.Default.Edit, contentDescription = null)
                                                    }, enabled = canEditEventDetails
                                                    )
                                                }

                                                if (canCreateTemplateFromCurrentEvent) {
                                                    DropdownMenuItem(
                                                        text = { Text("Create Template") },
                                                        onClick = {
                                                            component.createTemplateFromCurrentEvent()
                                                            showOptionsDropdown = false
                                                        },
                                                        leadingIcon = {
                                                            Icon(Icons.Default.Check, contentDescription = null)
                                                        },
                                                    )
                                                }

                                                if (isHost && joinOptions.isNotEmpty()) {
                                                    DropdownMenuItem(
                                                        text = { Text(if (isAffiliateEvent) "Register on website" else "Join Event") },
                                                        onClick = {
                                                            if (isAffiliateEvent) {
                                                                component.joinEvent()
                                                            } else {
                                                                showJoinOptionsSheet = true
                                                            }
                                                            showOptionsDropdown = false
                                                        },
                                                        leadingIcon = {
                                                            Icon(Icons.Default.Add, contentDescription = null)
                                                        },
                                                    )
                                                }

                                                DropdownMenuItem(text = { Text("Share") }, onClick = {
                                                    component.shareEvent()
                                                    showOptionsDropdown = false
                                                }, leadingIcon = {
                                                    Icon(Icons.Default.Share, contentDescription = null)
                                                })

                                                if (canShowQrCode) {
                                                    DropdownMenuItem(
                                                        text = { Text("QR Code") },
                                                        onClick = {
                                                            showQrCodeDialog = true
                                                            showOptionsDropdown = false
                                                        },
                                                        leadingIcon = {
                                                            Icon(Icons.Default.QrCode, contentDescription = null)
                                                        },
                                                    )
                                                }

                                                if (!isHost) {
                                                    DropdownMenuItem(
                                                        text = { Text("Report Event") },
                                                        onClick = {
                                                            showReportEventDialog = true
                                                            showOptionsDropdown = false
                                                        },
                                                        leadingIcon = {
                                                            Icon(Icons.Default.Close, contentDescription = null)
                                                        },
                                                    )
                                                }

                                                if (canRequestRefundAfterStart || canLeaveEvent) {
                                                    DropdownMenuItem(
                                                        text = { Text(leaveOrRefundActionLabel) },
                                                        onClick = {
                                                            showOptionsDropdown = false
                                                            openLeaveOrRefundAction()
                                                        },
                                                        leadingIcon = {
                                                            Icon(Icons.Default.Close, contentDescription = null)
                                                        },
                                                    )
                                                }

                                                if (isHost) {
                                                    DropdownMenuItem(
                                                        text = { Text("Notify Players") },
                                                        onClick = {
                                                            showNotifyDialog = true
                                                            showOptionsDropdown = false
                                                        },
                                                        leadingIcon = {
                                                            Icon(
                                                                Icons.AutoMirrored.Filled.Announcement,
                                                                contentDescription = null,
                                                            )
                                                        })
                                                }

                                                if (canDeleteEvent) {
                                                    DropdownMenuItem(
                                                        text = { Text("Delete") }, onClick = {
                                                        showDeleteConfirmation = true
                                                        showOptionsDropdown = false
                                                    }, leadingIcon = {
                                                        Icon(
                                                            Icons.Default.Delete,
                                                            contentDescription = null,
                                                            tint = MaterialTheme.colorScheme.error
                                                        )
                                                    }, colors = MenuDefaults.itemColors(
                                                        textColor = MaterialTheme.colorScheme.error
                                                    )
                                                    )
                                                }
                                            }
                                        }
                                    }
                                },
                                modifier = Modifier.guideTarget(EventGuideTargets.OverviewHeader),
                            ) { isValid ->
                            val buttonColors = ButtonColors(
                                containerColor = Color(imageScheme.primary),
                                contentColor = Color(imageScheme.onPrimary),
                                disabledContainerColor = Color(imageScheme.onSurface),
                                disabledContentColor = Color(imageScheme.onSurfaceVariant)
                            )
                            AnimatedContent(
                                targetState = isEditing,
                                transitionSpec = { buttonTransitionSpec() },
                                label = "buttonTransition"
                            ) { editMode ->
                                if (editMode) {
                                    val canRescheduleEditedEvent =
                                        editedEvent.eventType == EventType.LEAGUE ||
                                            editedEvent.eventType == EventType.TOURNAMENT
                                    val canBuildBracketsForEditedEvent =
                                        editedEvent.eventType == EventType.TOURNAMENT ||
                                            (
                                                editedEvent.eventType == EventType.LEAGUE &&
                                                    editedEvent.includePlayoffs
                                                )
                                    val eventActionEnabled =
                                        !editedEvent.state.equals("TEMPLATE", ignoreCase = true)
                                    Column(
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Button(
                                                onClick = {
                                                    component.updateEvent()
                                                }, enabled = isValid, colors = buttonColors
                                            ) {
                                                Text("Confirm")
                                            }
                                            Button(
                                                onClick = {
                                                    component.cancelEditingEvent()
                                                }, colors = buttonColors
                                            ) {
                                                Text("Cancel")
                                            }
                                        }
                                        if (isHost && !editedEvent.state.equals("TEMPLATE", ignoreCase = true)) {
                                            val selectedLifecycleState = remember(editedEvent.state) {
                                                editedEvent.toEditableLifecycleState()
                                            }
                                            Box(
                                                modifier = Modifier.fillMaxWidth(),
                                                contentAlignment = Alignment.Center,
                                            ) {
                                                Button(
                                                    onClick = { showEventStateDropdown = true },
                                                    colors = buttonColors,
                                                ) {
                                                    Row(
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                    ) {
                                                        Text(selectedLifecycleState.label)
                                                        Icon(
                                                            imageVector = Icons.Default.KeyboardArrowDown,
                                                            contentDescription = null,
                                                        )
                                                    }
                                                }
                                                DropdownMenu(
                                                    expanded = showEventStateDropdown,
                                                    onDismissRequest = { showEventStateDropdown = false },
                                                ) {
                                                    EditableLifecycleState.values().forEach { option ->
                                                        DropdownMenuItem(
                                                            text = { Text(option.label) },
                                                            onClick = {
                                                                component.editEventField {
                                                                    copy(
                                                                        state = option.toEventState(currentState = state),
                                                                    )
                                                                }
                                                                showEventStateDropdown = false
                                                            },
                                                            leadingIcon = if (option == selectedLifecycleState) {
                                                                {
                                                                    Icon(
                                                                        imageVector = Icons.Default.Check,
                                                                        contentDescription = null,
                                                                    )
                                                                }
                                                            } else {
                                                                null
                                                            },
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                        if (canRescheduleEditedEvent) {
                                            Button(
                                                onClick = { component.rescheduleEvent() },
                                                enabled = eventActionEnabled,
                                                colors = buttonColors,
                                                modifier = Modifier.fillMaxWidth(),
                                            ) {
                                                Text("Reschedule Event")
                                            }
                                            if (canBuildBracketsForEditedEvent) {
                                                Button(
                                                    onClick = { showBuildBracketConfirmDialog = true },
                                                    enabled = eventActionEnabled,
                                                    colors = buttonColors,
                                                    modifier = Modifier.fillMaxWidth(),
                                                ) {
                                                    Text("Rebuild Bracket(s)")
                                                }
                                            }
                                            Button(
                                                onClick = { showRebuildWithoutPlaceholdersConfirmDialog = true },
                                                enabled = eventActionEnabled,
                                                colors = buttonColors,
                                                modifier = Modifier.fillMaxWidth(),
                                            ) {
                                                Text("Rebuild Without Placeholders")
                                            }
                                        }
                                        if (
                                            isHost &&
                                            !editedEvent.state.equals("TEMPLATE", ignoreCase = true) &&
                                            editedEvent.organizationId.isNullOrBlank()
                                        ) {
                                            Button(
                                                onClick = { component.createTemplateFromCurrentEvent() },
                                                enabled = true,
                                                colors = buttonColors,
                                            ) {
                                                Text("Create Template")
                                            }
                                        }
                                    }
                                } else {
                                        EventOverviewSections(
                                            state = EventDetailOverviewState(
                                            eventWithRelations = selectedEvent,
                                            teamsAndParticipantsLoading = eventTeamsAndParticipantsLoading,
                                            matchesLoading = eventMatchesLoading,
                                            showFullnessSummary = !isWeeklyParentEvent ||
                                                selectedWeeklyOccurrenceSummary != null,
                                            selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                                            selectedWeeklyOccurrenceSummary = selectedWeeklyOccurrenceSummary,
                                            overviewParticipantSummary = overviewParticipantSummary,
                                            showOpenDetailsAction = showOverviewOpenDetailsAction,
                                        ),
                                            actions = EventDetailOverviewActions(
                                                onOpenDetails = component::viewEvent,
                                            ),
                                            formatModifier = Modifier.guideTarget(EventGuideTargets.OverviewFormat),
                                        )
                                }
                            }
                        }

                    }
                }
                AnimatedVisibility(
                    showDetails,
                    enter = EnterTransition.None,
                    exit = ExitTransition.None,
                ) {
                    Column(Modifier.padding(innerPadding).padding(top = 4.dp)) {
                        val availableTabs = remember(hasBracketView, hasScheduleView, hasStandingsView) {
                            buildList {
                                add(DetailTab.PARTICIPANTS)
                                if (hasScheduleView) add(DetailTab.SCHEDULE)
                                if (hasStandingsView) add(DetailTab.LEAGUES)
                                if (hasBracketView) add(DetailTab.BRACKET)
                            }
                        }
                        val requestedInitialTab = remember(initialTab, availableTabs) {
                            when {
                                initialTab == EventDetailInitialTab.SCHEDULE &&
                                    DetailTab.SCHEDULE in availableTabs -> DetailTab.SCHEDULE

                                else -> DetailTab.PARTICIPANTS
                            }
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
                            EventDetailTabStrip(
                                availableTabs = availableTabs,
                                selectedTab = selectedTab,
                                onTabSelected = { selectedTab = it },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .guideTarget(EventGuideTargets.DetailTabs)
                                    .padding(start = 12.dp, end = 12.dp, bottom = 8.dp),
                            )
                        Box(Modifier.fillMaxSize()) {
                                when (selectedTab) {
                                    DetailTab.BRACKET -> {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxSize()
                                                .guideTarget(EventGuideTargets.BracketContent),
                                        ) {
                                            TournamentBracketView(
                                                showFab = { showFab = it },
                                                topContentPadding = tabContentTopOffset,
                                                canManageBracket = canManageMatchEditingFromDock,
                                                onMatchClick = { match ->
                                                    if (!canEditMatches) {
                                                        component.matchSelected(match)
                                                    }
                                                },
                                                isEditingMatches = canEditMatches,
                                                editableMatches = editableMatches,
                                                onEditMatch = { match ->
                                                    if (canEditMatches) {
                                                        component.showMatchEditDialog(match)
                                                    } else {
                                                        component.matchSelected(match)
                                                    }
                                                },
                                                showEventOfficialNames = canEditMatches || isEventOfficial,
                                                limitOfficialsToCurrentUser = isEventOfficial && !canEditMatches,
                                            )
                                        }
                                    }

                                    DetailTab.SCHEDULE -> {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxSize()
                                                .guideTarget(EventGuideTargets.ScheduleContent),
                                        ) {
                                        if (isWeeklyParentEvent) {
                                            ScheduleView(
                                            items = weeklyScheduleItems,
                                            fields = eventFields,
                                            showFab = { showFab = it },
                                            topContentPadding = tabContentTopOffset,
                                            timeZone = selectedEvent.event.resolvedTimeZone(),
                                            onMatchClick = {},
                                            onEventClick = { selectedOccurrenceEvent ->
                                                weeklyScheduleOptionsById[selectedOccurrenceEvent.id]?.let { session ->
                                                    component.selectWeeklySession(
                                                        sessionStart = session.start,
                                                        sessionEnd = session.end,
                                                        slotId = session.slotId,
                                                        occurrenceDate = session.occurrenceDate,
                                                        label = session.label,
                                                    )
                                                }
                                            },
                                            eventCardContent = { scheduleEvent, _, _, onClick ->
                                                val session = weeklyScheduleOptionsById[scheduleEvent.id]
                                                if (session != null) {
                                                    val activeOccurrence = selectedWeeklyOccurrence
                                                    val isSelectedOccurrence = activeOccurrence?.slotId == session.slotId &&
                                                        activeOccurrence?.occurrenceDate == session.occurrenceDate
                                                    val isClosedOccurrence = Clock.System.now() >= session.start
                                                    Surface(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .padding(horizontal = 16.dp, vertical = 20.dp)
                                                            .clickable(onClick = onClick),
                                                        shape = RoundedCornerShape(16.dp),
                                                        color = if (isSelectedOccurrence) {
                                                            MaterialTheme.colorScheme.primaryContainer
                                                        } else {
                                                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.32f)
                                                        },
                                                        tonalElevation = if (isSelectedOccurrence) 3.dp else 0.dp,
                                                    ) {
                                                        Column(
                                                            modifier = Modifier
                                                                .fillMaxWidth()
                                                                .padding(14.dp),
                                                            verticalArrangement = Arrangement.spacedBy(4.dp),
                                                        ) {
                                                            Text(
                                                                text = session.label,
                                                                style = MaterialTheme.typography.titleSmall,
                                                                fontWeight = FontWeight.SemiBold,
                                                                color = if (isSelectedOccurrence) {
                                                                    MaterialTheme.colorScheme.onPrimaryContainer
                                                                } else {
                                                                    MaterialTheme.colorScheme.onSurface
                                                                },
                                                            )
                                                            Text(
                                                                text = session.divisionLabel,
                                                                style = MaterialTheme.typography.bodySmall,
                                                                color = if (isSelectedOccurrence) {
                                                                    MaterialTheme.colorScheme.onPrimaryContainer
                                                                } else {
                                                                    MaterialTheme.colorScheme.onSurfaceVariant
                                                                },
                                                            )
                                                            if (isSelectedOccurrence) {
                                                                selectedWeeklyOccurrenceSummary?.let { summary ->
                                                                    val fullnessLabel = summary.participantCapacity?.let { capacity ->
                                                                        "${summary.participantCount} of $capacity spots filled"
                                                                    } ?: "${summary.participantCount} spots filled"
                                                                    Text(
                                                                        text = fullnessLabel,
                                                                        style = MaterialTheme.typography.bodySmall,
                                                                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                                                                    )
                                                                }
                                                            } else if (isClosedOccurrence) {
                                                                Text(
                                                                    text = "Started",
                                                                    style = MaterialTheme.typography.bodySmall,
                                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                                )
                                                            }
                                                        }
                                                    }
                                                } else {
                                                    Surface(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .padding(horizontal = 16.dp, vertical = 20.dp)
                                                            .clickable(onClick = onClick),
                                                        shape = RoundedCornerShape(16.dp),
                                                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.32f),
                                                    ) {
                                                        Column(
                                                            modifier = Modifier
                                                                .fillMaxWidth()
                                                                .padding(14.dp),
                                                            verticalArrangement = Arrangement.spacedBy(4.dp),
                                                        ) {
                                                            Text(
                                                                text = scheduleEvent.name.ifBlank { "Weekly occurrence" },
                                                                style = MaterialTheme.typography.titleSmall,
                                                                fontWeight = FontWeight.SemiBold,
                                                                color = MaterialTheme.colorScheme.onSurface,
                                                            )
                                                            scheduleEvent.location.takeIf { it.isNotBlank() }?.let { label ->
                                                                Text(
                                                                    text = label,
                                                                    style = MaterialTheme.typography.bodySmall,
                                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                                )
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                        )
                                    } else if (eventMatchesLoading) {
                                        showFab = false
                                        DetailTabLoadingState("Loading schedule matches...")
                                    } else {
                                        val allScheduleMatches = if (canEditMatches) {
                                            editableMatches
                                        } else {
                                            selectedEvent.matches
                                        }
                                        val scheduleMatches = when {
                                            tournamentPoolPlayEnabled && !selectedSchedulePoolDivisionId.isNullOrBlank() -> {
                                                val selectedPoolDivisionId = selectedSchedulePoolDivisionId
                                                val normalizedPoolDivisionId =
                                                    selectedPoolDivisionId.orEmpty().normalizeDivisionIdentifier()
                                                allScheduleMatches.filter { match ->
                                                    match.match.division?.normalizeDivisionIdentifier() ==
                                                        normalizedPoolDivisionId
                                                }
                                            }

                                            tournamentPoolPlayEnabled && !selectedScheduleDivisionId.isNullOrBlank() -> {
                                                val poolDivisionIds = schedulePoolDivisionOptions.map { option -> option.id }
                                                val normalizedScheduleDivisionId =
                                                    selectedScheduleDivisionId.normalizeDivisionIdentifier()
                                                allScheduleMatches.filter { match ->
                                                    val normalizedMatchDivision =
                                                        match.match.division?.normalizeDivisionIdentifier()
                                                    normalizedMatchDivision == normalizedScheduleDivisionId ||
                                                        poolDivisionIds.any { poolDivisionId ->
                                                            normalizedMatchDivision ==
                                                                poolDivisionId.normalizeDivisionIdentifier()
                                                        }
                                                }
                                            }

                                            selectedEvent.event.singleDivision || selectedDivision.isNullOrBlank() -> {
                                                allScheduleMatches
                                            }

                                            else -> {
                                                val selectedScheduleFallbackDivision = selectedDivision
                                                val normalizedSelectedDivision =
                                                    selectedScheduleFallbackDivision.orEmpty().normalizeDivisionIdentifier()
                                                allScheduleMatches.filter { match ->
                                                    match.match.division?.normalizeDivisionIdentifier() ==
                                                        normalizedSelectedDivision
                                                }
                                            }
                                        }
                                        val scheduledMatches = scheduleMatches.filter { match ->
                                            match.match.start != null
                                        }
                                        ScheduleView(
                                            items = scheduledMatches.map { match -> ScheduleItem.MatchEntry(match) },
                                            fields = eventFields,
                                            showFab = { showFab = it },
                                            topContentPadding = tabContentTopOffset,
                                            timeZone = selectedEvent.event.resolvedTimeZone(),
                                            trackedUserIds = scheduleTrackedUserIds,
                                            showEventOfficialNames = canEditMatches || isEventOfficial,
                                            limitOfficialsToCurrentUser = isEventOfficial && !canEditMatches,
                                            canManageMatches = canEditMatches,
                                            onToggleLockAllMatches = { locked, matchIds ->
                                                component.setLockForEditableMatches(matchIds, locked)
                                            },
                                            onMatchClick = { match ->
                                                if (canEditMatches) {
                                                    component.showMatchEditDialog(
                                                        match = match,
                                                        creationContext = MatchCreateContext.SCHEDULE,
                                                    )
                                                } else {
                                                    component.matchSelected(match)
                                                }
                                                }
                                            )
                                        }
                                        }
                                    }
                                    DetailTab.LEAGUES -> {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxSize()
                                                .guideTarget(EventGuideTargets.StandingsContent),
                                        ) {
                                            val selectedLeagueDivisionStandings = leagueDivisionStandings?.takeIf { standings ->
                                                !selectedStandingsDataDivisionId.isNullOrBlank() &&
                                                    standings.divisionId.normalizeDivisionIdentifier() ==
                                                        selectedStandingsDataDivisionId.normalizeDivisionIdentifier()
                                            }
                                            LeagueStandingsTab(
                                                state = EventDetailStandingsState(
                                                    standings = leagueStandings,
                                                    standingsDivisionKey = selectedStandingsDataDivisionId
                                                        ?.trim()
                                                        ?.takeIf(String::isNotBlank)
                                                        ?: selectedStandingsDivisionId
                                                            ?.trim()
                                                            ?.takeIf(String::isNotBlank)
                                                        ?: "all",
                                                    showDrawColumn = showStandingsDrawColumn,
                                                    topContentPadding = tabContentTopOffset,
                                                    standingsConfirmedAt = selectedLeagueDivisionStandings?.standingsConfirmedAt,
                                                    validationMessages = selectedLeagueDivisionStandings?.validationMessages.orEmpty(),
                                                    isLoading = false,
                                                    isConfirming = leagueStandingsConfirming,
                                                    canConfirmStandings = canManageLeagueStandings,
                                                ),
                                                actions = EventDetailStandingsActions(
                                                    showFab = { showFab = it },
                                                ),
                                            )
                                        }
                                    }

                                    DetailTab.PARTICIPANTS -> {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxSize()
                                                .guideTarget(EventGuideTargets.ParticipantsContent),
                                        ) {
                                        if (eventTeamsAndParticipantsLoading) {
                                            showFab = false
                                        DetailTabLoadingState("Loading teams and participants...")
                                    } else if (isWeeklyParentEvent && selectedWeeklyOccurrence == null) {
                                        showFab = true
                                        Box(
                                            modifier = Modifier
                                                .fillMaxSize()
                                                .padding(horizontal = 24.dp),
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Text(
                                                text = "Select an occurrence from the Schedule tab to view or manage participants.",
                                                style = MaterialTheme.typography.bodyLarge,
                                                textAlign = TextAlign.Center,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    } else {
                                        ParticipantsView(
                                            showFab = { showFab = it },
                                            section = selectedParticipantsSection,
                                            onNavigateToChat = component::onNavigateToChat,
                                            manageMode = isManagingParticipants,
                                            canManageParticipants = canManageParticipantsFromDock,
                                            showEventCheckInBadges = showEventCheckInBadges,
                                            topContentPadding = tabContentTopOffset,
                                            selectedDivisionId = selectedParticipantsDivisionId
                                                ?: selectedDivision,
                                            divisionOptions = registrationDivisionOptions,
                                            divisionWarnings = participantDivisionWarnings,
                                                onTeamDivisionSelected = component::moveTeamParticipantDivision,
                                            )
                                        }
                                        }
                                    }
                                }
                            @Suppress("RedundantQualifierName")
                            androidx.compose.animation.AnimatedVisibility(
                                visible = selectedDivisionSelectorState != null,
                                    modifier = Modifier
                                        .align(Alignment.TopCenter)
                                        .padding(top = 4.dp)
                                        .guideTarget(EventGuideTargets.DetailDivisionSelector)
                                        .zIndex(2f),
                                enter = expandVertically(expandFrom = Alignment.Top) + fadeIn(),
                                exit = shrinkVertically(shrinkTowards = Alignment.Top) + fadeOut(),
                            ) {
                                selectedDivisionSelectorState?.let { selectorState ->
                                    EventDetailDivisionSelectorBar(
                                        divisionState = selectorState.divisionState,
                                        poolState = selectorState.poolState,
                                        onDivisionSelected = { divisionId ->
                                            when (selectedTab) {
                                                DetailTab.BRACKET -> {
                                                    component.selectDivision(divisionId)
                                                }
                                                DetailTab.SCHEDULE -> {
                                                    selectedSchedulePoolDivisionId = null
                                                    component.selectDivision(divisionId)
                                                }
                                                DetailTab.LEAGUES -> {
                                                    selectedStandingsPoolDivisionId = null
                                                    component.selectDivision(divisionId)
                                                }
                                                DetailTab.PARTICIPANTS -> {
                                                    component.selectDivision(divisionId)
                                                }
                                            }
                                        },
                                        onPoolSelected = { poolDivisionId ->
                                            when (selectedTab) {
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
                                    )
                                }
                            }
                            @Suppress("RedundantQualifierName")
                            androidx.compose.animation.AnimatedVisibility(
                                visible = showFab,
                                modifier = Modifier.align(Alignment.BottomCenter)
                                    .padding(LocalNavBarPadding.current)
                                    .padding(start = 16.dp, end = 16.dp, bottom = 12.dp),
                                enter = slideInVertically() + fadeIn(),
                                exit = slideOutVertically() + fadeOut()
                            ) {
                                when (selectedTab) {
                                    DetailTab.BRACKET -> ExpandableFloatingDock(
                                        expanded = isDetailDockExpanded,
                                        onExpandClick = { isDetailDockExpanded = true },
                                        onCollapseClick = { isDetailDockExpanded = false },
                                    ) { dockModifier, onCloseClick ->
                                        BracketFloatingBar(
                                            showBracketToggle = showLosersBracketSelector,
                                            isLosersBracket = losersBracket,
                                            onBracketToggle = component::toggleLosersBracket,
                                            showMatchEditAction = canManageMatchEditingFromDock,
                                            isEditingMatches = canEditMatches,
                                            onStartMatchEdit = component::startEditingMatches,
                                            onCancelMatchEdit = component::cancelEditingMatches,
                                            onCommitMatchEdit = component::commitMatchChanges,
                                            primaryActionLabel = if (canEditMatches) {
                                                "Add Match"
                                            } else {
                                                null
                                            },
                                            onPrimaryActionClick = if (canEditMatches) {
                                                component::addBracketMatch
                                            } else {
                                                null
                                            },
                                            primaryActionEnabled = canEditMatches,
                                            primaryActionColors = if (canEditMatches) {
                                                ButtonDefaults.buttonColors(
                                                    containerColor = Color(0xFF2E7D32),
                                                    contentColor = Color.White,
                                                )
                                            } else {
                                                null
                                            },
                                            showPrimaryActionFirst = true,
                                            useVerticalLayout = true,
                                            onCloseClick = onCloseClick,
                                            wrapInSurface = false,
                                            selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                                            onClearSelectedWeeklyOccurrence = if (isWeeklyParentEvent) {
                                                component::clearSelectedWeeklySession
                                            } else {
                                                null
                                            },
                                            onShowDetailsClick = component::toggleDetails,
                                            modifier = dockModifier,
                                        )
                                    }

                                    DetailTab.SCHEDULE -> ExpandableFloatingDock(
                                        expanded = isDetailDockExpanded,
                                        onExpandClick = { isDetailDockExpanded = true },
                                        onCollapseClick = { isDetailDockExpanded = false },
                                    ) { dockModifier, onCloseClick ->
                                        BracketFloatingBar(
                                            showMatchEditAction = showScheduleMatchManagement,
                                            isEditingMatches = showScheduleMatchManagement && canEditMatches,
                                            onStartMatchEdit = component::startEditingMatches,
                                            onCancelMatchEdit = component::cancelEditingMatches,
                                            onCommitMatchEdit = component::commitMatchChanges,
                                            primaryActionLabel = if (showScheduleMatchManagement && canEditMatches) {
                                                "Add Match"
                                            } else {
                                                null
                                            },
                                            onPrimaryActionClick = if (showScheduleMatchManagement && canEditMatches) {
                                                component::addScheduleMatch
                                            } else {
                                                null
                                            },
                                            primaryActionEnabled = showScheduleMatchManagement && canEditMatches,
                                            primaryActionColors = if (showScheduleMatchManagement && canEditMatches) {
                                                ButtonDefaults.buttonColors(
                                                    containerColor = Color(0xFF2E7D32),
                                                    contentColor = Color.White,
                                                )
                                            } else {
                                                null
                                            },
                                            showPrimaryActionFirst = true,
                                            useVerticalLayout = true,
                                            onCloseClick = onCloseClick,
                                            wrapInSurface = false,
                                            selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                                            onClearSelectedWeeklyOccurrence = if (isWeeklyParentEvent) {
                                                component::clearSelectedWeeklySession
                                            } else {
                                                null
                                            },
                                            onShowDetailsClick = component::toggleDetails,
                                            modifier = dockModifier,
                                        )
                                    }

                                    DetailTab.LEAGUES -> ExpandableFloatingDock(
                                        expanded = isDetailDockExpanded,
                                        onExpandClick = { isDetailDockExpanded = true },
                                        onCollapseClick = { isDetailDockExpanded = false },
                                    ) { dockModifier, onCloseClick ->
                                        BracketFloatingBar(
                                            showMatchEditAction = canManageMatchEditingFromDock,
                                            isEditingMatches = canEditMatches,
                                            onStartMatchEdit = component::startEditingMatches,
                                            onCancelMatchEdit = component::cancelEditingMatches,
                                            onCommitMatchEdit = component::commitMatchChanges,
                                            showConfirmResultsAction = canConfirmLeagueResultsFromDock,
                                            confirmResultsEnabled = canConfirmLeagueResultsFromDock &&
                                                !leagueDivisionStandingsLoading &&
                                                !leagueStandingsConfirming &&
                                                leagueStandings.isNotEmpty(),
                                            confirmResultsInProgress = leagueStandingsConfirming,
                                            onConfirmResultsClick = { showStandingsConfirmDialog = true },
                                            useVerticalLayout = true,
                                            onCloseClick = onCloseClick,
                                            wrapInSurface = false,
                                            selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                                            onClearSelectedWeeklyOccurrence = if (isWeeklyParentEvent) {
                                                component::clearSelectedWeeklySession
                                            } else {
                                                null
                                            },
                                            onShowDetailsClick = component::toggleDetails,
                                            modifier = dockModifier,
                                        )
                                    }

                                    DetailTab.PARTICIPANTS -> ExpandableFloatingDock(
                                        expanded = isDetailDockExpanded,
                                        onExpandClick = { isDetailDockExpanded = true },
                                        onCollapseClick = { isDetailDockExpanded = false },
                                    ) { dockModifier, onCloseClick ->
                                        ParticipantsFloatingBar(
                                            selectedSection = selectedParticipantsSection,
                                            availableSections = participantSections,
                                            onSectionSelected = { selectedParticipantsSection = it },
                                            showManageAction = canManageParticipantsFromDock,
                                            isManagingParticipants = isManagingParticipants,
                                            onStartManagingParticipants = {
                                                isManagingParticipants = true
                                                component.startManagingParticipants()
                                            },
                                            onStopManagingParticipants = {
                                                isManagingParticipants = false
                                                component.stopManagingParticipants()
                                            },
                                            inviteActionLabel = if (canManageParticipantsFromDock && isManagingParticipants) {
                                                if (selectedEvent.event.teamSignup) "Invite Team" else "Invite Player"
                                            } else {
                                                null
                                            },
                                            onInviteClick = if (canManageParticipantsFromDock && isManagingParticipants) {
                                                {
                                                    if (selectedEvent.event.teamSignup) {
                                                        component.searchInviteTeams("")
                                                        showInviteTeamDialog = true
                                                    } else {
                                                        component.searchUsers("")
                                                        showInvitePlayerDialog = true
                                                    }
                                                }
                                            } else {
                                                null
                                            },
                                            useVerticalLayout = true,
                                            onCloseClick = onCloseClick,
                                            wrapInSurface = false,
                                            selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                                            onClearSelectedWeeklyOccurrence = if (isWeeklyParentEvent) {
                                                component::clearSelectedWeeklySession
                                            } else {
                                                null
                                            },
                                            onShowDetailsClick = component::toggleDetails,
                                            modifier = dockModifier,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
            var stickyActionBarHeightPx by remember { mutableStateOf(0) }
            val stickyActionBarTransition = updateTransition(
                targetState = showStickyActions,
                label = "StickyActionBarVisibility",
            )
            val stickyActionBarMotionDurationMillis = 180
            val stickyActionBarEnterShadowDurationMillis = 120
            val stickyActionBarExitShadowDurationMillis = 1
            val stickyActionBarExitMotionDelayMillis = 40
            val stickyActionBarAlpha by stickyActionBarTransition.animateFloat(
                transitionSpec = {
                    if (!initialState && targetState) {
                        tween(durationMillis = stickyActionBarMotionDurationMillis)
                    } else {
                        tween(
                            durationMillis = stickyActionBarMotionDurationMillis,
                            delayMillis = stickyActionBarExitMotionDelayMillis,
                        )
                    }
                },
                label = "StickyActionBarAlpha",
            ) { visible ->
                if (visible) 1f else 0f
            }
            val stickyActionBarOffsetFraction by stickyActionBarTransition.animateFloat(
                transitionSpec = {
                    if (!initialState && targetState) {
                        tween(durationMillis = stickyActionBarMotionDurationMillis)
                    } else {
                        tween(
                            durationMillis = stickyActionBarMotionDurationMillis,
                            delayMillis = stickyActionBarExitMotionDelayMillis,
                        )
                    }
                },
                label = "StickyActionBarOffsetFraction",
            ) { visible ->
                if (visible) 0f else 0.5f
            }
            val stickyActionBarShadowElevation by stickyActionBarTransition.animateDp(
                transitionSpec = {
                    if (!initialState && targetState) {
                        tween(
                            durationMillis = stickyActionBarEnterShadowDurationMillis,
                            delayMillis = stickyActionBarMotionDurationMillis,
                        )
                    } else {
                        tween(durationMillis = stickyActionBarExitShadowDurationMillis)
                    }
                },
                label = "StickyActionBarShadowElevation",
            ) { visible ->
                if (visible) 6.dp else 0.dp
            }
            val shouldRenderStickyActionBar =
                showStickyActions ||
                    stickyActionBarAlpha > 0.01f ||
                    stickyActionBarShadowElevation > 0.dp ||
                    stickyActionBarTransition.currentState != stickyActionBarTransition.targetState

            if (shouldRenderStickyActionBar) {
                StickyActionBar(
                    primaryLabel = when {
                        isAffiliateEvent -> "Register on website"
                        isRegistrationPaymentPending -> "Payment pending"
                        isRegistrationPaymentFailed && !joinBlockedByStart -> "Complete payment"
                        isWeeklyParentEvent && !joinBlockedByStart -> "Join Event"
                        shouldShowViewSchedulePrimaryAction -> "View Schedule and Participants"
                        !isUserInEvent && !joinBlockedByStart -> "Join options"
                        joinBlockedByStart && isWeeklyParentEvent -> "Occurrence Started"
                        joinBlockedByStart -> "Event Started"
                        else -> "Joined with Team"
                    },
                    primaryEnabled = if (isAffiliateEvent) {
                        true
                    } else if (isWeeklyParentEvent) {
                        !isRegistrationPaymentPending && !joinBlockedByStart
                    } else {
                        !isRegistrationPaymentPending &&
                            (
                                (isRegistrationPaymentFailed && !joinBlockedByStart) ||
                                    shouldShowViewSchedulePrimaryAction ||
                                    (!isUserInEvent && !joinBlockedByStart)
                                )
                    },
                    onPrimaryClick = {
                        when {
                            isAffiliateEvent -> component.joinEvent()
                            isRegistrationPaymentPending -> Unit
                            isRegistrationPaymentFailed && !joinBlockedByStart -> showJoinOptionsSheet = true
                            isWeeklyParentEvent && !joinBlockedByStart -> showJoinOptionsSheet = true
                            shouldShowViewSchedulePrimaryAction -> component.viewEvent()
                            !isUserInEvent && !joinBlockedByStart -> showJoinOptionsSheet = true
                        }
                    },
                    onMapClick = mapComponent::toggleMap,
                    onDirectionsClick = component::openEventDirections,
                    directionsEnabled = hasDirectionsTarget,
                    onMapButtonPositioned = { center ->
                        mapRevealCenter = center
                    },
                    onShareClick = component::shareEvent,
                    selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                    onClearSelectedWeeklyOccurrence = if (isWeeklyParentEvent) {
                        component::clearSelectedWeeklySession
                    } else {
                        null
                    },
                    barAlpha = stickyActionBarAlpha,
                    shadowElevation = stickyActionBarShadowElevation,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(LocalNavBarPadding.current)
                        .padding(start = 16.dp, end = 16.dp, bottom = 12.dp)
                        .offset {
                            IntOffset(
                                x = 0,
                                y = (stickyActionBarHeightPx * stickyActionBarOffsetFraction).toInt(),
                            )
                        }
                        .onSizeChanged { size ->
                            stickyActionBarHeightPx = size.height
                        }
                        .guideTarget(EventGuideTargets.OverviewPrimaryAction),
                )
            }
            }
                }
        }

        if (showWithdrawTargetDialog && actionWithdrawTargets.isNotEmpty()) {
            WithdrawTargetDialog(
                targets = actionWithdrawTargets,
                onDismiss = { showWithdrawTargetDialog = false },
                onTargetSelected = { target ->
                    showWithdrawTargetDialog = false
                    openLeaveOrRefundForTarget(target)
                },
            )
        }

            val canRenderJoinOptionsSheet = isWeeklyParentEvent || joinOptions.isNotEmpty()
            if (showJoinOptionsSheet && canRenderJoinOptionsSheet) {
                ModalBottomSheet(
                    onDismissRequest = { showJoinOptionsSheet = false }
                ) {
                    JoinOptionsSheet(
                        state = EventDetailJoinSheetsState(
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
                        actions = EventDetailJoinSheetsActions(
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
                    )
                }
            }

            showTeamDialog?.let { dialogState ->
                TeamSelectionDialog(
                    dialogState = dialogState, onTeamSelected = { teamId ->
                        component.selectTeamForMatch(
                            dialogState.matchId, dialogState.position, teamId
                        )
                    }, onDismiss = component::dismissTeamSelection
                )
            }
            showMatchEditDialog?.let { dialogState ->
                MatchEditDialog(
                    match = dialogState.match,
                    teams = dialogState.teams,
                    fields = dialogState.fields,
                    allMatches = dialogState.allMatches,
                    eventOfficials = dialogState.eventOfficials,
                    officialPositions = dialogState.officialPositions,
                    users = dialogState.players,
                    eventType = dialogState.eventType,
                    isCreateMode = dialogState.isCreateMode,
                    creationContext = dialogState.creationContext,
                    onDismissRequest = component::dismissMatchEditDialog,
                    onConfirm = component::updateMatchFromDialog,
                    onDelete = component::deleteMatchFromDialog,
                )
            }
            if (showTeamSelectionDialog) {
                TeamSelectionDialog(
                    eventSportLabel = teamSelectionSportLabel,
                    teams = validTeams,
                    onTeamSelected = { selectedTeam ->
                        showTeamSelectionDialog = false
                        component.joinEventAsTeam(selectedTeam)
                    },
                    onDismiss = {
                        showTeamSelectionDialog = false
                    },
                    onCreateTeam = { component.createNewTeam() },
                )
            }
            if (showEventTeamCheckInDialog) {
                val teamName = currentUserManagedEventTeam
                    ?.team
                    ?.name
                    ?.takeIf(String::isNotBlank)
                    ?: "your team"
                AlertDialog(
                    onDismissRequest = {
                        if (!eventTeamCheckInSaving) {
                            component.dismissEventTeamCheckInDialog()
                        }
                    },
                    title = { Text("Check in for event?") },
                    text = { Text("Check in $teamName for this event.") },
                    confirmButton = {
                        Button(
                            onClick = component::confirmEventTeamCheckIn,
                            enabled = !eventTeamCheckInSaving,
                        ) {
                            Text(if (eventTeamCheckInSaving) "Saving..." else "Check in")
                        }
                    },
                    dismissButton = {
                        Button(
                            onClick = component::dismissEventTeamCheckInDialog,
                            enabled = !eventTeamCheckInSaving,
                        ) {
                            Text("Not now")
                        }
                    },
                )
            }
            joinChoiceDialog?.let {
                AlertDialog(
                    onDismissRequest = component::dismissJoinChoiceDialog,
                    title = { Text("Join Event") },
                    text = {
                        Text("You have linked children. Do you want to join yourself or register a child instead?")
                    },
                    confirmButton = {
                        Button(onClick = component::confirmJoinAsSelf) {
                            Text("Join Myself")
                        }
                    },
                    dismissButton = {
                        Button(onClick = component::showChildJoinSelection) {
                            Text("Register Child")
                        }
                    },
                )
            }
            childJoinSelectionDialog?.let { dialogState ->
                ChildJoinSelectionDialog(
                    dialogState = dialogState,
                    onDismiss = component::dismissChildJoinSelectionDialog,
                    onChildSelected = component::selectChildForJoin,
                )
            }
            teamJoinQuestionDialog?.let { dialogState ->
                TeamJoinQuestionsDialog(
                    dialogState = dialogState,
                    onDismiss = component::dismissTeamJoinQuestionDialog,
                    onSubmit = component::submitTeamJoinQuestionAnswers,
                )
            }
            eventRegistrationQuestionDialog?.let { dialogState ->
                EventRegistrationQuestionsDialog(
                    dialogState = dialogState,
                    onDismiss = component::dismissEventRegistrationQuestionDialog,
                    onSubmit = component::submitEventRegistrationQuestionDialogAnswers,
                )
            }
            paymentPlanPreviewDialog?.let { dialogState ->
                PaymentPlanPreviewDialog(
                    dialogState = dialogState,
                    onContinue = component::confirmPaymentPlanPreviewDialog,
                    onCancel = component::dismissPaymentPlanPreviewDialog,
                )
            }
            if (showStandingsConfirmDialog) {
                AlertDialog(
                    onDismissRequest = { showStandingsConfirmDialog = false },
                    title = { Text("Confirm Results") },
                    text = {
                        Text("Update playoff assignments based on these results?")
                    },
                    confirmButton = {
                        TextButton(
                            onClick = {
                                showStandingsConfirmDialog = false
                                selectedStandingsDataDivisionId?.let(component::selectDivision)
                                component.confirmLeagueStandings(applyReassignment = true)
                            }
                        ) {
                            Text("Yes")
                        }
                    },
                    dismissButton = {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(
                                onClick = {
                                    showStandingsConfirmDialog = false
                                    selectedStandingsDataDivisionId?.let(component::selectDivision)
                                    component.confirmLeagueStandings(applyReassignment = false)
                                }
                            ) {
                                Text("No")
                            }
                            TextButton(
                                onClick = { showStandingsConfirmDialog = false }
                            ) {
                                Text("Cancel")
                            }
                        }
                    },
                )
            }
            if (showBuildBracketConfirmDialog) {
                AlertDialog(
                    onDismissRequest = { showBuildBracketConfirmDialog = false },
                    title = { Text("Rebuild Bracket(s)") },
                    text = {
                        Text(
                            "This rebuilds playoff/tournament bracket(s) from max participant count. " +
                                "It will reset the bracket and any playoff/tournament match results."
                        )
                    },
                    confirmButton = {
                        TextButton(
                            onClick = {
                                showBuildBracketConfirmDialog = false
                                component.buildBrackets()
                            }
                        ) {
                            Text("Rebuild")
                        }
                    },
                    dismissButton = {
                        TextButton(
                            onClick = { showBuildBracketConfirmDialog = false }
                        ) {
                            Text("Cancel")
                        }
                    },
                )
            }
            if (showRebuildWithoutPlaceholdersConfirmDialog) {
                AlertDialog(
                    onDismissRequest = { showRebuildWithoutPlaceholdersConfirmDialog = false },
                    title = { Text("Rebuild Without Placeholders") },
                    text = {
                        Text(
                            "This removes empty placeholder teams and rebuilds matches from registered teams only."
                        )
                    },
                    confirmButton = {
                        TextButton(
                            onClick = {
                                showRebuildWithoutPlaceholdersConfirmDialog = false
                                component.rebuildWithoutPlaceholderTeams()
                            }
                        ) {
                            Text("Rebuild")
                        }
                    },
                    dismissButton = {
                        TextButton(
                            onClick = { showRebuildWithoutPlaceholdersConfirmDialog = false }
                        ) {
                            Text("Cancel")
                        }
                    },
                )
            }
            if (showQrCodeDialog && canShowQrCode) {
                EventQrCodeDialog(
                    eventName = selectedEvent.event.name,
                    qrImageUrl = getEventQrCodeUrl(selectedEvent.event.id),
                    onDismiss = { showQrCodeDialog = false },
                    onShareQrCode = component::shareEventQrCode,
                )
            }
            if (showDeleteConfirmation) {
                AlertDialog(
                    onDismissRequest = { showDeleteConfirmation = false },
                    title = { Text(if (isTemplateEvent) "Delete Template" else "Delete Event") },
                    text = {
                        Text(
                            if (isTemplateEvent) {
                                "Are you sure you want to delete this template? This action cannot be undone."
                            } else if (hasAnyPaidDivision) {
                                "Are you sure you want to delete this event? All participants will receive a full refund. This action cannot be undone."
                            } else {
                                "Are you sure you want to delete this event? This action cannot be undone."
                            }
                        )
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                component.deleteEvent()
                                showDeleteConfirmation = false
                            }, colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.error
                            )
                        ) {
                            Text("Delete")
                        }
                    },
                    dismissButton = {
                        Button(onClick = { showDeleteConfirmation = false }) {
                            Text("Cancel")
                        }
                    })
            }

            if (showNotifyDialog) {
                SendNotificationDialog(
                    onSend = component::sendNotification,
                    onSent = { showNotifyDialog = false },
                    onDismiss = { showNotifyDialog = false },
                )
            }

            if (showInviteTeamDialog) {
                EventTeamInviteDialog(
                    teams = inviteTeamSuggestions,
                    isLoading = inviteTeamsLoading,
                    selectedDivisionId = selectedDivision,
                    divisionOptions = splitRegistrationDivisionOptions,
                    onSearch = component::searchInviteTeams,
                    onDivisionSelected = component::selectDivision,
                    onTeamSelected = { team ->
                        component.inviteTeamToEvent(team)
                        component.searchInviteTeams("")
                        showInviteTeamDialog = false
                    },
                    onDismiss = {
                        component.searchInviteTeams("")
                        showInviteTeamDialog = false
                    },
                )
            }

            if (showInvitePlayerDialog) {
                EventPlayerInviteDialog(
                    eventName = selectedEvent.event.name,
                    suggestions = suggestedUsers,
                    existingParticipantIds = (
                        selectedEvent.event.playerIds +
                            selectedEvent.event.waitListIds +
                            selectedEvent.event.freeAgentIds
                        ).map(String::trim).filter(String::isNotBlank).toSet(),
                    onSearch = component::searchUsers,
                    onPlayerSelected = { user ->
                        component.invitePlayerToEvent(user)
                        component.searchUsers("")
                        showInvitePlayerDialog = false
                    },
                    onInviteByEmail = { firstName, lastName, email ->
                        component.invitePlayerToEventByEmail(firstName, lastName, email)
                        component.searchUsers("")
                        showInvitePlayerDialog = false
                    },
                    onDismiss = {
                        component.searchUsers("")
                        showInvitePlayerDialog = false
                    },
                )
            }

            if (showReportEventDialog) {
                AlertDialog(
                    onDismissRequest = { showReportEventDialog = false },
                    title = { Text("Report event") },
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("Report objectionable content or abusive behavior tied to this event.")
                            StandardTextField(
                                value = reportEventNotes,
                                onValueChange = { reportEventNotes = it },
                                modifier = Modifier.fillMaxWidth(),
                                label = "Notes (optional)",
                            )
                        }
                    },
                    confirmButton = {
                        TextButton(
                            onClick = {
                                component.reportEvent(reportEventNotes)
                                reportEventNotes = ""
                                showReportEventDialog = false
                            }
                        ) {
                            Text("Report")
                        }
                    },
                    dismissButton = {
                        TextButton(
                            onClick = {
                                reportEventNotes = ""
                                showReportEventDialog = false
                            }
                        ) {
                            Text("Cancel")
                        }
                    },
                )
            }

            if (showRefundReasonDialog) {
                RefundReasonDialog(
                    currentReason = refundReason,
                    onReasonChange = { refundReason = it },
                    onConfirm = {
                        component.requestRefund(
                            reason = refundReason,
                            targetUserId = selectedWithdrawalTarget?.userId,
                        )
                        showRefundReasonDialog = false
                        refundReason = ""
                        selectedWithdrawalTarget = null
                    },
                    onDismiss = {
                        showRefundReasonDialog = false
                        refundReason = ""
                        selectedWithdrawalTarget = null
                    })
            }

            textSignaturePrompt?.let { prompt ->
                TextSignatureDialog(
                    prompt = prompt,
                    onConfirm = component::confirmTextSignature,
                    onDismiss = component::dismissTextSignature,
                )
            }

            webSignaturePrompt?.let { prompt ->
                val signerLabel = prompt.step?.requiredSignerLabel
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                    ?.let { label -> "Required signer: $label" }
                val progressLabel = if (prompt.totalSteps > 1) {
                    "Document ${prompt.currentStep} of ${prompt.totalSteps}"
                } else {
                    null
                }
                val description = listOfNotNull(progressLabel, signerLabel).joinToString(" - ")

                EmbeddedWebModal(
                    title = prompt.step?.title ?: "Sign required document",
                    url = prompt.url,
                    description = description,
                    onDismiss = component::dismissWebSignaturePrompt,
                )
            }

            discountCodePrompt?.let { prompt ->
                DiscountCodeDialog(
                    title = prompt.title,
                    description = prompt.description,
                    initialCode = prompt.initialCode,
                    originalAmountCents = prompt.originalAmountCents,
                    preview = prompt.preview,
                    error = prompt.error,
                    loading = prompt.loading,
                    onApply = component::applyDiscountCodePrompt,
                    onCodeChange = { component.clearDiscountCodePromptFeedback() },
                    onContinue = component::continueFromDiscountCodePrompt,
                    onDismiss = component::dismissDiscountCodePrompt,
                )
            }

            billingAddressPrompt?.let { address ->
                BillingAddressDialog(
                    initialAddress = address,
                    onConfirm = component::submitBillingAddress,
                    onDismiss = component::dismissBillingAddressPrompt,
                )
            }
        }
    }
}
