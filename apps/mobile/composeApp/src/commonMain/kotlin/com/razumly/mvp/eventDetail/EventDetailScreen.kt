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
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.addOfficialPosition
import com.razumly.mvp.core.data.dataTypes.addOfficialUser
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.hasAnyPaidDivision
import com.razumly.mvp.core.data.dataTypes.removeOfficialPosition
import com.razumly.mvp.core.data.dataTypes.removeOfficialUser
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
import com.razumly.mvp.core.data.dataTypes.updateOfficialPosition
import com.razumly.mvp.core.data.dataTypes.updateOfficialUserPositions
import com.razumly.mvp.core.data.dataTypes.usesTeamOfficialScheduling
import com.razumly.mvp.core.data.dataTypes.withDoTeamsOfficiate
import com.razumly.mvp.core.data.dataTypes.withOfficialSchedulingMode
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.presentation.EventDetailInitialTab
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.PlayerInteractionComponent
import com.razumly.mvp.core.presentation.composables.PreparePaymentProcessor
import com.razumly.mvp.core.presentation.composables.PullToRefreshContainer
import com.razumly.mvp.core.presentation.util.CircularRevealUnderlay
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import dev.icerock.moko.geo.LatLng
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
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
    val accessPresentation = remember(
        selectedEvent,
        editedEvent,
        sports,
        currentUser,
        currentUserManagedEventTeamId,
        isHost,
        isEditingMatches,
    ) {
        buildEventDetailAccessPresentation(
            selectedEvent = selectedEvent,
            editedEvent = editedEvent,
            sports = sports,
            currentUser = currentUser,
            currentUserManagedEventTeamId = currentUserManagedEventTeamId,
            isHost = isHost,
            isEditingMatches = isEditingMatches,
        )
    }
    val isTemplateEvent = accessPresentation.isTemplateEvent
    val canShowQrCode = accessPresentation.canShowQrCode
    val eventType = accessPresentation.eventType
    val tournamentPoolPlayEnabled = accessPresentation.tournamentPoolPlayEnabled
    val hasBracketView = accessPresentation.hasBracketView
    val hasScheduleView = accessPresentation.hasScheduleView
    val hasStandingsView = accessPresentation.hasStandingsView
    val isAssistantHost = accessPresentation.isAssistantHost
    val isEventOfficial = accessPresentation.isEventOfficial
    val canManageTemplate = accessPresentation.canManageTemplate
    val canEditEventDetails = accessPresentation.canEditEventDetails
    val canDeleteEvent = accessPresentation.canDeleteEvent
    val canCreateTemplateFromCurrentEvent = accessPresentation.canCreateTemplateFromCurrentEvent
    val canManageLeagueStandings = accessPresentation.canManageLeagueStandings
    val showOfficialsPanel = accessPresentation.showOfficialsPanel
    val selectedSport = accessPresentation.selectedSport
    val showStandingsDrawColumn = accessPresentation.showStandingsDrawColumn
    val canConfirmLeagueResultsFromDock = accessPresentation.canConfirmLeagueResultsFromDock
    val canManageMatchEditingFromDock = accessPresentation.canManageMatchEditingFromDock
    val canEditMatches = accessPresentation.canEditMatches
    val showScheduleMatchManagement = accessPresentation.showScheduleMatchManagement
    val canManageParticipantsFromDock = accessPresentation.canManageParticipantsFromDock
    val showEventCheckInBadges = accessPresentation.showEventCheckInBadges
    val currentUserManagedEventTeam = accessPresentation.currentUserManagedEventTeam

    var showTeamSelectionDialog by remember { mutableStateOf(false) }
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
    val originalLocationPlace = editedEvent.toSelectedEventLocationPlace()
    val hasAnyPaidDivision = remember(
        selectedEvent.event.priceCents,
        selectedEvent.event.divisions,
        selectedEvent.event.divisionDetails,
    ) {
        selectedEvent.event.hasAnyPaidDivision()
    }

    val imageScheme = rememberEventDetailImageScheme(
        selectedEventSeedColor = selectedEvent.event.seedColor,
        editedEventSeedColor = editedEvent.seedColor,
        isEditing = isEditing,
        isDark = isDark,
    )

    val refundPolicy = getRefundPolicy(
        event = selectedEvent.event,
        effectiveStart = selectedWeeklyOccurrence?.sessionStart ?: selectedEvent.event.start,
    )
    val eventHasStarted = refundPolicy.eventHasStarted
    val weeklyPresentation = remember(
        selectedEvent,
        selectedWeeklyOccurrence,
        sports,
        eventHasStarted,
        isUserInEvent,
        isHost,
        isAssistantHost,
        isEventOfficial,
    ) {
        buildEventDetailWeeklyRoutePresentation(
            selectedEvent = selectedEvent,
            selectedWeeklyOccurrence = selectedWeeklyOccurrence,
            sports = sports,
            now = Clock.System.now(),
            eventHasStarted = eventHasStarted,
            isUserInEvent = isUserInEvent,
            isHost = isHost,
            isAssistantHost = isAssistantHost,
            isEventOfficial = isEventOfficial,
        )
    }
    val isWeeklyEvent = weeklyPresentation.isWeeklyEvent
    val selectedWeeklyOccurrenceStarted = weeklyPresentation.selectedWeeklyOccurrenceStarted
    val joinBlockedByStart = weeklyPresentation.joinBlockedByStart
    val hasDirectionsTarget = weeklyPresentation.hasDirectionsTarget
    val isWeeklyParentEvent = weeklyPresentation.isWeeklyParentEvent
    val weeklySessionOptions = weeklyPresentation.weeklySessionOptions
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
    val weeklyScheduleOptions = weeklyPresentation.weeklyScheduleOptions
    val weeklyScheduleOptionsById = weeklyPresentation.weeklyScheduleOptionsById
    val weeklyScheduleItems = weeklyPresentation.weeklyScheduleItems
    val teamSignup = weeklyPresentation.teamSignup
    val teamSelectionSportLabel = weeklyPresentation.teamSelectionSportLabel
    val withdrawalPresentation = remember(
        selectedEvent.event,
        withdrawTargets,
        refundPolicy,
        hasAnyPaidDivision,
        isUserInEvent,
        isCaptain,
        isFreeAgent,
        isWaitListed,
    ) {
        buildEventDetailWithdrawalPresentation(
            event = selectedEvent.event,
            withdrawTargets = withdrawTargets,
            refundPolicy = refundPolicy,
            hasAnyPaidDivision = hasAnyPaidDivision,
            isUserInEvent = isUserInEvent,
            isCaptain = isCaptain,
            isFreeAgent = isFreeAgent,
            isWaitListed = isWaitListed,
        )
    }
    val platformRefundsAvailable = withdrawalPresentation.platformRefundsAvailable
    val canRequestRefundAfterStart = withdrawalPresentation.canRequestRefundAfterStart
    val actionWithdrawTargets = withdrawalPresentation.actionWithdrawTargets
    val canLeaveEvent = withdrawalPresentation.canLeaveEvent
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
    val leaveOrRefundActionLabel = withdrawalPresentation.leaveOrRefundActionLabel
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
    val selectedWeeklyOccurrenceJoined = weeklyPresentation.selectedWeeklyOccurrenceJoined
    val isAffiliateEvent = weeklyPresentation.isAffiliateEvent
    val shouldShowViewSchedulePrimaryAction = weeklyPresentation.shouldShowViewSchedulePrimaryAction
    val showOverviewOpenDetailsAction = weeklyPresentation.showOverviewOpenDetailsAction
    val showStickyActions = !showDetails && !isEditing && !showMap && showStickyDockByScroll
    val isEventRefreshInProgress = eventTeamsAndParticipantsLoading || eventMatchesLoading
    val divisionPresentation = remember(
        selectedEvent,
        selectedDivision,
        selectedStandingsPoolDivisionId,
        tournamentPoolPlayEnabled,
        showStandingsDrawColumn,
        leagueDivisionStandings,
    ) {
        buildEventDetailDivisionPresentation(
            selectedEvent = selectedEvent,
            selectedDivision = selectedDivision,
            selectedStandingsPoolDivisionId = selectedStandingsPoolDivisionId,
            tournamentPoolPlayEnabled = tournamentPoolPlayEnabled,
            showStandingsDrawColumn = showStandingsDrawColumn,
            leagueDivisionStandings = leagueDivisionStandings,
        )
    }
    val joinDivisionOptions = divisionPresentation.joinDivisionOptions
    val leagueDivisionOptions = divisionPresentation.leagueDivisionOptions
    val registrationDivisionOptions = divisionPresentation.registrationDivisionOptions
    val registrationJoinDivisionOptions = divisionPresentation.registrationJoinDivisionOptions
    val splitRegistrationDivisionOptions = divisionPresentation.splitRegistrationDivisionOptions
    val playoffDivisionOptions = divisionPresentation.playoffDivisionOptions
    val selectedJoinDivisionId = divisionPresentation.selectedJoinDivisionId
    val tournamentBracketDivisionOptions = divisionPresentation.tournamentBracketDivisionOptions
    val selectedScheduleDivisionId = divisionPresentation.selectedScheduleDivisionId
    val schedulePoolDivisionOptions = divisionPresentation.schedulePoolDivisionOptions
    val standingsTabDivisionOptions = divisionPresentation.standingsTabDivisionOptions
    val selectedStandingsDivisionId = divisionPresentation.selectedStandingsDivisionId
    val standingsPoolDivisionOptions = divisionPresentation.standingsPoolDivisionOptions
    val selectedStandingsDataDivisionId = divisionPresentation.selectedStandingsDataDivisionId
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
    val leagueStandings = divisionPresentation.leagueStandings
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
    val joinPresentation = remember(
        selectedEvent.event,
        selectedDivision,
        selectedJoinOptionDivisionId,
        hasAnyPaidDivision,
        tournamentPoolPlayEnabled,
        isUserInEvent,
        selectedWeeklyOccurrenceJoined,
        isEventFull,
        joinBlockedByStart,
        isWeeklyParentEvent,
        selectedWeeklyOccurrence,
        isAffiliateEvent,
        isRegistrationPaymentFailed,
    ) {
        buildEventDetailJoinPresentation(
            event = selectedEvent.event,
            selectedDivision = selectedDivision,
            selectedJoinOptionDivisionId = selectedJoinOptionDivisionId,
            hasAnyPaidDivision = hasAnyPaidDivision,
            tournamentPoolPlayEnabled = tournamentPoolPlayEnabled,
            isUserInEvent = isUserInEvent,
            selectedWeeklyOccurrenceJoined = selectedWeeklyOccurrenceJoined,
            isEventFull = isEventFull,
            joinBlockedByStart = joinBlockedByStart,
            isWeeklyParentEvent = isWeeklyParentEvent,
            hasSelectedWeeklyOccurrence = selectedWeeklyOccurrence != null,
            isAffiliateEvent = isAffiliateEvent,
            isRegistrationPaymentFailed = isRegistrationPaymentFailed,
            onJoinEvent = component::joinEvent,
            onSelectTeam = { divisionId ->
                divisionId?.let(component::selectDivision)
                showTeamSelectionDialog = true
            },
        )
    }
    val joinOptions = joinPresentation.options
    val guideEventId = selectedEvent.event.id.trim()
    EventDetailOverviewGuideLifecycle(
        selectedEvent = selectedEvent,
        scheduleTrackedUserIds = scheduleTrackedUserIds,
        currentUserTeamIds = currentUser.teamIds,
        validTeams = validTeams,
        showDetails = showDetails,
        isEditing = isEditing,
        showMap = showMap,
        isUserInEvent = isUserInEvent,
        showStickyActions = showStickyActions,
    )

    EventDetailRouteLifecycleEffects(
        eventErrors = component.errorState,
        playerErrors = playerInteractionComponent.errorState,
        loadingHandler = loadingHandler,
        popupHandler = popupHandler,
        setEventLoadingHandler = component::setLoadingHandler,
        setPlayerLoadingHandler = playerInteractionComponent::setLoadingHandler,
        clearEventError = component::clearError,
        showDetails = showDetails,
        isEditing = isEditing,
        showMap = showMap,
        closeJoinOptions = { showJoinOptionsSheet = false },
        resetStickyDock = { showStickyDockByScroll = true },
        clearMapSelection = {
            pendingMapPlace = null
            isLocationPickerMapMode = false
        },
    )

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
                    originalPlace = originalLocationPlace,
                    selectedPlace = pendingMapPlace,
                    onPlaceSelectionCleared = {
                        pendingMapPlace = null
                    },
                    canClickPOI = isLocationPickerMapMode,
                    focusedLocation = when {
                        pendingMapPlace != null -> {
                            LatLng(pendingMapPlace!!.latitude, pendingMapPlace!!.longitude)
                        }
                        originalLocationPlace != null -> {
                            LatLng(originalLocationPlace.latitude, originalLocationPlace.longitude)
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
                        EventDetailTabsRouteHost(
                            state = EventDetailTabsRouteState(
                                initialTab = initialTab,
                                showDetails = showDetails,
                                isEditing = isEditing,
                                showMap = showMap,
                                guideEventId = guideEventId,
                                canStartGuide = isUserInEvent || isHost || isAssistantHost || isEventOfficial,
                                hasBracketView = hasBracketView,
                                hasScheduleView = hasScheduleView,
                                hasStandingsView = hasStandingsView,
                                selectedEvent = selectedEvent,
                                tournamentPoolPlayEnabled = tournamentPoolPlayEnabled,
                                tournamentBracketDivisionOptions = tournamentBracketDivisionOptions,
                                joinDivisionOptions = joinDivisionOptions,
                                leagueDivisionOptions = leagueDivisionOptions,
                                playoffDivisionOptions = playoffDivisionOptions,
                                selectedJoinDivisionId = selectedJoinDivisionId,
                                registrationDivisionOptions = registrationDivisionOptions,
                                registrationJoinDivisionOptions = registrationJoinDivisionOptions,
                                selectedDivisionId = selectedDivision,
                                selectedScheduleDivisionId = selectedScheduleDivisionId,
                                selectedSchedulePoolDivisionId = selectedSchedulePoolDivisionId,
                                schedulePoolDivisionOptions = schedulePoolDivisionOptions,
                                selectedStandingsDivisionId = selectedStandingsDivisionId,
                                selectedStandingsPoolDivisionId = selectedStandingsPoolDivisionId,
                                selectedStandingsDataDivisionId = selectedStandingsDataDivisionId,
                                standingsTabDivisionOptions = standingsTabDivisionOptions,
                                standingsPoolDivisionOptions = standingsPoolDivisionOptions,
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
                                leagueDivisionStandings = leagueDivisionStandings,
                                leagueStandings = leagueStandings,
                                showStandingsDrawColumn = showStandingsDrawColumn,
                                leagueStandingsConfirming = leagueStandingsConfirming,
                                canManageLeagueStandings = canManageLeagueStandings,
                                eventTeamsAndParticipantsLoading = eventTeamsAndParticipantsLoading,
                                canManageParticipantsFromDock = canManageParticipantsFromDock,
                                showEventCheckInBadges = showEventCheckInBadges,
                                participantDivisionWarnings = participantDivisionWarnings,
                                losersBracket = losersBracket,
                                canManageMatchEditingFromDock = canManageMatchEditingFromDock,
                                showScheduleMatchManagement = showScheduleMatchManagement,
                                canConfirmLeagueResultsFromDock = canConfirmLeagueResultsFromDock,
                                leagueDivisionStandingsLoading = leagueDivisionStandingsLoading,
                            ),
                            actions = EventDetailTabsRouteActions(
                                onSelectDivision = component::selectDivision,
                                onSchedulePoolSelected = { selectedSchedulePoolDivisionId = it },
                                onStandingsPoolSelected = { selectedStandingsPoolDivisionId = it },
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
                                onToggleLosersBracket = component::toggleLosersBracket,
                                onStartEditingMatches = component::startEditingMatches,
                                onCancelEditingMatches = component::cancelEditingMatches,
                                onCommitMatchChanges = component::commitMatchChanges,
                                onAddBracketMatch = component::addBracketMatch,
                                onAddScheduleMatch = component::addScheduleMatch,
                                onRequestStandingsConfirmation = { showStandingsConfirmDialog = true },
                                onManagingParticipantsChanged = { isManaging ->
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
