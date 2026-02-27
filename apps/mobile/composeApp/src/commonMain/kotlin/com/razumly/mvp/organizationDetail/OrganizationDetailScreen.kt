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
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.OrganizationDetailTab
import com.razumly.mvp.core.presentation.RentalCreateContext
import com.razumly.mvp.core.presentation.composables.EventCard
import com.razumly.mvp.core.presentation.composables.PreparePaymentProcessor
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
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
import kotlin.time.Clock

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
    val rentalFieldOptions by component.rentalFieldOptions.collectAsState()
    val rentalBusyBlocks by component.rentalBusyBlocks.collectAsState()
    val isLoadingOrganization by component.isLoadingOrganization.collectAsState()
    val isLoadingEvents by component.isLoadingEvents.collectAsState()
    val isLoadingTeams by component.isLoadingTeams.collectAsState()
    val isLoadingProducts by component.isLoadingProducts.collectAsState()
    val isLoadingRentals by component.isLoadingRentals.collectAsState()

    var selectedTab by remember(component) { mutableStateOf(component.initialTab) }

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
    val validResolvedSelections = remember(resolvedSelections) {
        resolvedSelections.filter { it.totalPriceCents > 0 }
    }
    val invalidSelectionCount = remember(rentalSelections, resolvedSelections) {
        rentalSelections.size - resolvedSelections.size
    }
    val totalRentalPriceCents = remember(validResolvedSelections) {
        validResolvedSelections.sumOf { resolved -> resolved.totalPriceCents }
    }
    val selectedFieldIdsForCreate = remember(validResolvedSelections) {
        validResolvedSelections.map { resolved -> resolved.field.id }.distinct()
    }
    val selectedTimeSlotIdsForCreate = remember(validResolvedSelections) {
        validResolvedSelections.flatMap { resolved -> resolved.slots.map { slot -> slot.id } }.distinct()
    }
    val selectedRequiredTemplateIdsForCreate = remember(validResolvedSelections) {
        validResolvedSelections
            .flatMap { resolved ->
                resolved.slots.flatMap { slot -> slot.requiredTemplateIds }
            }
            .map { templateId -> templateId.trim() }
            .filter { templateId -> templateId.isNotEmpty() }
            .distinct()
    }
    val rentalStartInstant = remember(validResolvedSelections) {
        validResolvedSelections.minOfOrNull { resolved -> resolved.startInstant }
    }
    val rentalEndInstant = remember(validResolvedSelections) {
        validResolvedSelections.maxOfOrNull { resolved -> resolved.endInstant }
    }
    val canGoToConfirmation = validResolvedSelections.isNotEmpty() &&
        invalidSelectionCount == 0 &&
        totalRentalPriceCents > 0
    val canContinueRental = organization != null &&
        rentalStartInstant != null &&
        rentalEndInstant != null &&
        selectedFieldIdsForCreate.isNotEmpty() &&
        selectedTimeSlotIdsForCreate.isNotEmpty() &&
        invalidSelectionCount == 0 &&
        totalRentalPriceCents > 0
    val rentalValidationMessage = when {
        organization == null -> "Organization is not available."
        isLoadingRentals && rentalFieldOptions.isEmpty() -> "Loading fields and rental slots..."
        rentalFieldOptions.isEmpty() -> "No fields are configured for this organization."
        rentalSelections.isEmpty() -> "Tap any available 30-minute cell to add a rental selection."
        invalidSelectionCount > 0 -> "One or more selections are outside available rental slot ranges."
        totalRentalPriceCents <= 0 -> "Selected rentals do not have valid pricing."
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
                                if (canContinueRental) {
                                    val start = rentalStartInstant
                                    val end = rentalEndInstant
                                    if (start != null && end != null) {
                                        component.startRentalCreate(
                                            RentalCreateContext(
                                                organizationId = currentOrganization.id,
                                                organizationName = currentOrganization.name,
                                                organizationLocation = currentOrganization.location,
                                                organizationCoordinates = currentOrganization.coordinates,
                                                organizationFieldIds = currentOrganization.fieldIds,
                                                selectedFieldIds = selectedFieldIdsForCreate,
                                                selectedTimeSlotIds = selectedTimeSlotIdsForCreate,
                                                requiredTemplateIds = selectedRequiredTemplateIdsForCreate,
                                                rentalPriceCents = totalRentalPriceCents,
                                                startEpochMillis = start.toEpochMilliseconds(),
                                                endEpochMillis = end.toEpochMilliseconds(),
                                            )
                                        )
                                    }
                                }
                            }
                        )
                    }
                }

                OrganizationDetailTab.STORE -> {
                    StoreTabContent(
                        organization = organization,
                        products = products,
                        isLoading = isLoadingProducts,
                        bottomPadding = bottomPadding,
                        onPurchase = component::startProductPurchase,
                    )
                }
            }
        }
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
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp + bottomPadding),
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
) {
    if (isLoading) {
        EmptyState(message = "Loading teams...")
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp + bottomPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (teams.isEmpty()) {
            item {
                EmptyState(message = "No teams yet.")
            }
        } else {
            items(teams, key = { team -> team.team.id }) { team ->
                TeamCard(team = team)
            }
        }
    }
}

@Composable
private fun StoreTabContent(
    organization: Organization?,
    products: List<Product>,
    isLoading: Boolean,
    bottomPadding: androidx.compose.ui.unit.Dp,
    onPurchase: (Product) -> Unit,
) {
    val hasStripeAccount = organization?.hasStripeAccount == true

    if (isLoading) {
        EmptyState(message = "Loading store...")
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp + bottomPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (!hasStripeAccount) {
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
                    hasStripeAccount = hasStripeAccount,
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
    hasStripeAccount: Boolean,
    onPurchase: (Product) -> Unit,
) {
    val isActive = product.isActive != false
    val priceLabel = (product.priceCents / 100.0).moneyFormat()
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
                    text = product.period.lowercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Text(
                text = "$priceLabel / ${product.period.lowercase()}",
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
                enabled = hasStripeAccount && isActive,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(text = if (hasStripeAccount) "Purchase" else "Payments unavailable")
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
