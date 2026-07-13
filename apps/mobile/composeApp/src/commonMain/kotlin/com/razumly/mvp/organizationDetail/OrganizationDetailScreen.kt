package com.razumly.mvp.organizationDetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.background
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.evergreenDateDisplayLabel
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.data.dataTypes.canUsePaidBilling
import com.razumly.mvp.core.data.repositories.RentalOrderSelectionRequest
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.UserVisibilityContext
import com.razumly.mvp.core.presentation.LockedRentalSelection
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.OrganizationDetailTab
import com.razumly.mvp.core.presentation.RentalCreateContext
import com.razumly.mvp.core.presentation.composables.BillingAddressDialog
import com.razumly.mvp.core.presentation.composables.DiscountCodeDialog
import com.razumly.mvp.core.presentation.composables.EmbeddedWebModal
import com.razumly.mvp.core.presentation.composables.EventCard
import com.razumly.mvp.core.presentation.composables.NetworkAvatar
import com.razumly.mvp.core.presentation.composables.PreparePaymentProcessor
import com.razumly.mvp.core.presentation.composables.TeamDetailsDialog
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.util.resolvedTimeZone
import com.razumly.mvp.core.util.toTimeZoneOrUtc
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventDetail.TextSignatureDialog
import com.razumly.mvp.eventSearch.RentalConfirmationContent
import com.razumly.mvp.eventSearch.RentalDetailsContent
import com.razumly.mvp.eventSearch.RentalDetailsStep
import com.razumly.mvp.eventSearch.RentalSelectionDraft
import com.razumly.mvp.eventSearch.ResolvedRentalSelection
import com.razumly.mvp.eventSearch.SLOT_INTERVAL_MINUTES
import com.razumly.mvp.eventSearch.canApplyRentalSelectionRange
import com.razumly.mvp.eventSearch.displayLabel
import com.razumly.mvp.eventSearch.isRentalIntervalInPast
import com.razumly.mvp.eventSearch.isRangeCoveredByRentalAvailability
import com.razumly.mvp.eventSearch.isRentalSelectionValidForAvailabilitySnapshot
import com.razumly.mvp.eventSearch.rangeOverlapsBusyBlockOnDate
import com.razumly.mvp.eventSearch.rangesOverlap
import com.razumly.mvp.eventSearch.rentalAvailabilityFetchWindowForDate
import com.razumly.mvp.eventSearch.resolveRentalSelection
import com.razumly.mvp.eventSearch.resolvedRentalTimeZone
import com.razumly.mvp.eventSearch.toRentalDayIndex
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import kotlinx.coroutines.flow.flowOf
import kotlin.time.Clock
import org.koin.mp.KoinPlatform.getKoin

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrganizationDetailScreen(component: OrganizationDetailComponent) {
    PreparePaymentProcessor(component)

    val popupHandler = LocalPopupHandler.current
    val loadingHandler = LocalLoadingHandler.current

    val organization by component.organization.collectAsState()
    val selectedTab by component.selectedTab.collectAsState()
    val visibleTabs by component.visibleTabs.collectAsState()
    val events by component.events.collectAsState()
    val teams by component.teams.collectAsState()
    val products by component.products.collectAsState()
    val reviews by component.reviews.collectAsState()
    val startingProductCheckoutId by component.startingProductCheckoutId.collectAsState()
    val rentalFieldOptions by component.rentalFieldOptions.collectAsState()
    val rentalBusyBlocks by component.rentalBusyBlocks.collectAsState()
    val loadedRentalAvailabilityWindow by component.loadedRentalAvailabilityWindow.collectAsState()
    val isLoadingOrganization by component.isLoadingOrganization.collectAsState()
    val isLoadingEvents by component.isLoadingEvents.collectAsState()
    val isLoadingTeams by component.isLoadingTeams.collectAsState()
    val canLoadMoreEvents by component.canLoadMoreEvents.collectAsState()
    val canLoadMoreTeams by component.canLoadMoreTeams.collectAsState()
    val isLoadingMoreEvents by component.isLoadingMoreEvents.collectAsState()
    val isLoadingMoreTeams by component.isLoadingMoreTeams.collectAsState()
    val isLoadingProducts by component.isLoadingProducts.collectAsState()
    val isLoadingReviews by component.isLoadingReviews.collectAsState()
    val isMutatingReview by component.isMutatingReview.collectAsState()
    val reviewSaveStatus by component.reviewSaveStatus.collectAsState()
    val isLoadingRentals by component.isLoadingRentals.collectAsState()
    val billingAddressPrompt by component.billingAddressPrompt.collectAsState()
    val currentUser by component.currentUser.collectAsState()
    val startingTeamRegistrationId by component.startingTeamRegistrationId.collectAsState()
    val teamMemberCompliance by component.teamMemberCompliance.collectAsState()
    val loadingTeamMemberComplianceId by component.loadingTeamMemberComplianceId.collectAsState()
    val textSignaturePrompt by component.textSignaturePrompt.collectAsState()
    val webSignaturePrompt by component.webSignaturePrompt.collectAsState()
    val discountCodePrompt by component.discountCodePrompt.collectAsState()
    val isReservingRental by component.isReservingRental.collectAsState()
    val completedRentalReservation by component.completedRentalReservation.collectAsState()

    var selectedTeam by remember { mutableStateOf<TeamWithPlayers?>(null) }
    var teamDialogKnownUsers by remember { mutableStateOf<Map<String, UserData>>(emptyMap()) }
    val teamRepository = remember {
        getKoin().get<ITeamRepository>()
    }
    val userRepository = remember {
        getKoin().get<IUserRepository>()
    }
    val selectedTeamFlow = remember(selectedTeam?.team?.id) {
        selectedTeam?.team?.id
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let { teamId -> teamRepository.getTeamsFlow(listOf(teamId)) }
            ?: flowOf(Result.success(emptyList()))
    }
    val selectedTeamResult by selectedTeamFlow.collectAsState(
        initial = Result.success(selectedTeam?.let(::listOf) ?: emptyList()),
    )
    val selectedTeamForDialog = selectedTeamResult.getOrNull()?.firstOrNull() ?: selectedTeam

    val fallbackTimeZone = remember { TimeZone.currentSystemDefault() }
    val timeZone = remember(rentalFieldOptions, fallbackTimeZone) {
        rentalFieldOptions.firstOrNull()?.resolvedRentalTimeZone(fallbackTimeZone) ?: fallbackTimeZone
    }
    val today = remember(timeZone) { Clock.System.now().toLocalDateTime(timeZone).date }
    var selectedRentalDate by remember { mutableStateOf(today) }
    val rentalAvailabilityWindow = remember(selectedRentalDate, timeZone) {
        rentalAvailabilityFetchWindowForDate(selectedRentalDate, timeZone)
    }
    val isRentalAvailabilityCurrent = loadedRentalAvailabilityWindow == rentalAvailabilityWindow
    var rentalSelections by remember { mutableStateOf<List<RentalSelectionDraft>>(emptyList()) }
    var nextRentalSelectionId by remember { mutableStateOf(1L) }
    var rentalDetailsStep by remember { mutableStateOf(RentalDetailsStep.BUILDER) }

    val resolvedSelections = remember(rentalSelections, rentalFieldOptions, timeZone) {
        rentalSelections.mapNotNull { selection ->
            resolveRentalSelection(
                selection = selection,
                fieldOptions = rentalFieldOptions,
                timeZone = timeZone,
            )
        }
    }
    val validResolvedSelections = remember(
        resolvedSelections,
        loadedRentalAvailabilityWindow,
        rentalBusyBlocks,
    ) {
        resolvedSelections.filter { selection ->
            isRentalSelectionValidForAvailabilitySnapshot(
                fieldId = selection.field.id,
                start = selection.startInstant,
                end = selection.endInstant,
                availabilityWindow = loadedRentalAvailabilityWindow,
                busyBlocks = rentalBusyBlocks,
            )
        }
    }
    val invalidSelectionCount = remember(rentalSelections, validResolvedSelections) {
        rentalSelections.size - validResolvedSelections.size
    }
    val totalRentalPriceCents = remember(validResolvedSelections) {
        validResolvedSelections.sumOf { resolved -> resolved.totalPriceCents }
    }
    val selectedFieldIdsForCreate = remember(validResolvedSelections) {
        validResolvedSelections.map { resolved -> resolved.field.id }.distinct()
    }
    val organizationFieldIdsForCreate = remember(rentalFieldOptions, selectedFieldIdsForCreate) {
        val fromOptions = rentalFieldOptions
            .map { option -> option.field.id }
            .filter { fieldId -> fieldId.isNotBlank() }
            .distinct()
        if (fromOptions.isNotEmpty()) {
            fromOptions
        } else {
            selectedFieldIdsForCreate
        }
    }
    val selectedTimeSlotIdsForCreate = remember(validResolvedSelections) {
        validResolvedSelections.flatMap { resolved -> resolved.slots.map { slot -> slot.id } }.distinct()
    }
    val lockedSelectionsForCreate = remember(validResolvedSelections) {
        validResolvedSelections.map { resolved ->
            LockedRentalSelection(
                fieldId = resolved.field.id,
                fieldName = resolved.field.displayLabel(),
                facilityId = resolved.field.facilityId
                    ?.trim()
                    ?.takeIf(String::isNotEmpty)
                    ?: resolved.field.facility
                        ?.resolvedId
                        ?.trim()
                        ?.takeIf(String::isNotEmpty),
                facilityName = resolved.field.facility
                    ?.name
                    ?.trim()
                    ?.takeIf(String::isNotEmpty),
                facilityLocation = resolved.field.facility
                    ?.location
                    ?.trim()
                    ?.takeIf(String::isNotEmpty)
                    ?: resolved.field.facility
                        ?.address
                        ?.trim()
                        ?.takeIf(String::isNotEmpty),
                sourceTimeSlotIds = resolved.slots
                    .map { slot -> slot.id }
                    .distinct(),
                requiredTemplateIds = resolved.slots
                    .flatMap { slot ->
                        slot.requiredTemplateIds
                            .map { templateId -> templateId.trim() }
                            .filter { templateId -> templateId.isNotEmpty() }
                    }
                    .distinct(),
                hostRequiredTemplateIds = resolved.slots
                    .flatMap { slot ->
                        slot.hostRequiredTemplateIds
                            .map { templateId -> templateId.trim() }
                            .filter { templateId -> templateId.isNotEmpty() }
                    }
                    .distinct(),
                startEpochMillis = resolved.startInstant.toEpochMilliseconds(),
                endEpochMillis = resolved.endInstant.toEpochMilliseconds(),
            )
        }
    }
    val selectedParticipantTemplateIdsForCreate = remember(validResolvedSelections) {
        validResolvedSelections
            .flatMap { resolved ->
                resolved.slots.flatMap { slot ->
                    slot.requiredTemplateIds
                        .map { templateId -> templateId.trim() }
                        .filter { templateId -> templateId.isNotEmpty() }
                }
            }
            .distinct()
    }
    val selectedHostTemplateIdsForCreate = remember(validResolvedSelections) {
        validResolvedSelections
            .flatMap { resolved ->
                resolved.slots.flatMap { slot ->
                    slot.hostRequiredTemplateIds
                        .map { templateId -> templateId.trim() }
                        .filter { templateId -> templateId.isNotEmpty() }
                }
            }
            .distinct()
    }
    val rentalStartInstant = remember(validResolvedSelections) {
        validResolvedSelections.minOfOrNull { resolved -> resolved.startInstant }
    }
    val rentalEndInstant = remember(validResolvedSelections) {
        validResolvedSelections.maxOfOrNull { resolved -> resolved.endInstant }
    }
    val organizationCanReserveRentals = organization?.let { org ->
        !org.publicSlug.isNullOrBlank() && org.publicPageEnabled
    } == true
    val canGoToConfirmation = isRentalAvailabilityCurrent &&
        !isLoadingRentals &&
        validResolvedSelections.isNotEmpty() &&
        invalidSelectionCount == 0
    val canContinueRental = organizationCanReserveRentals &&
        isRentalAvailabilityCurrent &&
        !isLoadingRentals &&
        rentalStartInstant != null &&
        rentalEndInstant != null &&
        selectedFieldIdsForCreate.isNotEmpty() &&
        selectedTimeSlotIdsForCreate.isNotEmpty() &&
        invalidSelectionCount == 0 &&
        !isReservingRental
    val rentalValidationMessage = when {
        organization == null -> "Organization is not available."
        !organizationCanReserveRentals -> "This organization needs a public rental checkout before resources can be reserved."
        isLoadingRentals -> "Loading resources and rental slots..."
        !isRentalAvailabilityCurrent -> "Availability could not be loaded for this week. Try again."
        rentalFieldOptions.isEmpty() -> "No resources are configured for this organization."
        rentalSelections.isEmpty() -> "Tap any available 30-minute cell to add a rental selection."
        invalidSelectionCount > 0 -> "One or more selections are outside loaded availability or overlap an unavailable time."
        else -> null
    }

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
        component.errorState.collect { error ->
            if (error != null) {
                popupHandler.showPopup(error)
            }
        }
    }

    LaunchedEffect(Unit) {
        component.message.collect { message ->
            if (!message.isNullOrBlank()) {
                popupHandler.showPopup(com.razumly.mvp.core.util.ErrorMessage(message))
            }
        }
    }

    LaunchedEffect(
        selectedTab,
        organization?.id,
        rentalAvailabilityWindow.start,
        rentalAvailabilityWindow.end,
    ) {
        if (selectedTab == OrganizationDetailTab.RENTALS && organization != null) {
            component.refreshRentals(
                rangeStart = rentalAvailabilityWindow.start,
                rangeEnd = rentalAvailabilityWindow.end,
                force = true,
            )
        }
    }

    LaunchedEffect(rentalAvailabilityWindow.start, rentalAvailabilityWindow.end) {
        rentalSelections = emptyList()
        rentalDetailsStep = RentalDetailsStep.BUILDER
        nextRentalSelectionId = 1L
    }

    LaunchedEffect(selectedTab) {
        if (selectedTab != OrganizationDetailTab.RENTALS) {
            rentalSelections = emptyList()
            rentalDetailsStep = RentalDetailsStep.BUILDER
            selectedRentalDate = today
            nextRentalSelectionId = 1L
        }
    }

    LaunchedEffect(visibleTabs, selectedTab) {
        if (selectedTab !in visibleTabs) {
            component.selectTab(OrganizationDetailTab.OVERVIEW)
        }
    }

    LaunchedEffect(selectedTeamForDialog?.team?.id, currentUser.id) {
        val team = selectedTeamForDialog
        if (team == null) {
            teamDialogKnownUsers = emptyMap()
            return@LaunchedEffect
        }

        val baseKnownUsers = (
            team.players +
                team.pendingPlayers +
                listOfNotNull(team.captain, currentUser)
            )
            .distinctBy(UserData::id)
            .associateBy(UserData::id)
        teamDialogKnownUsers = baseKnownUsers
        component.loadTeamMemberCompliance(team.team.id)

        val missingRoleIds = buildSet {
            val syncedTeam = team.team.withSynchronizedMembership()
            syncedTeam.captainId.takeIf(String::isNotBlank)?.let(::add)
            syncedTeam.staffAssignments.forEach { assignment ->
                assignment.userId.trim().takeIf(String::isNotBlank)?.let(::add)
            }
        }.filterNot(baseKnownUsers::containsKey)

        if (missingRoleIds.isEmpty()) return@LaunchedEffect

        userRepository.getUsers(
            userIds = missingRoleIds,
            visibilityContext = UserVisibilityContext(teamId = team.team.id),
        ).onSuccess { loadedUsers ->
            teamDialogKnownUsers = (baseKnownUsers.values + loadedUsers)
                .distinctBy(UserData::id)
                .associateBy(UserData::id)
        }
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    if (selectedTab == OrganizationDetailTab.OVERVIEW) {
                        val organizationName = organization?.name?.ifBlank { "Organization" } ?: "Organization"
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            NetworkAvatar(
                                displayName = organizationName,
                                imageRef = organization?.logoId,
                                size = 30.dp,
                                contentDescription = "$organizationName logo",
                            )
                            Text(
                                text = organizationName,
                                modifier = Modifier.widthIn(max = 190.dp),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    } else {
                        Text(
                            text = selectedTab.label(),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = component::onBackClicked) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { innerPadding ->
        val navPadding = LocalNavBarPadding.current
        val bottomPadding = navPadding.calculateBottomPadding().coerceAtLeast(12.dp)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when (selectedTab) {
                OrganizationDetailTab.OVERVIEW -> {
                    OverviewTabContent(
                        organization = organization,
                        events = events,
                        teams = teams,
                        products = products,
                        rentalFieldOptions = rentalFieldOptions,
                        visibleTabs = visibleTabs,
                        isLoading = isLoadingOrganization,
                        reviewPayload = reviews,
                        isLoadingReviews = isLoadingReviews,
                        bottomPadding = bottomPadding,
                        onEventClick = component::viewEvent,
                        onTeamClick = { team -> selectedTeam = team },
                        onOpenSection = component::selectTab,
                    )
                }

                OrganizationDetailTab.REVIEWS -> {
                    OrganizationReviewsTabContent(
                        payload = reviews,
                        isLoading = isLoadingReviews,
                        isMutating = isMutatingReview,
                        reviewSaveStatus = reviewSaveStatus,
                        bottomPadding = bottomPadding,
                        onRefresh = { component.refreshReviews(force = true) },
                        onSave = component::saveReview,
                        onDelete = component::deleteReview,
                        onReport = component::reportReview,
                        onSignIn = component::signInToReview,
                    )
                }

                OrganizationDetailTab.EVENTS -> {
                    EventsTabContent(
                        events = events,
                        isLoading = isLoadingEvents,
                        canLoadMore = canLoadMoreEvents,
                        isLoadingMore = isLoadingMoreEvents,
                        bottomPadding = bottomPadding,
                        organizationLogoId = organization?.logoId,
                        onEventClick = component::viewEvent,
                        onLoadMore = component::loadMoreEvents,
                    )
                }

                OrganizationDetailTab.TEAMS -> {
                    TeamsTabContent(
                        teams = teams,
                        isLoading = isLoadingTeams,
                        canLoadMore = canLoadMoreTeams,
                        isLoadingMore = isLoadingMoreTeams,
                        bottomPadding = bottomPadding,
                        onTeamClick = { team -> selectedTeam = team },
                        onLoadMore = component::loadMoreTeams,
                    )
                }

                OrganizationDetailTab.RENTALS -> {
                    val currentOrganization = organization
                    val completedReservation = completedRentalReservation
                    if (currentOrganization == null) {
                        EmptyState(message = "Organization is not available.")
                    } else if (completedReservation != null) {
                        RentalReservationCompleteContent(
                            organization = currentOrganization,
                            reservation = completedReservation,
                            bottomPadding = bottomPadding,
                            onCreateEventNow = component::createEventFromCompletedRentalReservation,
                            onAttachLater = {
                                component.dismissCompletedRentalReservation()
                                rentalSelections = emptyList()
                                rentalDetailsStep = RentalDetailsStep.BUILDER
                                nextRentalSelectionId = 1L
                            },
                        )
                    } else if (rentalDetailsStep == RentalDetailsStep.BUILDER) {
                        val selectionsForCurrentDate = remember(rentalSelections, selectedRentalDate) {
                            rentalSelections.filter { selection -> selection.date == selectedRentalDate }
                        }
                        RentalDetailsContent(
                            selectedDate = selectedRentalDate,
                            fieldOptions = rentalFieldOptions,
                            busyBlocks = rentalBusyBlocks,
                            selectionsForSelectedDate = selectionsForCurrentDate,
                            allSelectionCount = rentalSelections.size,
                            totalPriceCents = totalRentalPriceCents,
                            isLoadingFields = isLoadingRentals,
                            isAvailabilityInteractive = isRentalAvailabilityCurrent && !isLoadingRentals,
                            bottomPadding = bottomPadding,
                            canGoNext = canGoToConfirmation,
                            validationMessage = rentalValidationMessage,
                            onSelectedDateChange = { selectedDate ->
                                selectedRentalDate = selectedDate
                            },
                            onCreateSelection = { fieldId, startMinutes ->
                                if (!isRentalAvailabilityCurrent || isLoadingRentals) {
                                    return@RentalDetailsContent
                                }
                                val endMinutes = startMinutes + SLOT_INTERVAL_MINUTES
                                val fieldOption = rentalFieldOptions.firstOrNull { option ->
                                    option.field.id == fieldId
                                }
                                val fieldTimeZone = fieldOption?.resolvedRentalTimeZone(timeZone) ?: timeZone
                                val overlapsSelection = rentalSelections.any { selection ->
                                    selection.fieldId == fieldId &&
                                        selection.date == selectedRentalDate &&
                                        rangesOverlap(
                                            selection.startMinutes,
                                            selection.endMinutes,
                                            startMinutes,
                                            endMinutes,
                                        )
                                }
                                val overlapsBusyBlock = rentalBusyBlocks.any { block ->
                                    block.fieldId == fieldId &&
                                        rangeOverlapsBusyBlockOnDate(
                                            block = block,
                                            date = selectedRentalDate,
                                            startMinutes = startMinutes,
                                            endMinutes = endMinutes,
                                            timeZone = fieldTimeZone,
                                        )
                                }
                                val isWithinRentalAvailability = fieldOption != null &&
                                    isRangeCoveredByRentalAvailability(
                                        option = fieldOption,
                                        date = selectedRentalDate,
                                        startMinutes = startMinutes,
                                        endMinutes = endMinutes,
                                        timeZone = fieldTimeZone,
                                    )
                                val isPastRentalInterval = isRentalIntervalInPast(
                                    date = selectedRentalDate,
                                    startMinutes = startMinutes,
                                    endMinutes = endMinutes,
                                    timeZone = fieldTimeZone,
                                )

                                if (!overlapsSelection && !overlapsBusyBlock && isWithinRentalAvailability && !isPastRentalInterval) {
                                    rentalSelections = rentalSelections + RentalSelectionDraft(
                                        id = nextRentalSelectionId,
                                        fieldId = fieldId,
                                        date = selectedRentalDate,
                                        startMinutes = startMinutes,
                                        endMinutes = endMinutes,
                                    )
                                    nextRentalSelectionId += 1L
                                }
                            },
                            onCanUpdateSelection = { selectionId, startMinutes, endMinutes ->
                                if (!isRentalAvailabilityCurrent || isLoadingRentals) {
                                    return@RentalDetailsContent false
                                }
                                val targetSelection = rentalSelections.firstOrNull { selection ->
                                    selection.id == selectionId
                                } ?: return@RentalDetailsContent false

                                canApplyRentalSelectionRange(
                                    selectionId = selectionId,
                                    fieldId = targetSelection.fieldId,
                                    date = targetSelection.date,
                                    startMinutes = startMinutes,
                                    endMinutes = endMinutes,
                                    selections = rentalSelections,
                                    fieldOptions = rentalFieldOptions,
                                    busyBlocks = rentalBusyBlocks,
                                    timeZone = timeZone,
                                )
                            },
                            onUpdateSelection = { selectionId, startMinutes, endMinutes ->
                                if (!isRentalAvailabilityCurrent || isLoadingRentals) {
                                    return@RentalDetailsContent false
                                }
                                val targetSelection = rentalSelections.firstOrNull { selection ->
                                    selection.id == selectionId
                                }
                                if (targetSelection == null) return@RentalDetailsContent false

                                if (!canApplyRentalSelectionRange(
                                        selectionId = selectionId,
                                        fieldId = targetSelection.fieldId,
                                        date = targetSelection.date,
                                        startMinutes = startMinutes,
                                        endMinutes = endMinutes,
                                        selections = rentalSelections,
                                        fieldOptions = rentalFieldOptions,
                                        busyBlocks = rentalBusyBlocks,
                                        timeZone = timeZone,
                                    )
                                ) {
                                    return@RentalDetailsContent false
                                }

                                rentalSelections = rentalSelections.map { selection ->
                                    if (selection.id == selectionId) {
                                        selection.copy(startMinutes = startMinutes, endMinutes = endMinutes)
                                    } else {
                                        selection
                                    }
                                }
                                true
                            },
                            onDeleteSelection = { selectionId ->
                                rentalSelections = rentalSelections.filterNot { it.id == selectionId }
                            },
                            onNext = {
                                if (canGoToConfirmation) {
                                    rentalDetailsStep = RentalDetailsStep.CONFIRMATION
                                }
                            }
                        )
                    } else {
                        RentalConfirmationContent(
                            organization = currentOrganization,
                            selections = validResolvedSelections,
                            totalPriceCents = totalRentalPriceCents,
                            topPadding = 0.dp,
                            bottomPadding = bottomPadding,
                            validationMessage = rentalValidationMessage,
                            canContinue = canContinueRental,
                            isSubmitting = isReservingRental,
                            onBack = { rentalDetailsStep = RentalDetailsStep.BUILDER },
                            onContinue = {
                                if (!canContinueRental) return@RentalConfirmationContent
                                val start = rentalStartInstant
                                val end = rentalEndInstant
                                component.startRentalReservation(
                                    RentalCreateContext(
                                        organizationId = currentOrganization.id,
                                        organizationName = currentOrganization.name,
                                        organizationLocation = currentOrganization.location,
                                        organizationAddress = currentOrganization.address,
                                        organizationCoordinates = currentOrganization.coordinates,
                                        organizationFieldIds = organizationFieldIdsForCreate,
                                        selectedFieldIds = selectedFieldIdsForCreate,
                                        selectedTimeSlotIds = selectedTimeSlotIdsForCreate,
                                        lockedSelections = lockedSelectionsForCreate,
                                        participantRequiredTemplateIds = selectedParticipantTemplateIdsForCreate,
                                        hostRequiredTemplateIds = selectedHostTemplateIdsForCreate,
                                        rentalPriceCents = totalRentalPriceCents,
                                        startEpochMillis = start.toEpochMilliseconds(),
                                        endEpochMillis = end.toEpochMilliseconds(),
                                    ),
                                    buildRentalOrderSelectionRequests(validResolvedSelections),
                                )
                            }
                        )
                    }
                }

                OrganizationDetailTab.STORE -> {
                    StoreTabContent(
                        organization = organization,
                        products = products,
                        startingProductCheckoutId = startingProductCheckoutId,
                        isLoading = isLoadingProducts,
                        bottomPadding = bottomPadding,
                        onPurchase = component::startProductPurchase,
                    )
                }
            }
        }

        selectedTeamForDialog?.let { team ->
            TeamDetailsDialog(
                team = team,
                currentUser = currentUser,
                knownUsers = teamDialogKnownUsers.values.toList(),
                memberCompliance = teamMemberCompliance[team.team.id],
                memberComplianceLoading = loadingTeamMemberComplianceId == team.team.id,
                onDismiss = { selectedTeam = null },
                onPlayerMessage = {},
                isRegistering = startingTeamRegistrationId == team.team.id,
                onRegisterForTeam = { component.startTeamRegistration(team) },
                onLeaveTeam = { component.leaveTeam(team) },
            )
        }
    }

    billingAddressPrompt?.let { address ->
        BillingAddressDialog(
            initialAddress = address,
            onConfirm = component::submitBillingAddress,
            onDismiss = component::dismissBillingAddressPrompt,
        )
    }

    discountCodePrompt?.let { prompt ->
        DiscountCodeDialog(
            title = prompt.title,
            description = prompt.description,
            initialCode = prompt.initialCode,
            onContinue = component::continueFromDiscountCodePrompt,
            onDismiss = component::dismissDiscountCodePrompt,
        )
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
}

private fun OrganizationDetailTab.label(): String {
    return when (this) {
        OrganizationDetailTab.OVERVIEW -> "Overview"
        OrganizationDetailTab.REVIEWS -> "Reviews"
        OrganizationDetailTab.EVENTS -> "Events"
        OrganizationDetailTab.TEAMS -> "Teams"
        OrganizationDetailTab.RENTALS -> "Rentals"
        OrganizationDetailTab.STORE -> "Store"
    }
}

private fun Product.isSinglePurchase(): Boolean =
    period.trim().equals("SINGLE", ignoreCase = true)

private fun Product.periodLabel(): String {
    return when {
        isSinglePurchase() -> "Single purchase"
        period.trim().equals("WEEK", ignoreCase = true) -> "Weekly"
        period.trim().equals("YEAR", ignoreCase = true) -> "Yearly"
        else -> "Monthly"
    }
}

private fun Product.priceLabel(): String {
    val formattedPrice = (priceCents / 100.0).moneyFormat()
    return if (isSinglePurchase()) {
        formattedPrice
    } else {
        val suffix = when {
            period.trim().equals("WEEK", ignoreCase = true) -> "week"
            period.trim().equals("YEAR", ignoreCase = true) -> "year"
            else -> "month"
        }
        "$formattedPrice / $suffix"
    }
}

private fun buildRentalOrderSelectionRequests(
    selections: List<ResolvedRentalSelection>,
): List<RentalOrderSelectionRequest> {
    return selections.mapIndexedNotNull { index, resolved ->
        val fieldId = resolved.field.id.trim().takeIf(String::isNotBlank) ?: return@mapIndexedNotNull null
        val selectionTimeZone = resolved.slots
            .firstOrNull()
            ?.timeZone
            .toTimeZoneOrUtc(TimeZone.currentSystemDefault())
        val startLocal = resolved.startInstant.toLocalDateTime(selectionTimeZone)
        val endLocal = resolved.endInstant.toLocalDateTime(selectionTimeZone)
        val dayIndex = startLocal.dayOfWeek.toRentalDayIndex()
        val startMinutes = startLocal.hour * 60 + startLocal.minute
        val endMinutes = if (
            endLocal.date > startLocal.date &&
            endLocal.hour == 0 &&
            endLocal.minute == 0
        ) {
            24 * 60
        } else {
            endLocal.hour * 60 + endLocal.minute
        }

        RentalOrderSelectionRequest(
            key = "mobile_${index + 1}",
            scheduledFieldIds = listOf(fieldId),
            dayOfWeek = dayIndex,
            daysOfWeek = listOf(dayIndex),
            startTimeMinutes = startMinutes,
            endTimeMinutes = endMinutes,
            startDate = resolved.startInstant.toString(),
            endDate = resolved.endInstant.toString(),
            timeZone = selectionTimeZone.id,
            repeating = false,
        )
    }
}

private fun Product.purchaseButtonLabel(): String =
    if (isSinglePurchase()) "Buy now" else "Subscribe"

private fun listTabPadding(bottomPadding: androidx.compose.ui.unit.Dp): PaddingValues =
    PaddingValues(
        start = 16.dp,
        top = 16.dp,
        end = 16.dp,
        bottom = 16.dp + bottomPadding,
    )

@Composable
private fun OverviewTabContent(
    organization: Organization?,
    events: List<Event>,
    teams: List<TeamWithPlayers>,
    products: List<Product>,
    rentalFieldOptions: List<com.razumly.mvp.eventSearch.RentalFieldOption>,
    visibleTabs: List<OrganizationDetailTab>,
    isLoading: Boolean,
    reviewPayload: com.razumly.mvp.core.data.dataTypes.OrganizationReviewsPayload?,
    isLoadingReviews: Boolean,
    bottomPadding: androidx.compose.ui.unit.Dp,
    onEventClick: (Event) -> Unit,
    onTeamClick: (TeamWithPlayers) -> Unit,
    onOpenSection: (OrganizationDetailTab) -> Unit,
) {
    val scrollState = rememberScrollState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(horizontal = 16.dp, vertical = 16.dp)
            .padding(bottom = bottomPadding),
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        if (isLoading) {
            Text(text = "Loading organization...", style = MaterialTheme.typography.bodyMedium)
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OrganizationOverviewSectionHeader(
                title = "About",
                actionContent = {
                    OrganizationReviewRatingAction(
                        payload = reviewPayload,
                        isLoading = isLoadingReviews,
                        onClick = { onOpenSection(OrganizationDetailTab.REVIEWS) },
                    )
                },
            )
            Text(
                text = organization?.description?.ifBlank { "No description" } ?: "No description",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            organization?.location?.takeIf { it.isNotBlank() }?.let { location ->
                Spacer(modifier = Modifier.height(8.dp))
                Text(text = location, style = MaterialTheme.typography.bodySmall)
            }
            organization?.website?.takeIf { it.isNotBlank() }?.let { website ->
                Spacer(modifier = Modifier.height(4.dp))
                Text(text = website, style = MaterialTheme.typography.bodySmall)
            }
        }

        if (OrganizationDetailTab.EVENTS in visibleTabs) {
            OrganizationOverviewPreviewSection(
                title = "Events",
                onMore = { onOpenSection(OrganizationDetailTab.EVENTS) },
            ) {
                androidx.compose.foundation.lazy.LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(events.take(6), key = Event::id) { event ->
                        CompactOrganizationEventCard(
                            event = event,
                            fallbackImageId = organization?.logoId,
                            onClick = { onEventClick(event) },
                        )
                    }
                }
            }
        }

        if (OrganizationDetailTab.TEAMS in visibleTabs) {
            OrganizationOverviewPreviewSection(
                title = "Teams",
                onMore = { onOpenSection(OrganizationDetailTab.TEAMS) },
            ) {
                androidx.compose.foundation.lazy.LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(teams.take(6), key = { team -> team.team.id }) { team ->
                        Card(
                            modifier = Modifier.width(280.dp),
                            shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                            ),
                            onClick = { onTeamClick(team) },
                        ) {
                            TeamCard(team = team, modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
            }
        }

        if (OrganizationDetailTab.RENTALS in visibleTabs) {
            OrganizationOverviewPreviewSection(
                title = "Rentals",
                onMore = { onOpenSection(OrganizationDetailTab.RENTALS) },
            ) {
                androidx.compose.foundation.lazy.LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(rentalFieldOptions.take(6), key = { option -> option.field.id }) { option ->
                        RentalFieldPreviewCard(
                            option = option,
                            onClick = { onOpenSection(OrganizationDetailTab.RENTALS) },
                        )
                    }
                }
            }
        }

        if (OrganizationDetailTab.STORE in visibleTabs) {
            OrganizationOverviewPreviewSection(
                title = "Store",
                onMore = { onOpenSection(OrganizationDetailTab.STORE) },
            ) {
                androidx.compose.foundation.lazy.LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(products.take(6), key = Product::id) { product ->
                        ProductPreviewCard(
                            product = product,
                            onClick = { onOpenSection(OrganizationDetailTab.STORE) },
                        )
                    }
                }
            }
        }

        OrganizationReviewsPreviewSection(
            payload = reviewPayload,
            isLoading = isLoadingReviews,
            onViewReviews = { onOpenSection(OrganizationDetailTab.REVIEWS) },
        )
    }
}

@Composable
internal fun OrganizationOverviewSectionHeader(
    title: String,
    onMore: (() -> Unit)? = null,
    actionContent: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
        )
        if (actionContent != null) {
            actionContent()
        } else if (onMore != null) {
            TextButton(onClick = onMore) {
                Text("More")
            }
        }
    }
}

@Composable
private fun OrganizationOverviewPreviewSection(
    title: String,
    onMore: () -> Unit,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OrganizationOverviewSectionHeader(title = title, onMore = onMore)
        content()
    }
}

@Composable
private fun CompactOrganizationEventCard(
    event: Event,
    fallbackImageId: String?,
    onClick: () -> Unit,
) {
    val eventTimeZone = remember(event.timeZone) { event.resolvedTimeZone() }
    val dateLabel = remember(event.start, event.scheduleText, event.dateDisplayMode, event.dateDisplayText) {
        event.evergreenDateDisplayLabel()
            ?: event.start.toLocalDateTime(eventTimeZone).date.format(dateFormat)
    }
    val imageUrl = remember(event.imageId, fallbackImageId) {
        (event.imageId.trim().takeIf(String::isNotBlank)
            ?: fallbackImageId?.trim()?.takeIf(String::isNotBlank))
            ?.let { imageId -> getImageUrl(fileId = imageId, width = 320, height = 240) }
    }

    Card(
        modifier = Modifier
            .width(300.dp)
            .height(112.dp),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        onClick = onClick,
    ) {
        Row(modifier = Modifier.fillMaxSize()) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(104.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                if (imageUrl == null) {
                    Text(
                        text = "Event",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    coil3.compose.AsyncImage(
                        model = imageUrl,
                        contentDescription = "${event.name} image",
                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
            Column(
                modifier = Modifier
                    .fillMaxHeight()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = event.name.ifBlank { "Event" },
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                event.location.trim().takeIf(String::isNotBlank)?.let { location ->
                    Text(
                        text = location,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = dateLabel,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun RentalFieldPreviewCard(
    option: com.razumly.mvp.eventSearch.RentalFieldOption,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .width(240.dp)
            .height(104.dp),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        onClick = onClick,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(14.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = option.field.displayLabel(),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${option.rentalSlots.size} available ${if (option.rentalSlots.size == 1) "window" else "windows"}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun ProductPreviewCard(
    product: Product,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .width(240.dp)
            .height(104.dp),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        onClick = onClick,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(14.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = product.name,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = product.priceLabel(),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun EventsTabContent(
    events: List<Event>,
    isLoading: Boolean,
    canLoadMore: Boolean,
    isLoadingMore: Boolean,
    bottomPadding: androidx.compose.ui.unit.Dp,
    organizationLogoId: String?,
    onEventClick: (Event) -> Unit,
    onLoadMore: () -> Unit,
) {
    if (isLoading && events.isEmpty()) {
        EmptyState(message = "Loading events...")
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = listTabPadding(bottomPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (events.isEmpty()) {
            item {
                EmptyState(message = "No events yet.")
            }
        } else {
            items(events, key = { event -> event.id }) { event ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth(),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    EventCard(
                        event = event,
                        navPadding = PaddingValues(bottom = 16.dp),
                        fallbackImageId = organizationLogoId,
                        onClick = { onEventClick(event) },
                        onMapClick = { }
                    )
                }
            }
            if (canLoadMore) {
                item(key = "load-more-events") {
                    OutlinedButton(
                        onClick = onLoadMore,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !isLoadingMore && !isLoading,
                    ) {
                        Text(if (isLoadingMore) "Loading more…" else "Load more events")
                    }
                }
            }
        }
    }
}

@Composable
private fun TeamsTabContent(
    teams: List<TeamWithPlayers>,
    isLoading: Boolean,
    canLoadMore: Boolean,
    isLoadingMore: Boolean,
    bottomPadding: androidx.compose.ui.unit.Dp,
    onTeamClick: (TeamWithPlayers) -> Unit,
    onLoadMore: () -> Unit,
) {
    if (isLoading && teams.isEmpty()) {
        EmptyState(message = "Loading teams...")
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = listTabPadding(bottomPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (teams.isEmpty()) {
            item {
                EmptyState(message = "No teams yet.")
            }
        } else {
            items(teams, key = { team -> team.team.id }) { team ->
                TeamCard(
                    team = team,
                    modifier = Modifier.clickable { onTeamClick(team) },
                )
            }
            if (canLoadMore) {
                item(key = "load-more-teams") {
                    OutlinedButton(
                        onClick = onLoadMore,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !isLoadingMore && !isLoading,
                    ) {
                        Text(if (isLoadingMore) "Loading more…" else "Load more teams")
                    }
                }
            }
        }
    }
}

@Composable
private fun RentalReservationCompleteContent(
    organization: Organization,
    reservation: RentalReservationComplete,
    bottomPadding: androidx.compose.ui.unit.Dp,
    onCreateEventNow: () -> Unit,
    onAttachLater: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = listTabPadding(bottomPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = "Resources reserved",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Your rental at ${organization.name.ifBlank { "this organization" }} is reserved.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    if (reservation.totalCents > 0) {
                        Text(
                            text = "Total: ${(reservation.totalCents / 100.0).moneyFormat()}",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Text(
                        text = "Booking ${reservation.bookingId}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.78f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        TextButton(onClick = onAttachLater) {
                            Text("Attach later")
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(onClick = onCreateEventNow) {
                            Text("Create event now")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StoreTabContent(
    organization: Organization?,
    products: List<Product>,
    startingProductCheckoutId: String?,
    isLoading: Boolean,
    bottomPadding: androidx.compose.ui.unit.Dp,
    onPurchase: (Product) -> Unit,
) {
    val paymentsEnabled = organization?.canUsePaidBilling() == true
    val isCheckoutStarting = !startingProductCheckoutId.isNullOrBlank()

    if (isLoading) {
        EmptyState(message = "Loading store...")
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = listTabPadding(bottomPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (!paymentsEnabled) {
            item {
                Text(
                    text = "Payments are not available for this organization yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }
        }

        if (products.isEmpty()) {
            item {
                EmptyState(message = "No products yet.")
            }
        } else {
            items(products, key = { product -> product.id }) { product ->
                ProductCard(
                    product = product,
                    paymentsEnabled = paymentsEnabled,
                    isStartingCheckout = startingProductCheckoutId == product.id,
                    isCheckoutLocked = isCheckoutStarting,
                    onPurchase = onPurchase,
                )
            }
        }
    }
}

@Composable
private fun ProductCard(
    product: Product,
    paymentsEnabled: Boolean,
    isStartingCheckout: Boolean,
    isCheckoutLocked: Boolean,
    onPurchase: (Product) -> Unit,
) {
    val isActive = product.isActive != false
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = product.name, style = MaterialTheme.typography.titleMedium)
                    product.description?.takeIf { it.isNotBlank() }?.let { description ->
                        Text(
                            text = description,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                Text(
                    text = product.periodLabel(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Text(
                text = product.priceLabel(),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold
            )

            if (!isActive) {
                Text(
                    text = "Inactive",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error
                )
            }

            Button(
                onClick = { onPurchase(product) },
                enabled = paymentsEnabled && isActive && !isCheckoutLocked,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (isStartingCheckout) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .width(18.dp)
                            .height(18.dp),
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(text = "Preparing checkout...")
                } else {
                    Text(text = if (paymentsEnabled) product.purchaseButtonLabel() else "Payments unavailable")
                }
            }
        }
    }
}

@Composable
private fun EmptyState(message: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(text = message, style = MaterialTheme.typography.bodyMedium)
    }
}
