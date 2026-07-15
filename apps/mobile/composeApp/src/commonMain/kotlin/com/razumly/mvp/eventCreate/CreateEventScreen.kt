package com.razumly.mvp.eventCreate

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
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
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.addOfficialPosition
import com.razumly.mvp.core.data.dataTypes.removeOfficialPosition
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
import com.razumly.mvp.core.data.dataTypes.updateOfficialPosition
import com.razumly.mvp.core.data.dataTypes.updateOfficialUserPositions
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.withOfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.RegistrationQuestionDraft
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.NoScaffoldContentInsets
import com.razumly.mvp.core.presentation.composables.PreparePaymentProcessor
import com.razumly.mvp.core.presentation.composables.TermsConsentDialog
import com.razumly.mvp.core.presentation.util.backAnimation
import com.razumly.mvp.core.presentation.util.CircularRevealUnderlay
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventCreate.steps.Preview
import com.razumly.mvp.eventDetail.EventDetails
import com.razumly.mvp.eventDetail.toEventWithFullRelations
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import dev.icerock.moko.geo.LatLng

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
    var currentSetupPageId by rememberSaveable { mutableStateOf(EventCreateSetupPageId.FORMAT) }
    var completedSetupPageIds by remember { mutableStateOf(emptySet<EventCreateSetupPageId>()) }
    var setupChoices by remember { mutableStateOf(EventCreateSetupChoices()) }
    val defaultEvent by component.defaultEvent.collectAsState()
    val newEventState by component.newEventState.collectAsState()
    var simplePriceQuoteConfirmed by rememberSaveable(newEventState.id) {
        mutableStateOf(newEventState.priceCents <= 0)
    }
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
    val registrationQuestionDrafts by component.registrationQuestionDrafts.collectAsState()
    val suggestedUsers by component.suggestedUsers.collectAsState()
    val userSearchLoading by component.userSearchLoading.collectAsState()
    val pendingStaffInvites by component.pendingStaffInvites.collectAsState()
    val termsConsentState by component.termsConsentState.collectAsState()
    val termsConsentLoading by component.termsConsentLoading.collectAsState()
    val showMap by mapComponent.showMap.collectAsState()
    val isEditing = true
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

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
        component.errorState.collect { error ->
            if (error != null) {
                errorHandler.showPopup(error)
            }
        }
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

    val eventWithCreateRelations = remember(eventWithRelations, sports, leagueSlots) {
        eventWithRelations.copy(
            sport = sports.firstOrNull { it.id == newEventState.sportId },
            timeSlots = leagueSlots,
        )
    }
    val selectedSport = remember(sports, newEventState.sportId) {
        sports.firstOrNull { it.id == newEventState.sportId }
    }
    val setupPages = remember(
        newEventState,
        setupChoices,
        currentSetupPageId,
        completedSetupPageIds,
    ) {
        resolveEventCreateSetupPages(
            event = newEventState,
            choices = setupChoices,
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

    val onEventTypeSelected: (EventType) -> Unit = remember(component) {
        { selectedType ->
            val normalizedType = selectedType.takeIf { it in mobileCreateEventTypes() } ?: EventType.EVENT
            component.onTypeSelected(normalizedType)
        }
    }

    LaunchedEffect(newEventState.eventType) {
        if (newEventState.eventType !in mobileCreateEventTypes()) {
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
    val onUpdateOfficialSchedulingMode: (OfficialSchedulingMode) -> Unit =
        remember(component) {
            { mode ->
                component.updateEventField {
                    withOfficialSchedulingMode(mode)
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
    val actionBackEnabled = previousSimplePageId != null || !isEventInfoStep
    val actionPrimaryLabel = when {
        !isEventInfoStep -> "Create event"
        setupMode == EventCreateSetupMode.ADVANCED -> "Review"
        currentSetupPageId == EventCreateSetupPageId.REVIEW_PUBLISH -> "Create event"
        else -> "Continue"
    }

    fun handleCreateEventBack() {
        if (isEventInfoStep) {
            previousSimplePageId?.let { pageId -> currentSetupPageId = pageId }
        } else {
            component.previousStep()
        }
    }

    fun handleSimpleSetupPrimary() {
        if (!currentSetupPage.used) {
            currentSetupPage.controlledByPageId?.let { controllerPageId ->
                currentSetupPageId = controllerPageId
            } ?: nextUsedSetupPage(setupPages, currentSetupPageId)?.let { pageId ->
                currentSetupPageId = pageId
            }
            return
        }

        val isComplete = isSimpleSetupPageComplete(
            pageId = currentSetupPageId,
            event = newEventState,
            choices = setupChoices,
            priceQuoteConfirmed = simplePriceQuoteConfirmed,
            registrationQuestions = registrationQuestionDrafts,
        )
        if (!isComplete) {
            errorHandler.showPopup(
                simpleSetupPageError(
                    pageId = currentSetupPageId,
                    event = newEventState,
                    choices = setupChoices,
                    priceQuoteConfirmed = simplePriceQuoteConfirmed,
                    registrationQuestions = registrationQuestionDrafts,
                ),
            )
            return
        }

        if (currentSetupPageId == EventCreateSetupPageId.REVIEW_PUBLISH) {
            component.createEvent()
            return
        }

        completedSetupPageIds = completedSetupPageIds + currentSetupPageId
        nextUsedSetupPage(setupPages, currentSetupPageId)?.let { pageId ->
            currentSetupPageId = pageId
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
                            if (setupMode == EventCreateSetupMode.SIMPLE) {
                                EventCreateSimpleSetupPage(
                                    state = EventCreateSimpleSetupUiState(
                                        page = currentSetupPage,
                                        event = newEventState,
                                        choices = setupChoices,
                                        sports = sports,
                                        divisionTypeParameters = divisionTypeParameters,
                                        localFields = localFields,
                                        leagueTimeSlots = leagueSlots,
                                        registrationQuestions = registrationQuestionDrafts,
                                        pendingStaffInvites = pendingStaffInvites,
                                        leagueScoringConfig = leagueScoringConfig,
                                        suggestedUsers = suggestedUsers,
                                        userSearchLoading = userSearchLoading,
                                        useManualTimeSlots = useManualTimeSlots,
                                        priceQuoteConfirmed = simplePriceQuoteConfirmed,
                                    ),
                                    actions = EventCreateSimpleSetupUiActions(
                                        onEventTypeSelected = { selectedType ->
                                            completedSetupPageIds = emptySet()
                                            onEventTypeSelected(selectedType)
                                        },
                                        onEditEvent = onEditEvent,
                                        onSportSelected = { sportId ->
                                            onEditEvent {
                                                copy(
                                                    sportId = sportId.takeIf(String::isNotBlank),
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
                                        onChoicesChange = { choices ->
                                            if (setupChoices.useRegistrationQuestions && !choices.useRegistrationQuestions) {
                                                component.setRegistrationQuestionDrafts(emptyList())
                                            }
                                            setupChoices = choices
                                        },
                                        onUseManualTimeSlotsChange = component::setUseManualTimeSlots,
                                        onOpenLocationMap = {
                                            pendingMapPlace = null
                                            mapComponent.toggleMap()
                                        },
                                        onSelectFieldCount = component::selectFieldCount,
                                        onUpdateLocalFieldName = component::updateLocalFieldName,
                                        onAddLeagueTimeSlot = { slot ->
                                            val index = leagueSlots.size
                                            component.addLeagueTimeSlot()
                                            component.updateLeagueTimeSlot(index) { slot }
                                        },
                                        onUpdateLeagueTimeSlot = { index, slot ->
                                            component.updateLeagueTimeSlot(index) { slot }
                                        },
                                        onRemoveLeagueTimeSlot = component::removeLeagueTimeSlot,
                                        onLeagueScoringConfigChange = { updated ->
                                            component.updateLeagueScoringConfig { updated }
                                        },
                                        onRegistrationQuestionsChange = component::setRegistrationQuestionDrafts,
                                        onSearchUsers = onSearchUsers,
                                        onUpdateAssistantHostIds = onUpdateAssistantHostIds,
                                        onUpdateOfficialIds = { updatedIds ->
                                            val currentIds = (
                                                newEventState.officialIds +
                                                    newEventState.eventOfficials.map { official -> official.userId }
                                                ).toSet()
                                            (updatedIds.toSet() - currentIds).forEach(onAddOfficialId)
                                            (currentIds - updatedIds.toSet()).forEach(onRemoveOfficialId)
                                        },
                                        onUpdateOfficialSchedulingMode = onUpdateOfficialSchedulingMode,
                                        onUpdateDoTeamsOfficiate = onUpdateDoTeamsOfficiate,
                                        onUpdateTeamOfficialsMaySwap = onUpdateTeamOfficialsMaySwap,
                                        onUpdateTeamCheckInMode = onUpdateTeamCheckInMode,
                                        onUpdateTeamCheckInOpenMinutesBefore = onUpdateTeamCheckInOpenMinutesBefore,
                                        onUpdateAllowMatchRosterEdits = onUpdateAllowMatchRosterEdits,
                                        onUpdateAllowTemporaryMatchPlayers = onUpdateAllowTemporaryMatchPlayers,
                                        onLoadOfficialPositionDefaults = {
                                            component.updateEventField {
                                                syncOfficialStaffing(
                                                    sport = selectedSport,
                                                    replacePositionsWithSportDefaults = true,
                                                )
                                            }
                                        },
                                        onAddOfficialPosition = onAddOfficialPosition,
                                        onUpdateOfficialPositionName = onUpdateOfficialPositionName,
                                        onUpdateOfficialPositionCount = onUpdateOfficialPositionCount,
                                        onRemoveOfficialPosition = onRemoveOfficialPosition,
                                        onAddPendingStaffInvite = onAddPendingStaffInvite,
                                        onRemovePendingStaffInvite = onRemovePendingStaffInvite,
                                        onUpdateOfficialUserPositions = onUpdateOfficialUserPositions,
                                        onPriceQuoteConfirmationChange = { confirmed ->
                                            simplePriceQuoteConfirmed = confirmed
                                        },
                                        quoteInclusivePrice = component::quoteInclusivePrice,
                                        onOpenAdvanced = { setupMode = EventCreateSetupMode.ADVANCED },
                                    ),
                                    modifier = Modifier.fillMaxSize(),
                                )
                            } else {
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
                                                sportId = sportId.takeIf(String::isNotBlank),
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
                                    onUpdateOfficialSchedulingMode = onUpdateOfficialSchedulingMode,
                                    onLoadOfficialPositionDefaults = {
                                        onEditEvent {
                                            syncOfficialStaffing(
                                                sport = sports.firstOrNull { sport -> sport.id == sportId },
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
                                    joinButton = {},
                                )
                            }
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

private fun simpleSetupPageError(
    pageId: EventCreateSetupPageId,
    event: Event,
    choices: EventCreateSetupChoices,
    priceQuoteConfirmed: Boolean,
    registrationQuestions: List<RegistrationQuestionDraft>,
): String = when (pageId) {
    EventCreateSetupPageId.BASICS -> "Add an event name and select a sport before continuing."
    EventCreateSetupPageId.DIVISIONS -> "Add at least one division before continuing."
    EventCreateSetupPageId.SCHEDULE_LOCATION -> when {
        event.location.isBlank() || event.lat == 0.0 || event.long == 0.0 -> {
            "Select a mapped location before continuing."
        }
        !event.noFixedEndDateTime && event.end <= event.start -> "Choose an end time after the start time."
        else -> "Complete the schedule before continuing."
    }
    EventCreateSetupPageId.COMPETITION_RULES -> if (
        event.eventType == EventType.TOURNAMENT && event.includePlayoffs
    ) {
        buildValidationPopupMessage(
            simpleCompetitionRulesValidationErrors(event) +
                simpleTournamentPoolValidationErrors(event, requireCapacity = false),
        )
    } else {
        buildValidationPopupMessage(
            simpleCompetitionRulesValidationErrors(event) +
                if (event.includePlayoffs && (event.playoffTeamCount ?: 0) < 2) {
                    listOf("Choose at least two playoff teams.")
                } else {
                    emptyList()
                },
        )
    }
    EventCreateSetupPageId.WINNER_BRACKET_RULES ->
        buildValidationPopupMessage(
            simpleTournamentWinnerBracketValidationErrors(event) +
                simpleTournamentLoserBracketValidationErrors(event),
        )
    EventCreateSetupPageId.PRICING_REGISTRATION -> when {
        event.maxParticipants < 2 -> "Capacity must be at least 2."
        choices.paidRegistration && event.priceCents <= 0 -> "Enter a registration price."
        choices.paidRegistration && !priceQuoteConfirmed -> "Wait for the online price quote."
        else -> "Complete the registration settings before continuing."
    }
    EventCreateSetupPageId.QUESTIONS -> "Add at least one registration question before continuing."
    EventCreateSetupPageId.REVIEW_PUBLISH -> buildValidationPopupMessage(
        simpleSetupValidationErrors(event, choices, priceQuoteConfirmed, registrationQuestions),
    )
    else -> "Complete the required fields on this page before continuing."
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
