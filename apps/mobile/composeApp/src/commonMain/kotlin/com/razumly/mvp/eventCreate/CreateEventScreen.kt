@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventCreate

import com.razumly.mvp.schedule.PartialScheduleConfirmation
import androidx.compose.material3.MaterialTheme
import com.razumly.mvp.schedule.ScheduleProposalFailureDialog
import com.razumly.mvp.schedule.ScheduleProposalReviewPhase

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Scaffold
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.experimental.stack.ChildStack
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.materialkolor.PaletteStyle
import com.materialkolor.dynamiccolor.ColorSpec
import com.materialkolor.ktx.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.StaffingPriority
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.addOfficialPosition
import com.razumly.mvp.core.data.dataTypes.removeOfficialPosition
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
import com.razumly.mvp.core.data.dataTypes.updateOfficialPosition
import com.razumly.mvp.core.data.dataTypes.updateOfficialUserPositions
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.withStaffingPriority
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.NoScaffoldContentInsets
import com.razumly.mvp.core.presentation.composables.PreparePaymentProcessor
import com.razumly.mvp.core.presentation.composables.TermsConsentDialog
import com.razumly.mvp.core.presentation.util.backAnimation
import com.razumly.mvp.core.presentation.util.CircularRevealUnderlay
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventCreate.steps.Preview
import com.razumly.mvp.eventDetail.EventDetails
import com.razumly.mvp.eventDetail.toEventWithFullRelations
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.schedule.ScheduleDiagnosticsReview
import dev.icerock.moko.geo.LatLng
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

internal fun createEventPrimaryActionLabel(
    isEventInfoStep: Boolean,
    eventType: EventType,
    isAutomatedScheduling: Boolean = true,
    setupMode: EventCreateSetupMode,
    nextSimplePageId: EventCreateSetupPageId?,
): String = when {
    !isEventInfoStep && eventType == EventType.EVENT -> "Create"
    !isEventInfoStep && isAutomatedScheduling && (
        eventType == EventType.LEAGUE ||
            eventType == EventType.TOURNAMENT
        ) -> "Create event & build schedule"
    !isEventInfoStep -> "Create event"
    setupMode == EventCreateSetupMode.ADVANCED -> "Review"
    nextSimplePageId == null -> "Review"
    else -> "Continue"
}

@OptIn(ExperimentalDecomposeApi::class)
@Composable
fun CreateEventScreen(
    component: CreateEventComponent,
    mapComponent: MapComponent,
) {
    var canProceed by remember { mutableStateOf(false) }
    var validationErrors by remember { mutableStateOf<List<String>>(emptyList()) }
    var hasAttemptedEventSubmit by remember { mutableStateOf(false) }
    var mapRevealCenter by remember { mutableStateOf(Offset.Zero) }
    var pendingMapPlace by remember { mutableStateOf<MVPPlace?>(null) }
    var setupMode by rememberSaveable { mutableStateOf(EventCreateSetupMode.SIMPLE) }
    var currentSetupPageId by rememberSaveable { mutableStateOf(EventCreateSetupPageId.OPTIONS) }
    var completedSetupPageIds by remember { mutableStateOf(emptySet<EventCreateSetupPageId>()) }
    val defaultEvent by component.defaultEvent.collectAsState()
    val newEventState by component.newEventState.collectAsState()
    fun originalLocationPlace(): MVPPlace? {
        val lat = newEventState.lat
        val long = newEventState.long
        if (newEventState.location.isBlank() || (lat == 0.0 && long == 0.0)) return null
        return MVPPlace(
            name = newEventState.location,
            id = "__selected_event_location__",
            coordinates = listOf(long, lat),
            address = newEventState.address,
        )
    }
    val childStack by component.childStack.subscribeAsState()
    val eventImageUrls by component.eventImageUrls.collectAsState()
    val sports by component.sports.collectAsState()
    val eventTags by component.eventTags.collectAsState()
    val divisionTypeParameters by component.divisionTypeParameters.collectAsState()
    val organizationTemplates by component.organizationTemplates.collectAsState()
    val organizationTemplatesLoading by component.organizationTemplatesLoading.collectAsState()
    val organizationTemplatesError by component.organizationTemplatesError.collectAsState()
    val localFields by component.localFields.collectAsState()
    val leagueSlots by component.leagueSlots.collectAsState()
    val useManualTimeSlots by component.useManualTimeSlots.collectAsState()
    val availableRentalResources by component.availableRentalResources.collectAsState()
    val selectedRentalResourceIds by component.selectedRentalResourceIds.collectAsState()
    val leagueScoringConfig by component.leagueScoringConfig.collectAsState()
    val suggestedUsers by component.suggestedUsers.collectAsState()
    val pendingStaffInvites by component.pendingStaffInvites.collectAsState()
    val termsConsentState by component.termsConsentState.collectAsState()
    val isEditorReady by component.isEditorReady.collectAsState()
    val isTryoutAvailable by component.isTryoutAvailable.collectAsState()
    val editorBootstrapError by component.editorBootstrapError.collectAsState()
    val termsConsentLoading by component.termsConsentLoading.collectAsState()
    val scheduleProposalState by component.scheduleProposalState.collectAsState()
    val pendingScheduleProposal = scheduleProposalState.proposal
    val showMap by mapComponent.showMap.collectAsState()
    val isEditing = true
    val showOfficialsPanel = newEventState.eventType != EventType.TRYOUT
    val currentUser by component.currentUser.collectAsState()
    val isDark = isSystemInDarkTheme()
    val loadingHandler = LocalLoadingHandler.current
    val errorHandler = LocalPopupHandler.current

    PreparePaymentProcessor(component)

    if (!termsConsentState.accepted) {
        TermsConsentDialog(
            state = termsConsentState,
            loading = termsConsentLoading,
            onAccept = component::acceptTermsConsent,
            onDismiss = null,
            intro = "Creating an event in Bracket IQ requires agreement to the Terms and EULA.",
        )
    }

    pendingScheduleProposal?.proposal?.let { proposal ->
        val isStale = scheduleProposalState.phase == ScheduleProposalReviewPhase.STALE
        ScheduleProposalDialog(
            proposal = proposal,
            isStale = isStale,
            isBusy = scheduleProposalState.phase.isBusy,
            message = scheduleProposalState.message,
            confirmPartial = scheduleProposalState.phase == ScheduleProposalReviewPhase.CONFIRMING_PARTIAL,
            onAccept = component::acceptScheduleProposal,
            onRefresh = component::refreshScheduleProposal,
            onReject = component::rejectScheduleProposal,
            onReturnToSetup = component::returnToScheduleSetup,
        )
    }
    if (scheduleProposalState.phase == ScheduleProposalReviewPhase.FAILED ||
        (scheduleProposalState.phase == ScheduleProposalReviewPhase.REFRESHING && pendingScheduleProposal == null)
    ) {
        ScheduleProposalFailureDialog(
            message = scheduleProposalState.message ?: "Requesting a schedule proposal...",
            isBusy = scheduleProposalState.phase.isBusy,
            onRetry = component::createEvent,
            onReturnToSetup = component::returnToScheduleSetup,
        )
    }

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
        component.errorState.collect { error ->
            if (error != null) {
                errorHandler.showPopup(error)
            }
        }
    }
    if (!isEditorReady) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            if (editorBootstrapError == null) {
                CircularProgressIndicator()
            } else {
                Text(editorBootstrapError.orEmpty())
            }
        }
        return
    }

    var imageScheme by remember {
        mutableStateOf(
            DynamicScheme(
                seedColor = Color(newEventState.seedColor),
                isDark = isDark,
                specVersion = ColorSpec.SpecVersion.SPEC_2025,
                style = PaletteStyle.Neutral,
            )
        )
    }

    LaunchedEffect(newEventState) {
        imageScheme = DynamicScheme(
            seedColor = Color(newEventState.seedColor),
            isDark = isDark,
            specVersion = ColorSpec.SpecVersion.SPEC_2025,
            style = PaletteStyle.Neutral,
        )
    }

    LaunchedEffect(showMap) {
        if (!showMap) {
            pendingMapPlace = null
        }
    }

    val eventWithRelations = remember(defaultEvent, newEventState) {
        defaultEvent
            .toEventWithFullRelations(listOf(), listOf())
            .copy(event = newEventState)
    }

    val selectedSportId = newEventState.sportIds.firstOrNull()
    val eventWithCreateRelations = remember(eventWithRelations, sports, leagueSlots, selectedSportId) {
        eventWithRelations.copy(
            sport = sports.firstOrNull { it.id == selectedSportId },
            timeSlots = leagueSlots,
        )
    }
    val selectedSport = remember(sports, selectedSportId) {
        sports.firstOrNull { it.id == selectedSportId }
    }
    val setupPages = remember(
        newEventState,
        currentSetupPageId,
        completedSetupPageIds,
    ) {
        resolveEventCreateSetupPages(
            event = newEventState,
            currentPageId = currentSetupPageId,
            completedPageIds = completedSetupPageIds,
        )
    }
    val currentSetupPage = remember(setupPages, currentSetupPageId) {
        setupPages.first { page -> page.id == currentSetupPageId }
    }
    val usedSetupPages = remember(setupPages) { setupPages.filter(EventCreateSetupPage::used) }
    val currentUsedSetupPageIndex = remember(usedSetupPages, currentSetupPageId) {
        usedSetupPages.indexOfFirst { page -> page.id == currentSetupPageId }.coerceAtLeast(0)
    }

    val onEditEvent: (Event.() -> Event) -> Unit = remember(component) {
        { update ->
            component.updateEventField {
                update().applyCreateSelectionRules()
            }
        }
    }

    val onEditTournament: (Event.() -> Event) -> Unit = remember(component) {
        { update ->
            component.updateTournamentField {
                update().applyCreateSelectionRules()
            }
        }
    }

    val onEventTypeSelected: (EventType) -> Unit = remember(component, isTryoutAvailable) {
        { selectedType ->
            val normalizedType = selectedType.takeIf {
                it in mobileCreateEventTypes(isTryoutAvailable)
            } ?: EventType.EVENT
            component.onTypeSelected(normalizedType)
        }
    }

    LaunchedEffect(newEventState.eventType, isTryoutAvailable) {
        if (newEventState.eventType !in mobileCreateEventTypes(isTryoutAvailable)) {
            onEventTypeSelected(EventType.EVENT)
        }
    }
    val onUpdateHostId: (String) -> Unit = remember(component) { component::updateHostId }
    val onUpdateAssistantHostIds: (List<String>) -> Unit =
        remember(component) { component::updateAssistantHostIds }
    val onUpdateDoTeamsOfficiate: (Boolean) -> Unit = remember(component) { component::updateDoTeamsOfficiate }
    val onUpdateTeamOfficialsMaySwap: (Boolean) -> Unit =
        remember(component) { component::updateTeamOfficialsMaySwap }
    val onUpdateTeamCheckInMode = remember(component) {
        { mode: TeamCheckInMode ->
            component.updateEventField {
                copy(teamCheckInMode = if (teamSignup) mode else TeamCheckInMode.OFF)
            }
        }
    }
    val onUpdateTeamCheckInOpenMinutesBefore = remember(component) {
        { minutes: Int ->
            component.updateEventField {
                copy(teamCheckInOpenMinutesBefore = minutes.coerceAtLeast(0))
            }
        }
    }
    val onUpdateAllowMatchRosterEdits = remember(component) {
        { enabled: Boolean ->
            component.updateEventField {
                copy(
                    allowMatchRosterEdits = teamSignup && enabled,
                    allowTemporaryMatchPlayers = teamSignup && enabled && allowTemporaryMatchPlayers,
                )
            }
        }
    }
    val onUpdateAllowTemporaryMatchPlayers = remember(component) {
        { enabled: Boolean ->
            component.updateEventField {
                copy(allowTemporaryMatchPlayers = teamSignup && allowMatchRosterEdits && enabled)
            }
        }
    }
    val onAddOfficialId: (String) -> Unit = remember(component) { component::addOfficialId }
    val onRemoveOfficialId: (String) -> Unit = remember(component) { component::removeOfficialId }
    val onUpdateStaffingPriority: (StaffingPriority) -> Unit =
        remember(component) {
            { priority ->
                component.updateEventField {
                    withStaffingPriority(priority)
                }
            }
        }
    val onAddOfficialPosition: () -> Unit = remember(component, selectedSport) {
        {
            component.updateEventField {
                addOfficialPosition(sport = selectedSport)
            }
        }
    }
    val onUpdateOfficialPositionName: (String, String) -> Unit =
        remember(component, selectedSport) {
            { positionId, name ->
                component.updateEventField {
                    updateOfficialPosition(
                        positionId = positionId,
                        name = name,
                        sport = selectedSport,
                    )
                }
            }
        }
    val onUpdateOfficialPositionCount: (String, Int) -> Unit =
        remember(component, selectedSport) {
            { positionId, count ->
                component.updateEventField {
                    updateOfficialPosition(
                        positionId = positionId,
                        count = count,
                        sport = selectedSport,
                    )
                }
            }
        }
    val onRemoveOfficialPosition: (String) -> Unit = remember(component, selectedSport) {
        { positionId ->
            component.updateEventField {
                removeOfficialPosition(
                    positionId = positionId,
                    sport = selectedSport,
                )
            }
        }
    }
    val onUpdateOfficialUserPositions: (String, List<String>) -> Unit =
        remember(component, selectedSport) {
            { userId, positionIds ->
                component.updateEventField {
                    updateOfficialUserPositions(
                        userId = userId,
                        positionIds = positionIds,
                        sport = selectedSport,
                    )
                }
            }
        }
    val onSetPaymentPlansEnabled: (Boolean) -> Unit =
        remember(component) { component::setPaymentPlansEnabled }
    val onSetInstallmentCount: (Int) -> Unit = remember(component) { component::setInstallmentCount }
    val onUpdateInstallmentAmount: (Int, Int) -> Unit =
        remember(component) { component::updateInstallmentAmount }
    val onUpdateInstallmentDueDate: (Int, String) -> Unit =
        remember(component) { component::updateInstallmentDueDate }
    val onAddInstallmentRow: () -> Unit = remember(component) { component::addInstallmentRow }
    val onRemoveInstallmentRow: (Int) -> Unit = remember(component) { component::removeInstallmentRow }
    val onSearchUsers: (String) -> Unit = remember(component) { component::searchUsers }
    val onAddPendingStaffInvite:
        suspend (String, String, String, Set<com.razumly.mvp.eventDetail.EventStaffRole>) -> Result<Unit> =
        remember(component) { { firstName, lastName, email, roles ->
            component.addPendingStaffInvite(firstName, lastName, email, roles)
        } }
    val onRemovePendingStaffInvite:
        (String, com.razumly.mvp.eventDetail.EventStaffRole?) -> Unit =
        remember(component) { component::removePendingStaffInvite }

    val isEventInfoStep = childStack.active.instance == CreateEventComponent.Child.EventInfo
    val previousSimplePageId = if (setupMode == EventCreateSetupMode.SIMPLE && isEventInfoStep) {
        previousUsedSetupPage(setupPages, currentSetupPageId)
    } else {
        null
    }
    val nextSimplePageId = if (setupMode == EventCreateSetupMode.SIMPLE && isEventInfoStep) {
        nextUsedSetupPage(setupPages, currentSetupPageId)
    } else {
        null
    }
    val actionBackEnabled = previousSimplePageId != null || !isEventInfoStep
    val actionPrimaryLabel = createEventPrimaryActionLabel(
        isEventInfoStep = isEventInfoStep,
        eventType = newEventState.eventType,
        isAutomatedScheduling = newEventState.isAutomatedScheduling,
        setupMode = setupMode,
        nextSimplePageId = nextSimplePageId,
    )

    fun handleCreateEventBack() {
        if (isEventInfoStep) {
            previousSimplePageId?.let { pageId -> currentSetupPageId = pageId }
        } else {
            component.previousStep()
        }
    }

    fun handleSimpleSetupPrimary() {
        if (!currentSetupPage.used) {
            nextUsedSetupPage(setupPages, currentSetupPageId)?.let { pageId ->
                currentSetupPageId = pageId
            } ?: previousUsedSetupPage(setupPages, currentSetupPageId)?.let { pageId ->
                currentSetupPageId = pageId
            }
            return
        }

        val isComplete = isSimpleSetupPageComplete(
            pageId = currentSetupPageId,
            event = newEventState,
            leagueScoringConfig = leagueScoringConfig,
            selectedSport = selectedSport,
        )
        if (!isComplete) {
            hasAttemptedEventSubmit = true
            errorHandler.showPopup("Complete the required fields on this page before continuing.")
            return
        }

        completedSetupPageIds = completedSetupPageIds + currentSetupPageId
        if (nextSimplePageId != null) {
            val pageId = nextSimplePageId
            currentSetupPageId = pageId
        } else if (canProceed) {
            component.nextStep()
        } else {
            hasAttemptedEventSubmit = true
            errorHandler.showPopup(buildValidationPopupMessage(validationErrors))
        }
    }

    fun handleCreateEventPrimary() {
        when {
            !isEventInfoStep -> {
                if (canProceed) {
                    component.createEvent()
                } else {
                    hasAttemptedEventSubmit = true
                    errorHandler.showPopup(buildValidationPopupMessage(validationErrors))
                }
            }
            setupMode == EventCreateSetupMode.SIMPLE -> handleSimpleSetupPrimary()
            canProceed -> component.nextStep()
            else -> {
                hasAttemptedEventSubmit = true
                errorHandler.showPopup(buildValidationPopupMessage(validationErrors))
            }
        }
    }

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
                    mapComponent.toggleMap()
                },
                onPlaceSelected = { place ->
                    pendingMapPlace = place
                },
                onPlaceSelectionPoint = { x, y ->
                    mapRevealCenter = Offset(x, y)
                },
                selectionRequiresConfirmation = true,
                originalPlace = originalLocationPlace(),
                selectedPlace = pendingMapPlace,
                onPlaceSelectionCleared = {
                    pendingMapPlace = null
                },
                canClickPOI = true,
                focusedLocation = when {
                    pendingMapPlace != null -> {
                        LatLng(pendingMapPlace!!.latitude, pendingMapPlace!!.longitude)
                    }
                    originalLocationPlace() != null -> {
                        LatLng(originalLocationPlace()!!.latitude, originalLocationPlace()!!.longitude)
                    }
                    newEventState.location.isNotBlank() -> {
                        LatLng(newEventState.lat, newEventState.long)
                    }
                    else -> {
                        mapComponent.currentLocation.value ?: LatLng(0.0, 0.0)
                    }
                },
                focusedEvent = null,
                mapActionLabel = if (pendingMapPlace != null) {
                    "Select Location"
                } else {
                    "Close Map"
                },
                usePrimaryActionButton = pendingMapPlace != null,
                onBackPressed = {
                    pendingMapPlace?.let(component::selectPlace)
                    pendingMapPlace = null
                    mapComponent.toggleMap()
                },
            )
        },
    ) {
        Scaffold(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = LocalNavBarPadding.current.calculateBottomPadding()),
            contentWindowInsets = NoScaffoldContentInsets,
            topBar = {
                if (isEventInfoStep) {
                    EventCreateSetupHeader(
                        mode = setupMode,
                        currentPageLabel = currentSetupPage.id.label,
                        currentStep = currentUsedSetupPageIndex + 1,
                        totalSteps = usedSetupPages.size,
                        onModeChange = { mode -> setupMode = mode },
                    )
                }
            },
            bottomBar = {
                EventCreateActionBar(
                    backEnabled = actionBackEnabled,
                    primaryLabel = actionPrimaryLabel,
                    onBack = ::handleCreateEventBack,
                    onPrimary = ::handleCreateEventPrimary,
                )
            },
        ) { scaffoldPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(scaffoldPadding),
            ) {
                ChildStack(
                    stack = childStack,
                    animation = backAnimation(
                        backHandler = component.backHandler,
                        onBack = component::onBackClicked,
                    ),
                ) { child ->
                    when (child.instance) {
                        is CreateEventComponent.Child.EventInfo -> {
                            EventDetails(
                                    paymentProcessor = component,
                                    mapComponent = mapComponent,
                                    hostHasAccount = currentUser?.hasStripeAccount ?: false,
                                    eventWithRelations = eventWithCreateRelations,
                                    editEvent = newEventState,
                                    navPadding = PaddingValues(),
                                    includeStatusBarInsetInStickyHeaders = false,
                                    editView = isEditing,
                                    isNewEvent = true,
                                    showOfficialsPanel = showOfficialsPanel,
                                    tryoutAvailable = isTryoutAvailable,
                                    showValidationErrors = hasAttemptedEventSubmit,
                                    rentalTimeLocked = false,
                                    onAddCurrentUser = component::addUserToEvent,
                                    imageScheme = imageScheme,
                                    imageIds = eventImageUrls,
                                    sports = sports,
                                    eventTagOptions = eventTags,
                                    divisionTypeParameters = divisionTypeParameters,
                                    organizationTemplates = organizationTemplates,
                                    organizationTemplatesLoading = organizationTemplatesLoading,
                                    organizationTemplatesError = organizationTemplatesError,
                                    editableFields = localFields,
                                    leagueTimeSlots = leagueSlots,
                                    availableRentalResources = availableRentalResources,
                                    selectedRentalResourceIds = selectedRentalResourceIds,
                                    rentalResourceSelectionLocked = component.isRentalResourceSelectionLocked,
                                    onRentalResourceSelectionChange = component::setRentalResourceSelected,
                                    leagueScoringConfig = leagueScoringConfig,
                                    onHostCreateAccount = component::createAccount,
                                    onOpenLocationMap = {
                                        pendingMapPlace = null
                                        mapComponent.toggleMap()
                                    },
                                    onPlaceSelected = component::selectPlace,
                                    onEditEvent = onEditEvent,
                                    onEditTournament = onEditTournament,
                                    onEventTypeSelected = onEventTypeSelected,
                                    onSportSelected = { sportId ->
                                        onEditEvent {
                                            copy(
                                                sportIds = sportId.takeIf(String::isNotBlank)?.let(::listOf).orEmpty(),
                                                matchRulesOverride = null,
                                                resolvedMatchRules = null,
                                                usesSets = false,
                                                matchDurationMinutes = null,
                                                setDurationMinutes = null,
                                                setsPerMatch = null,
                                                pointsToVictory = emptyList(),
                                                winnerSetCount = 1,
                                                loserSetCount = 1,
                                                winnerBracketPointsToVictory = emptyList(),
                                                loserBracketPointsToVictory = emptyList(),
                                            )
                                        }
                                    },
                                    onSelectFieldCount = component::selectFieldCount,
                                    onUpdateLocalFieldName = component::updateLocalFieldName,
                                    onUpdateLocalFieldDivisions = component::updateLocalFieldDivisions,
                                    useManualTimeSlots = useManualTimeSlots,
                                    onUseManualTimeSlotsChange = component::setUseManualTimeSlots,
                                    onAddLeagueTimeSlot = component::addLeagueTimeSlot,
                                    onUpdateLeagueTimeSlot = { index, updated ->
                                        component.updateLeagueTimeSlot(index) { updated }
                                    },
                                    onRemoveLeagueTimeSlot = component::removeLeagueTimeSlot,
                                    onLeagueScoringConfigChange = { updated ->
                                        component.updateLeagueScoringConfig { updated }
                                    },
                                    pendingStaffInvites = pendingStaffInvites,
                                    userSuggestions = suggestedUsers,
                                    onSearchUsers = onSearchUsers,
                                    onAddPendingStaffInvite = onAddPendingStaffInvite,
                                    onRemovePendingStaffInvite = onRemovePendingStaffInvite,
                                    onUpdateHostId = onUpdateHostId,
                                    onUpdateAssistantHostIds = onUpdateAssistantHostIds,
                                    onUpdateDoTeamsOfficiate = onUpdateDoTeamsOfficiate,
                                    onUpdateTeamOfficialsMaySwap = onUpdateTeamOfficialsMaySwap,
                                    onUpdateTeamCheckInMode = onUpdateTeamCheckInMode,
                                    onUpdateTeamCheckInOpenMinutesBefore = onUpdateTeamCheckInOpenMinutesBefore,
                                    onUpdateAllowMatchRosterEdits = onUpdateAllowMatchRosterEdits,
                                    onUpdateAllowTemporaryMatchPlayers = onUpdateAllowTemporaryMatchPlayers,
                                    onAddOfficialId = onAddOfficialId,
                                    onRemoveOfficialId = onRemoveOfficialId,
                                    onUpdateStaffingPriority = onUpdateStaffingPriority,
                                    onLoadOfficialPositionDefaults = {
                                        onEditEvent {
                                            syncOfficialStaffing(
                                                sport = sports.firstOrNull { sport -> sport.id == selectedSportId },
                                                replacePositionsWithSportDefaults = true,
                                            )
                                        }
                                    },
                                    onAddOfficialPosition = onAddOfficialPosition,
                                    onUpdateOfficialPositionName = onUpdateOfficialPositionName,
                                    onUpdateOfficialPositionCount = onUpdateOfficialPositionCount,
                                    onRemoveOfficialPosition = onRemoveOfficialPosition,
                                    onUpdateOfficialUserPositions = onUpdateOfficialUserPositions,
                                    onSetPaymentPlansEnabled = onSetPaymentPlansEnabled,
                                    onSetInstallmentCount = onSetInstallmentCount,
                                    onUpdateInstallmentAmount = onUpdateInstallmentAmount,
                                    onUpdateInstallmentDueDate = onUpdateInstallmentDueDate,
                                    onAddInstallmentRow = onAddInstallmentRow,
                                    onRemoveInstallmentRow = onRemoveInstallmentRow,
                                    onUploadSelected = component::onUploadSelected,
                                    onDeleteImage = component::deleteImage,
                                    onMapRevealCenterChange = { center -> mapRevealCenter = center },
                                    onValidationChange = { isValid, errors ->
                                        canProceed = isValid
                                        validationErrors = errors
                                    },
                                    quoteInclusivePrice = component::quoteInclusivePrice,
                                    sectionVisibility = if (setupMode == EventCreateSetupMode.SIMPLE) {
                                        simpleSetupSectionVisibility(currentSetupPageId)
                                    } else {
                                        com.razumly.mvp.eventDetail.EventDetailsSectionVisibility.All
                                    },
                                    showSectionContainers = setupMode == EventCreateSetupMode.ADVANCED,
                                    useSimpleSectionContent = setupMode == EventCreateSetupMode.SIMPLE,
                                    contentScrollResetKey = if (setupMode == EventCreateSetupMode.SIMPLE) {
                                        "simple:$currentSetupPageId"
                                    } else {
                                        "advanced"
                                    },
                                    joinButton = {},

                                )
                        }

                        is CreateEventComponent.Child.Preview -> Preview(
                            modifier = Modifier.fillMaxSize(),
                            component = component,
                        )
                    }
                }
            }
        }
    }
}

@Composable
internal fun ScheduleProposalDialog(
    proposal: com.razumly.mvp.core.network.dto.EventEditorCreateProposalDto,
    isStale: Boolean = false,
    isBusy: Boolean = false,
    message: String? = null,
    confirmPartial: Boolean = false,
    onAccept: () -> Unit,
    onRefresh: () -> Unit = {},
    onReject: () -> Unit,
    onReturnToSetup: () -> Unit = onReject,
) {
    val schedule = proposal.scheduleOutcome
    if (confirmPartial) {
        PartialScheduleConfirmation(
            unscheduledMatchCount = schedule.unplacedMatchCount,
            onConfirm = onAccept,
            onDismiss = onReturnToSetup,
        )
        return
    }
    val graphEvent = proposal.graph.event
    val eventTimeZone = remember(proposal.snapshot.draft.basics.timeZone) {
        runCatching { TimeZone.of(proposal.snapshot.draft.basics.timeZone) }.getOrNull()
    }
    val teamNames = proposalTeamNames(graphEvent)
    val fieldNames = proposalFieldNames(graphEvent)
    val officialNames = proposalOfficialNames(graphEvent)
    val officialPositionNames = proposalOfficialPositionNames(graphEvent)
    val matchLabels = proposalMatchLabels(proposal.graph.matches)
    val assignedFields = proposal.graph.matches.count { match -> !match.fieldId.isNullOrBlank() }
    val assignedOfficials = proposal.graph.matches.sumOf { match ->
        val assignments = match.officialAssignments.orEmpty()
            .ifEmpty { match.officialIds.orEmpty() }
        val assignedHolderIds = assignments
            .flatMap { assignment ->
                listOfNotNull(assignment.userId, assignment.eventOfficialId)
            }
            .mapNotNull { it.trim().takeIf(String::isNotBlank) }
            .toSet()
        assignedHolderIds.size + listOfNotNull(match.officialId, match.teamOfficialId)
            .count { id ->
                id.trim().isNotBlank() && id !in assignedHolderIds
            }
    }
    val displayIssues = proposalDisplayIssues(
        proposal = proposal,
        eventTimeZone = eventTimeZone,
        teamNames = teamNames,
        fieldNames = fieldNames,
        officialNames = officialNames,
        officialPositionNames = officialPositionNames,
    )
    val displayErrors = displayIssues.errors
    val displayWarnings = displayIssues.warnings
    AlertDialog(
        onDismissRequest = { if (!isBusy) onReturnToSetup() },
        title = { Text("Review schedule proposal") },
        text = {
            Column(
                modifier = Modifier
                    .heightIn(max = 440.dp)
                    .verticalScroll(rememberScrollState()),
            ) {
                Text(proposal.snapshot.draft.basics.name)
                Text("Revision: ${proposal.proposalRevision}")
                message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Spacer(Modifier.height(8.dp))
                val isPartial = schedule.status ==
                    com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus.PARTIAL
                Text(
                    if (isPartial) {
                        "Incomplete schedule: ${schedule.placedMatchCount} placed, " +
                            "${schedule.unplacedMatchCount} unscheduled"
                    } else {
                        "Complete match graph: ${proposal.graph.matches.size} matches"
                    },
                )
                Text("Proposed schedule: ${schedule.matchCount} matches")
                Text("Resource assignments: $assignedFields")
                Text("Officiating assignments: $assignedOfficials")
                if (isPartial) {
                    Spacer(Modifier.height(8.dp))
                    Text("Unscheduled matches")
                    schedule.unscheduledMatches.forEach { unscheduled ->
                        Text(
                            "${unscheduled.id} (match ${unscheduled.matchId ?: "pending"}, " +
                                "phaseDivisionId ${unscheduled.phaseDivisionId}, " +
                                "phase ${unscheduled.phase}, " +
                                "sourceDivisionId ${unscheduled.sourceDivisionId ?: "none"})",
                        )
                    }
                    Text("Affected Competition Phases")
                    schedule.affectedCompetitionPhases.forEach { phase ->
                        Text(
                            "${phase.id}: ${phase.name} (${phase.phase}, " +
                                "sourceDivisionId ${phase.sourceDivisionId ?: "none"})",
                        )
                    }
                }
                ScheduleDiagnosticsReview(schedule.diagnostics)
                proposal.graph.matches.forEachIndexed { index, match ->
                    val team1 = match.team1Id?.let { teamNames[it] }
                        ?: if (match.team1Id == null) "TBD" else "Team unavailable"
                    val team2 = match.team2Id?.let { teamNames[it] }
                        ?: if (match.team2Id == null) "TBD" else "Team unavailable"
                    val field = match.fieldId?.let { fieldNames[it] }
                        ?: if (match.fieldId == null) {
                            "Unassigned Resource"
                        } else {
                            "Resource unavailable"
                        }
                    Text("Match ${match.matchId ?: index + 1}: $team1 vs $team2")
                    Text("Resource: $field")
                    Text(
                        "Time: ${
                            eventTimeZone?.let { timeZone ->
                                proposalMatchTime(match, timeZone)
                            } ?: "Time unavailable"
                        }",
                    )
                    val dependencies = buildList {
                        match.previousLeftId?.let { add("after ${matchLabels[it] ?: "unavailable match"}") }
                        match.previousRightId?.let { add("after ${matchLabels[it] ?: "unavailable match"}") }
                        match.winnerNextMatchId?.let { add("winner -> ${matchLabels[it] ?: "unavailable match"}") }
                        match.loserNextMatchId?.let { add("loser -> ${matchLabels[it] ?: "unavailable match"}") }
                    }
                    if (dependencies.isNotEmpty()) {
                        Text("  Depends on: ${dependencies.joinToString(", ")}")
                    }
                    val assignments = match.officialAssignments.orEmpty().ifEmpty {
                        match.officialIds.orEmpty()
                    }
                    val assignmentLabels = buildList {
                        assignments.forEach { assignment ->
                            val holderId = assignment.userId ?: assignment.eventOfficialId
                            val holder = holderId?.let { officialNames[it] }
                                ?: "Official unavailable"
                            val position = officialPositionNames[assignment.positionId]
                            val holderLabel = if (position != null) {
                                "$position (slot ${assignment.slotIndex})"
                            } else {
                                "Slot ${assignment.slotIndex}"
                            }
                            add("$holderLabel: $holder")
                        }
                        match.officialId?.let { officialId ->
                            add("Official: ${officialNames[officialId] ?: "Official unavailable"}")
                        }
                        match.teamOfficialId?.let { teamId ->
                            add("Team official: ${teamNames[teamId] ?: "Team unavailable"}")
                        }
                    }
                    if (assignmentLabels.isNotEmpty()) {
                        Text("  Officials: ${assignmentLabels.joinToString(", ")}")
                    }
                    }
                if (isStale) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "This schedule proposal is stale and cannot be accepted. " +
                            "Refresh to review the current proposal; your event setup is still here.",
                    )
                }
                if (displayErrors.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Text("Cannot accept: ${displayErrors.take(3).joinToString("; ")}")
                }
                displayWarnings.forEach { Text("Warning: $it") }
                if (schedule.warnings.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    schedule.warnings.forEach { warning ->
                        Text(warning.message)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    when {
                        isStale -> onRefresh()
                        else -> onAccept()
                    }
                },
                enabled = !isBusy && (isStale || displayErrors.isEmpty()),
            ) {
                Text(
                    if (isStale) {
                        "Refresh proposal"
                    } else if (schedule.status ==
                        com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus.PARTIAL
                    ) {
                        "Review partial acceptance"
                    } else {
                        "Accept and create"
                    },
                )
            }
        },
        dismissButton = {
            Column {
                TextButton(onClick = onReturnToSetup, enabled = !isBusy) { Text("Return to setup") }
                TextButton(onClick = onReject, enabled = !isBusy) { Text("Reject") }
            }
        },
    )
}

private fun proposalTeamNames(
    event: com.razumly.mvp.core.network.dto.EventApiDto,
): Map<String, String> = event.teams.mapNotNull { team ->
    team.id
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?.let { id ->
            team.name.trim().takeIf(String::isNotBlank)?.let { name -> id to name }
        }
}.toMap()

private fun proposalFieldNames(
    event: com.razumly.mvp.core.network.dto.EventApiDto,
): Map<String, String> = event.fields.mapNotNull { field ->
    field.id.trim()
        .takeIf(String::isNotBlank)
        ?.let { id ->
            field.name?.trim()?.takeIf(String::isNotBlank)?.let { name -> id to name }
        }
}.toMap()

private fun proposalUserDisplayName(
    user: com.razumly.mvp.core.network.dto.EventEditorProposalGraphUserDto,
): String? = listOf(user.firstName, user.lastName)
    .map(String::trim)
    .filter(String::isNotBlank)
    .joinToString(" ")
    .takeIf(String::isNotBlank)

private fun proposalOfficialNames(
    event: com.razumly.mvp.core.network.dto.EventApiDto,
): Map<String, String> {
    val userNames = event.officials.mapNotNull { user ->
        proposalUserDisplayName(user)?.let { name ->
            user.id.trim().takeIf(String::isNotBlank)?.let { it to name }
        }
    }.toMap()
    val eventOfficialNames = event.eventOfficials.orEmpty().mapNotNull { official ->
        userNames[official.userId]?.let { name ->
            official.id.trim().takeIf(String::isNotBlank)?.let { it to name }
        }
    }
    val playerNames = event.teams.orEmpty().flatMap { team ->
        team.players.orEmpty().mapNotNull { player ->
            proposalUserDisplayName(player)?.let { name ->
                player.id.trim().takeIf(String::isNotBlank)?.let { it to name }
            }
        }
    }.toMap()
    return playerNames + userNames + eventOfficialNames
}

private fun proposalPhaseSettingsForMatch(
    event: com.razumly.mvp.core.network.dto.EventApiDto,
    match: com.razumly.mvp.core.network.dto.MatchApiDto,
): com.razumly.mvp.core.data.dataTypes.DivisionPhaseSettingsMVP? {
    val division = (
        event.divisionDetails.orEmpty() + event.playoffDivisionDetails.orEmpty()
        ).firstOrNull { detail ->
        detail.id == match.division
            || detail.id == match.phaseDivisionId
            || detail.id == match.sourceDivisionId
    }
    val phase = match.phase?.trim()?.takeIf(String::isNotBlank) ?: return null
    return division?.phaseSettings?.entries
        ?.firstOrNull { (key) -> key.equals(phase, ignoreCase = true) }
        ?.value
}

private fun proposalOfficialPositionsForMatch(
    event: com.razumly.mvp.core.network.dto.EventApiDto,
    match: com.razumly.mvp.core.network.dto.MatchApiDto,
) = proposalPhaseSettingsForMatch(event, match)?.officialPositions
    ?: event.officialPositions.orEmpty()

private fun proposalOfficialPositionNames(
    event: com.razumly.mvp.core.network.dto.EventApiDto,
): Map<String, String> = (
    event.officialPositions.orEmpty()
        + event.divisionDetails.orEmpty().flatMap { detail ->
        detail.phaseSettings.values.flatMap { it.officialPositions.orEmpty() }
    }
        + event.playoffDivisionDetails.orEmpty().flatMap { detail ->
        detail.phaseSettings.values.flatMap { it.officialPositions.orEmpty() }
    }
    ).distinctBy { it.id }.mapNotNull { position ->
    position.id.trim()
        .takeIf(String::isNotBlank)
        ?.let { id ->
            position.name.trim().takeIf(String::isNotBlank)?.let { name -> id to name }
        }
    }.toMap()

private fun proposalMatchLabels(
    matches: List<com.razumly.mvp.core.network.dto.MatchApiDto>,
): Map<String, String> = matches.flatMapIndexed { index, match ->
    listOfNotNull(match.id, match.matchId?.toString())
        .map { it to "Match ${match.matchId ?: index + 1}" }
}.toMap()

@OptIn(ExperimentalTime::class)
private fun proposalMatchTime(
    match: com.razumly.mvp.core.network.dto.MatchApiDto,
    timeZone: TimeZone,
): String {
    fun format(value: String?): String? = value
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?.let { normalized ->
            runCatching { Instant.parse(normalized) }.getOrNull()
        }
        ?.toLocalDateTime(timeZone)
        ?.format(dateTimeFormat)

    val start = format(match.start) ?: return "Time pending"
    val end = format(match.end)
    return end?.let { "$start - $it" } ?: start
}

private data class ProposalDisplayIssues(
    val errors: List<String>,
    val warnings: List<String>,
)

private fun proposalDisplayIssues(
    proposal: com.razumly.mvp.core.network.dto.EventEditorCreateProposalDto,
    eventTimeZone: TimeZone?,
    teamNames: Map<String, String>,
    fieldNames: Map<String, String>,
    officialNames: Map<String, String>,
    officialPositionNames: Map<String, String>,
): ProposalDisplayIssues {
    val errors = mutableListOf<String>()
    val warnings = mutableListOf<String>()
    val matchKeys = proposal.graph.matches.flatMap { match ->
        listOfNotNull(match.id, match.matchId?.toString())
    }.toSet()
    if (proposal.graph.matches.isEmpty() && proposal.scheduleOutcome.matchCount > 0) {
        errors += "The proposal has no matches."
    }
    if (
        proposal.graph.matches.size != proposal.scheduleOutcome.matchCount
        || proposal.scheduleOutcome.matches.size != proposal.graph.matches.size
    ) {
        errors += "The proposal Match Graph count does not match its schedule."
    }
    if (eventTimeZone == null) {
        warnings += "The proposal time zone is unavailable."
    }
    val isPartial = proposal.scheduleOutcome.status ==
        com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus.PARTIAL
    proposal.graph.matches.forEachIndexed { index, match ->
        val matchLabel = "Match ${index + 1}"
        val isUnplaced = !match.placementState.orEmpty().trim().equals("PLACED", ignoreCase = true)
        val allowsUnplaced = isPartial && isUnplaced
        if (match.team1Id != null && !teamNames.containsKey(match.team1Id)) {
            errors += "$matchLabel has an unavailable first team."
        }
        if (match.team2Id != null && !teamNames.containsKey(match.team2Id)) {
            errors += "$matchLabel has an unavailable second team."
        }
        if (match.fieldId == null) {
            if (!allowsUnplaced) errors += "$matchLabel has no resource assignment."
        } else if (allowsUnplaced) {
            errors += "$matchLabel has an invalid resource assignment."
        } else if (!fieldNames.containsKey(match.fieldId)) {
            errors += "$matchLabel has an unavailable resource."
        }
        val time = eventTimeZone?.let { proposalMatchTime(match, it) }
        val hasRawTime = !match.start.isNullOrBlank() && !match.end.isNullOrBlank()
        if (allowsUnplaced) {
            if (match.start != null || match.end != null) {
                errors += "$matchLabel has an invalid time assignment."
            }
        } else if (!hasRawTime || (eventTimeZone != null && time == "Time pending")) {
            errors += "$matchLabel has no proposed time."
        }
        if (isUnplaced && !allowsUnplaced) {
            errors += "$matchLabel is not placed."
        }
        val phaseSettings = proposalPhaseSettingsForMatch(proposal.graph.event, match)
        val assignments = match.officialAssignments.orEmpty().ifEmpty { match.officialIds.orEmpty() }
        if (allowsUnplaced) {
            if (assignments.isNotEmpty() || match.officialId != null || match.teamOfficialId != null) {
                errors += "$matchLabel has invalid officiating assignments."
            }
        } else {
            val configuredPositions = phaseSettings?.officialPositions
                ?: proposal.graph.event.officialPositions.orEmpty()
            configuredPositions.forEach { position ->
                repeat(position.count) { slotIndex ->
                    val assignment = assignments.firstOrNull {
                        it.positionId == position.id && it.slotIndex == slotIndex
                    }
                    val holderId = assignment?.userId?.trim()?.takeIf(String::isNotBlank)
                        ?: assignment?.eventOfficialId?.trim()?.takeIf(String::isNotBlank)
                    if (holderId == null) warnings += "$matchLabel has an unassigned officiating slot."
                }
            }
            assignments.forEach { assignment ->
                if (!officialPositionNames.containsKey(assignment.positionId)) {
                    errors += "$matchLabel has an unavailable officiating position."
                }
                val holderId = assignment.userId?.trim()?.takeIf(String::isNotBlank)
                    ?: assignment.eventOfficialId?.trim()?.takeIf(String::isNotBlank)
                if (holderId == null) {
                    warnings += "$matchLabel has an unassigned officiating slot."
                } else if (!officialNames.containsKey(holderId)) {
                    errors += "$matchLabel has an unavailable official."
                }
            }
            match.officialId?.let { officialId ->
                if (!officialNames.containsKey(officialId)) errors += "$matchLabel has an unavailable official."
            }
            val requiresTeamOfficial =
                phaseSettings?.doTeamsOfficiate ?: proposal.graph.event.doTeamsOfficiate == true
            if (requiresTeamOfficial && match.teamOfficialId.isNullOrBlank()) {
                warnings += "$matchLabel has no proposed team official."
            } else {
                match.teamOfficialId?.let { teamId ->
                    if (!teamNames.containsKey(teamId)) errors += "$matchLabel has an unavailable team official."
                }
            }
        }
        listOf(match.previousLeftId, match.previousRightId, match.winnerNextMatchId, match.loserNextMatchId)
            .filterNotNull().forEach { link ->
                if (link !in matchKeys) errors += "$matchLabel has an unresolved Match Graph link."
            }
    }
    return ProposalDisplayIssues(
        errors = errors.distinct(),
        warnings = warnings.distinct(),
    )
}

private fun buildValidationPopupMessage(errors: List<String>): String {
    if (errors.isEmpty()) {
        return "Please fix the highlighted fields."
    }
    if (errors.size == 1) {
        return errors.first()
    }
    val shown = errors.take(3)
    val remaining = errors.size - shown.size
    val suffix = if (remaining > 0) " +$remaining more" else ""
    return "Fix: ${shown.joinToString("; ")}$suffix"
}
