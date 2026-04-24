package com.razumly.mvp.organizationDetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
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
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.data.dataTypes.canUsePaidBilling
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.UserVisibilityContext
import com.razumly.mvp.core.presentation.LockedRentalSelection
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.OrganizationDetailTab
import com.razumly.mvp.core.presentation.RentalCreateContext
import com.razumly.mvp.core.presentation.composables.BillingAddressDialog
import com.razumly.mvp.core.presentation.composables.EmbeddedWebModal
import com.razumly.mvp.core.presentation.composables.EventCard
import com.razumly.mvp.core.presentation.composables.PreparePaymentProcessor
import com.razumly.mvp.core.presentation.composables.TeamDetailsDialog
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventDetail.TextSignatureDialog
import com.razumly.mvp.eventSearch.RentalConfirmationContent
import com.razumly.mvp.eventSearch.RentalDetailsContent
import com.razumly.mvp.eventSearch.RentalDetailsStep
import com.razumly.mvp.eventSearch.RentalSelectionDraft
import com.razumly.mvp.eventSearch.SLOT_INTERVAL_MINUTES
import com.razumly.mvp.eventSearch.canApplyRentalSelectionRange
import com.razumly.mvp.eventSearch.isRangeCoveredByRentalAvailability
import com.razumly.mvp.eventSearch.rangeOverlapsBusyBlockOnDate
import com.razumly.mvp.eventSearch.rangesOverlap
import com.razumly.mvp.eventSearch.resolveRentalSelection
import com.razumly.mvp.icons.Indoor
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.ProfileActionDetails
import com.razumly.mvp.icons.ProfileActionEvents
import com.razumly.mvp.icons.ProfileActionPayments
import com.razumly.mvp.icons.ProfileActionTeams
import kotlinx.datetime.TimeZone
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
    val events by component.events.collectAsState()
    val teams by component.teams.collectAsState()
    val products by component.products.collectAsState()
    val startingProductCheckoutId by component.startingProductCheckoutId.collectAsState()
    val rentalFieldOptions by component.rentalFieldOptions.collectAsState()
    val rentalBusyBlocks by component.rentalBusyBlocks.collectAsState()
    val isLoadingOrganization by component.isLoadingOrganization.collectAsState()
    val isLoadingEvents by component.isLoadingEvents.collectAsState()
    val isLoadingTeams by component.isLoadingTeams.collectAsState()
    val isLoadingProducts by component.isLoadingProducts.collectAsState()
    val isLoadingRentals by component.isLoadingRentals.collectAsState()
    val billingAddressPrompt by component.billingAddressPrompt.collectAsState()
    val currentUser by component.currentUser.collectAsState()
    val startingTeamRegistrationId by component.startingTeamRegistrationId.collectAsState()
    val textSignaturePrompt by component.textSignaturePrompt.collectAsState()
    val webSignaturePrompt by component.webSignaturePrompt.collectAsState()

    var selectedTab by remember(component) { mutableStateOf(component.initialTab) }
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

    val timeZone = remember { TimeZone.currentSystemDefault() }
    val today = remember(timeZone) { Clock.System.now().toLocalDateTime(timeZone).date }
    var selectedRentalDate by remember { mutableStateOf(today) }
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
    val validResolvedSelections = resolvedSelections
    val invalidSelectionCount = remember(rentalSelections, resolvedSelections) {
        rentalSelections.size - resolvedSelections.size
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
                fieldName = resolved.field.name,
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
    val canGoToConfirmation = validResolvedSelections.isNotEmpty() &&
        invalidSelectionCount == 0
    val canContinueRental = organization != null &&
        rentalStartInstant != null &&
        rentalEndInstant != null &&
        selectedFieldIdsForCreate.isNotEmpty() &&
        selectedTimeSlotIdsForCreate.isNotEmpty() &&
        invalidSelectionCount == 0
    val rentalValidationMessage = when {
        organization == null -> "Organization is not available."
        isLoadingRentals && rentalFieldOptions.isEmpty() -> "Loading fields and rental slots..."
        rentalFieldOptions.isEmpty() -> "No fields are configured for this organization."
        rentalSelections.isEmpty() -> "Tap any available 30-minute cell to add a rental selection."
        invalidSelectionCount > 0 -> "One or more selections are outside available rental slot ranges."
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

    LaunchedEffect(selectedTab, organization?.id) {
        if (selectedTab == OrganizationDetailTab.RENTALS && organization != null) {
            component.refreshRentals()
        }
    }

    LaunchedEffect(selectedTab) {
        if (selectedTab != OrganizationDetailTab.RENTALS) {
            rentalSelections = emptyList()
            rentalDetailsStep = RentalDetailsStep.BUILDER
            selectedRentalDate = today
            nextRentalSelectionId = 1L
            component.clearRentalData()
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
                    Text(
                        text = organization?.name?.ifBlank { "Organization" } ?: "Organization",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
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
            PrimaryTabRow(selectedTabIndex = selectedTab.ordinal) {
                OrganizationDetailTab.values().forEachIndexed { index, tab ->
                    Tab(
                        selected = selectedTab.ordinal == index,
                        onClick = { selectedTab = tab },
                        text = {
                            Text(
                                text = tab.label(),
                                style = MaterialTheme.typography.labelSmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                        icon = {
                            Icon(
                                imageVector = tab.icon(),
                                contentDescription = null,
                            )
                        },
                    )
                }
            }

            when (selectedTab) {
                OrganizationDetailTab.OVERVIEW -> {
                    OverviewTabContent(
                        organization = organization,
                        events = events,
                        teams = teams,
                        isLoading = isLoadingOrganization,
                        bottomPadding = bottomPadding,
                        onEventClick = component::viewEvent,
                    )
                }

                OrganizationDetailTab.EVENTS -> {
                    EventsTabContent(
                        events = events,
                        isLoading = isLoadingEvents,
                        bottomPadding = bottomPadding,
                        onEventClick = component::viewEvent,
                    )
                }

                OrganizationDetailTab.TEAMS -> {
                    TeamsTabContent(
                        teams = teams,
                        isLoading = isLoadingTeams,
                        bottomPadding = bottomPadding,
                        onTeamClick = { team -> selectedTeam = team },
                    )
                }

                OrganizationDetailTab.RENTALS -> {
                    val currentOrganization = organization
                    if (currentOrganization == null) {
                        EmptyState(message = "Organization is not available.")
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
                            bottomPadding = bottomPadding,
                            canGoNext = canGoToConfirmation,
                            validationMessage = rentalValidationMessage,
                            onSelectedDateChange = { selectedDate ->
                                selectedRentalDate = selectedDate
                            },
                            onCreateSelection = { fieldId, startMinutes ->
                                val endMinutes = startMinutes + SLOT_INTERVAL_MINUTES
                                val fieldOption = rentalFieldOptions.firstOrNull { option ->
                                    option.field.id == fieldId
                                }
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
                                            timeZone = timeZone,
                                        )
                                }
                                val isWithinRentalAvailability = fieldOption != null &&
                                    isRangeCoveredByRentalAvailability(
                                        option = fieldOption,
                                        date = selectedRentalDate,
                                        startMinutes = startMinutes,
                                        endMinutes = endMinutes,
                                        timeZone = timeZone,
                                    )

                                if (!overlapsSelection && !overlapsBusyBlock && isWithinRentalAvailability) {
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
                            onBack = { rentalDetailsStep = RentalDetailsStep.BUILDER },
                            onContinue = {
                                if (!canContinueRental) return@RentalConfirmationContent
                                val start = rentalStartInstant
                                val end = rentalEndInstant
                                component.startRentalCreate(
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
                                    )
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
        OrganizationDetailTab.EVENTS -> "Events"
        OrganizationDetailTab.TEAMS -> "Teams"
        OrganizationDetailTab.RENTALS -> "Rentals"
        OrganizationDetailTab.STORE -> "Store"
    }
}

private fun OrganizationDetailTab.icon(): ImageVector {
    return when (this) {
        OrganizationDetailTab.OVERVIEW -> MVPIcons.ProfileActionDetails
        OrganizationDetailTab.EVENTS -> MVPIcons.ProfileActionEvents
        OrganizationDetailTab.TEAMS -> MVPIcons.ProfileActionTeams
        OrganizationDetailTab.RENTALS -> MVPIcons.Indoor
        OrganizationDetailTab.STORE -> MVPIcons.ProfileActionPayments
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
    isLoading: Boolean,
    bottomPadding: androidx.compose.ui.unit.Dp,
    onEventClick: (Event) -> Unit,
) {
    val scrollState = rememberScrollState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(horizontal = 16.dp, vertical = 16.dp)
            .padding(bottom = bottomPadding),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (isLoading) {
            Text(text = "Loading organization...", style = MaterialTheme.typography.bodyMedium)
        }

        SectionCard(title = "About") {
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

        SectionCard(title = "Recent Events") {
            when {
                events.isEmpty() -> {
                    Text(
                        text = "No events yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                else -> {
                    events.take(3).forEach { event ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 6.dp)
                                .clickable { onEventClick(event) },
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                        ) {
                            EventCard(
                                event = event,
                                navPadding = PaddingValues(bottom = 16.dp),
                                onMapClick = { }
                            )
                        }
                    }
                }
            }
        }

        SectionCard(title = "Teams") {
            when {
                teams.isEmpty() -> {
                    Text(
                        text = "No teams yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                else -> {
                    teams.take(3).forEach { team ->
                        TeamCard(team = team, modifier = Modifier.padding(vertical = 6.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun EventsTabContent(
    events: List<Event>,
    isLoading: Boolean,
    bottomPadding: androidx.compose.ui.unit.Dp,
    onEventClick: (Event) -> Unit,
) {
    if (isLoading) {
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
                        .fillMaxWidth()
                        .clickable { onEventClick(event) },
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    EventCard(
                        event = event,
                        navPadding = PaddingValues(bottom = 16.dp),
                        onMapClick = { }
                    )
                }
            }
        }
    }
}

@Composable
private fun TeamsTabContent(
    teams: List<TeamWithPlayers>,
    isLoading: Boolean,
    bottomPadding: androidx.compose.ui.unit.Dp,
    onTeamClick: (TeamWithPlayers) -> Unit,
) {
    if (isLoading) {
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
private fun SectionCard(
    title: String,
    content: @Composable () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(text = title, style = MaterialTheme.typography.titleMedium)
            content()
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
