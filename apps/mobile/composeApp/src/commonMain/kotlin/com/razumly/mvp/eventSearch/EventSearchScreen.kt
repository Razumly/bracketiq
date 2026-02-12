@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FabPosition
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBarDefaults
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.RentalCreateContext
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.SearchBox
import com.razumly.mvp.core.presentation.composables.SearchOverlay
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials
import dev.chrisbanes.haze.rememberHazeState
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.compose.BindLocationTrackerEffect
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.toInstant
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private enum class DiscoverTab(val label: String, val searchPlaceholder: String) {
    EVENTS(label = "Events", searchPlaceholder = "Search events"),
    RENTALS(label = "Rentals", searchPlaceholder = "Search rentals")
}

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun EventSearchScreen(
    component: EventSearchComponent,
    mapComponent: MapComponent,
) {
    val events by component.events.collectAsState()
    val rentals by component.rentals.collectAsState()
    val isLoadingRentals by component.isLoadingRentals.collectAsState()
    val rentalFieldOptions by component.rentalFieldOptions.collectAsState()
    val isLoadingRentalFields by component.isLoadingRentalFields.collectAsState()
    val showMapCard by component.showMapCard.collectAsState()
    val selectedEvent by component.selectedEvent.collectAsState()
    val hazeState = rememberHazeState()
    val offsetNavPadding =
        PaddingValues(bottom = LocalNavBarPadding.current.calculateBottomPadding().plus(32.dp))

    val eventsListState = rememberLazyListState()
    val rentalsListState = rememberLazyListState()

    var fabOffset by remember { mutableStateOf(Offset.Zero) }
    var revealCenter by remember { mutableStateOf(Offset.Zero) }
    val suggestions by component.suggestedEvents.collectAsState()
    val currentLocation by component.currentLocation.collectAsState()
    val currentFilter by component.filter.collectAsState()

    var selectedTab by rememberSaveable { mutableStateOf(DiscoverTab.EVENTS) }
    var searchQuery by remember { mutableStateOf("") }
    var showSearchOverlay by remember { mutableStateOf(false) }
    var searchBoxPosition by remember { mutableStateOf(Offset.Zero) }
    var searchBoxSize by remember { mutableStateOf(IntSize.Zero) }

    val isLoadingMore by component.isLoadingMore.collectAsState()
    val hasMoreEvents by component.hasMoreEvents.collectAsState()

    var showFab by remember { mutableStateOf(true) }
    var showFloatingSearch by remember { mutableStateOf(true) }
    var showingFilter by remember { mutableStateOf(false) }

    var selectedRentalOrganization by remember { mutableStateOf<Organization?>(null) }
    var rentalStart by remember { mutableStateOf<Instant?>(null) }
    var rentalEnd by remember { mutableStateOf<Instant?>(null) }
    var selectedRentalFieldIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker by remember { mutableStateOf(false) }

    val eventsScrollingUp by eventsListState.isScrollingUp()
    val rentalsScrollingUp by rentalsListState.isScrollingUp()

    val density = LocalDensity.current
    var overlayTopOffset by remember { mutableStateOf(0.dp) }
    var overlayStartOffset by remember { mutableStateOf(0.dp) }
    var overlayWidth by remember { mutableStateOf(0.dp) }

    val filteredRentals = remember(rentals, searchQuery) {
        rentals.filterByQuery(searchQuery)
    }

    val currentListScrollingUp = when (selectedTab) {
        DiscoverTab.EVENTS -> eventsScrollingUp
        DiscoverTab.RENTALS -> rentalsScrollingUp
    }

    val hasRentalDetailsOpen = selectedRentalOrganization != null
    val matchingSlotsByField = remember(rentalFieldOptions, rentalStart, rentalEnd) {
        val start = rentalStart
        val end = rentalEnd
        if (start == null || end == null || end <= start) {
            emptyMap()
        } else {
            rentalFieldOptions.associate { option ->
                option.field.id to option.rentalSlots.firstOrNull { slot ->
                    slot.matchesRentalSelection(
                        rangeStart = start,
                        rangeEnd = end,
                        fieldId = option.field.id
                    )
                }
            }
        }
    }
    val availableRentalFieldIds = remember(matchingSlotsByField) {
        matchingSlotsByField.mapNotNull { (fieldId, slot) ->
            fieldId.takeIf { slot != null }
        }.toSet()
    }
    val orderedSelectedFieldIds = remember(selectedRentalFieldIds) {
        selectedRentalFieldIds.toList().sorted()
    }
    val selectedTimeSlotIds = remember(orderedSelectedFieldIds, matchingSlotsByField) {
        orderedSelectedFieldIds.mapNotNull { fieldId ->
            matchingSlotsByField[fieldId]?.id
        }
    }
    val totalRentalPriceCents = remember(orderedSelectedFieldIds, matchingSlotsByField) {
        orderedSelectedFieldIds.sumOf { fieldId ->
            matchingSlotsByField[fieldId]?.price ?: 0
        }
    }
    val hasSelectableRentalFields = remember(availableRentalFieldIds) {
        availableRentalFieldIds.isNotEmpty()
    }
    val canContinueRental = selectedRentalOrganization != null &&
        rentalStart != null &&
        rentalEnd != null &&
        rentalEnd!! > rentalStart!! &&
        selectedRentalFieldIds.isNotEmpty() &&
        selectedTimeSlotIds.size == selectedRentalFieldIds.size &&
        totalRentalPriceCents > 0
    val rentalValidationMessage = when {
        selectedRentalOrganization == null -> null
        rentalStart == null || rentalEnd == null -> "Select a start and end time to continue."
        rentalEnd!! <= rentalStart!! -> "End time must be after start time."
        isLoadingRentalFields -> "Loading fields and rental slots..."
        rentalFieldOptions.isEmpty() -> "No fields are configured for this organization."
        !hasSelectableRentalFields -> "No fields are available for the selected date/time."
        selectedRentalFieldIds.isEmpty() -> "Select one or more fields/courts to continue."
        selectedTimeSlotIds.size != selectedRentalFieldIds.size -> "One or more selected fields are unavailable."
        totalRentalPriceCents <= 0 -> "Selected fields do not have valid rental pricing."
        else -> null
    }

    val loadingHandler = LocalLoadingHandler.current
    val popupHandler = LocalPopupHandler.current

    LaunchedEffect(searchBoxSize, searchBoxPosition) {
        overlayTopOffset = with(density) {
            searchBoxPosition.y.toDp() + searchBoxSize.height.toDp() + 4.dp
        }

        overlayStartOffset = with(density) {
            searchBoxPosition.x.toDp()
        }

        overlayWidth = with(density) {
            searchBoxSize.width.toDp()
        }
    }

    if (showMapCard) {
        LaunchedEffect(events) {
            mapComponent.setEvents(events)
        }
    }

    LaunchedEffect(eventsScrollingUp, showMapCard, showingFilter, selectedTab, hasRentalDetailsOpen) {
        showFab = selectedTab == DiscoverTab.EVENTS &&
            !hasRentalDetailsOpen &&
            (eventsScrollingUp || showMapCard) &&
            !showingFilter
    }

    LaunchedEffect(currentListScrollingUp, showSearchOverlay, showingFilter, searchQuery, hasRentalDetailsOpen) {
        showFloatingSearch = if (hasRentalDetailsOpen) {
            false
        } else {
            currentListScrollingUp || showSearchOverlay || showingFilter || searchQuery.isNotEmpty()
        }
    }

    LaunchedEffect(selectedTab) {
        if (selectedTab != DiscoverTab.EVENTS) {
            showingFilter = false
            if (showMapCard) {
                component.onMapClick()
                mapComponent.toggleMap()
            }
        }
    }

    LaunchedEffect(selectedTab, searchQuery) {
        if (selectedTab == DiscoverTab.EVENTS && searchQuery.isNotBlank()) {
            component.suggestEvents(searchQuery)
        }
    }

    LaunchedEffect(selectedTab, rentals, isLoadingRentals) {
        if (selectedTab == DiscoverTab.RENTALS && rentals.isEmpty() && !isLoadingRentals) {
            component.refreshRentals()
        }
    }

    LaunchedEffect(hasRentalDetailsOpen) {
        if (hasRentalDetailsOpen) {
            showSearchOverlay = false
        } else {
            component.clearRentalFieldOptions()
            selectedRentalFieldIds = emptySet()
        }
    }

    LaunchedEffect(availableRentalFieldIds) {
        if (selectedRentalFieldIds.any { fieldId -> fieldId !in availableRentalFieldIds }) {
            selectedRentalFieldIds = selectedRentalFieldIds.filter { fieldId ->
                fieldId in availableRentalFieldIds
            }.toSet()
        }
    }

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
        component.errorState.collect { error ->
            if (error != null) {
                popupHandler.showPopup(error)
            }
        }
    }

    fun openRentalDetails(organization: Organization) {
        val nowMillis = Clock.System.now().toEpochMilliseconds()
        selectedRentalOrganization = organization
        rentalStart = Instant.fromEpochMilliseconds(nowMillis + ONE_HOUR_MILLIS)
        rentalEnd = Instant.fromEpochMilliseconds(nowMillis + THREE_HOURS_MILLIS)
        selectedRentalFieldIds = emptySet()
        component.loadRentalFieldOptions(organization.fieldIds)
        showSearchOverlay = false
    }

    Box {
        BindLocationTrackerEffect(component.locationTracker)
        Scaffold(
            topBar = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .hazeEffect(
                            hazeState,
                            HazeMaterials.ultraThin(NavigationBarDefaults.containerColor)
                        )
                        .statusBarsPadding()
                ) {
                    PrimaryTabRow(
                        selectedTabIndex = selectedTab.ordinal,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        DiscoverTab.values().forEachIndexed { index, tab ->
                            Tab(
                                selected = selectedTab.ordinal == index,
                                onClick = {
                                    selectedTab = tab
                                    selectedRentalOrganization = null
                                    selectedRentalFieldIds = emptySet()
                                    component.clearRentalFieldOptions()
                                },
                                text = { Text(tab.label) }
                            )
                        }
                    }
                }
            },
            floatingActionButton = {
                AnimatedVisibility(
                    visible = showFab,
                    enter = (slideInVertically { it / 2 } + fadeIn()),
                    exit = (slideOutVertically { it / 2 } + fadeOut())
                ) {
                    Button(
                        onClick = {
                            revealCenter = fabOffset
                            component.onMapClick()
                            mapComponent.toggleMap()
                        },
                        modifier = Modifier
                            .padding(offsetNavPadding)
                            .onGloballyPositioned { layoutCoordinates ->
                                val boundsInWindow = layoutCoordinates.boundsInWindow()
                                fabOffset = boundsInWindow.center
                            },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.Black,
                            contentColor = Color.White
                        )
                    ) {
                        val text = if (showMapCard) "List" else "Map"
                        val icon =
                            if (showMapCard) Icons.AutoMirrored.Filled.List else Icons.Default.Place
                        Text(text)
                        Icon(icon, contentDescription = "$text Button")
                    }
                }
            },
            floatingActionButtonPosition = FabPosition.Center,
        ) { paddingValues ->
            val firstElementPadding = PaddingValues(
                top = paddingValues.calculateTopPadding().plus(72.dp)
            )
            Box(
                Modifier
                    .hazeSource(hazeState)
                    .fillMaxSize()
            ) {
                when (selectedTab) {
                    DiscoverTab.EVENTS -> {
                        EventList(
                            events = events,
                            firstElementPadding = firstElementPadding,
                            lastElementPadding = offsetNavPadding,
                            lazyListState = eventsListState,
                            isLoadingMore = isLoadingMore,
                            hasMoreEvents = hasMoreEvents,
                            onLoadMore = { component.loadMoreEvents() },
                            onMapClick = { offset, event ->
                                revealCenter = offset
                                component.onMapClick(event)
                                mapComponent.toggleMap()
                            },
                            onEventClick = { event ->
                                component.viewEvent(event)
                            }
                        )
                        EventMap(
                            component = mapComponent,
                            onEventSelected = { event ->
                                component.viewEvent(event)
                            },
                            onPlaceSelected = {},
                            canClickPOI = false,
                            focusedLocation = selectedEvent?.let {
                                LatLng(it.latitude, it.longitude)
                            } ?: currentLocation ?: LatLng(0.0, 0.0),
                            focusedEvent = null,
                            revealCenter = revealCenter,
                        )
                    }

                    DiscoverTab.RENTALS -> {
                        if (selectedRentalOrganization != null && rentalStart != null && rentalEnd != null) {
                            RentalDetailsContent(
                                organization = selectedRentalOrganization!!,
                                start = rentalStart!!,
                                end = rentalEnd!!,
                                fieldOptions = rentalFieldOptions,
                                matchingSlotsByField = matchingSlotsByField,
                                selectedFieldIds = selectedRentalFieldIds,
                                totalPriceCents = totalRentalPriceCents,
                                isLoadingFields = isLoadingRentalFields,
                                topPadding = paddingValues.calculateTopPadding(),
                                bottomPadding = offsetNavPadding.calculateBottomPadding(),
                                canContinue = canContinueRental,
                                validationMessage = rentalValidationMessage,
                                onBack = {
                                    selectedRentalOrganization = null
                                    selectedRentalFieldIds = emptySet()
                                    component.clearRentalFieldOptions()
                                },
                                onStartClick = { showStartPicker = true },
                                onEndClick = { showEndPicker = true },
                                onFieldToggle = { fieldId, checked ->
                                    selectedRentalFieldIds = if (checked) {
                                        selectedRentalFieldIds + fieldId
                                    } else {
                                        selectedRentalFieldIds - fieldId
                                    }
                                },
                                onContinue = {
                                    if (canContinueRental) {
                                        val organization = selectedRentalOrganization
                                        val start = rentalStart
                                        val end = rentalEnd
                                        if (organization != null && start != null && end != null) {
                                            component.startRentalCreate(
                                                RentalCreateContext(
                                                    organizationId = organization.id,
                                                    organizationName = organization.name,
                                                    organizationLocation = organization.location,
                                                    organizationCoordinates = organization.coordinates,
                                                    organizationFieldIds = organization.fieldIds,
                                                    selectedFieldIds = orderedSelectedFieldIds,
                                                    selectedTimeSlotIds = selectedTimeSlotIds,
                                                    rentalPriceCents = totalRentalPriceCents,
                                                    startEpochMillis = start.toEpochMilliseconds(),
                                                    endEpochMillis = end.toEpochMilliseconds(),
                                                )
                                            )
                                            selectedRentalOrganization = null
                                            selectedRentalFieldIds = emptySet()
                                            component.clearRentalFieldOptions()
                                        }
                                    }
                                }
                            )
                        } else {
                            DiscoverOrganizationList(
                                organizations = filteredRentals,
                                listState = rentalsListState,
                                firstElementPadding = firstElementPadding,
                                lastElementPadding = offsetNavPadding,
                                emptyMessage = if (isLoadingRentals) {
                                    "Loading rentals..."
                                } else if (searchQuery.isBlank()) {
                                    "No rentals discovered nearby yet."
                                } else {
                                    "No rentals match your search."
                                },
                                onOrganizationClick = { organization ->
                                    openRentalDetails(organization)
                                }
                            )
                        }
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = showFloatingSearch,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(top = 56.dp),
            enter = slideInVertically { -it / 2 } + fadeIn(),
            exit = slideOutVertically { -it / 2 } + fadeOut()
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
            ) {
                SearchBox(
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = selectedTab.searchPlaceholder,
                    filter = selectedTab == DiscoverTab.EVENTS,
                    currentFilter = if (selectedTab == DiscoverTab.EVENTS) currentFilter else null,
                    onChange = { query ->
                        searchQuery = query
                        showSearchOverlay = query.isNotEmpty()
                        if (selectedTab == DiscoverTab.EVENTS) {
                            component.suggestEvents(query)
                        }
                    },
                    onSearch = { /* no-op */ },
                    onFocusChange = { isFocused ->
                        if (isFocused) {
                            showSearchOverlay = true
                        } else if (searchQuery.isEmpty()) {
                            showSearchOverlay = false
                        }
                    },
                    onPositionChange = { position, size ->
                        searchBoxPosition = position
                        searchBoxSize = size
                    },
                    onFilterChange = { update ->
                        if (selectedTab == DiscoverTab.EVENTS) {
                            component.updateFilter(update)
                        }
                    },
                    onToggleFilter = { showFilter ->
                        showingFilter = showFilter
                    }
                )
            }
        }

        SearchOverlay(
            modifier = Modifier
                .width(overlayWidth)
                .heightIn(max = 400.dp)
                .offset(
                    x = overlayStartOffset,
                    y = overlayTopOffset
                ),
            isVisible = showSearchOverlay,
            searchQuery = searchQuery,
            onDismiss = {
                showSearchOverlay = false
            },
            suggestions = {
                when (selectedTab) {
                    DiscoverTab.EVENTS -> {
                        LazyColumn(modifier = Modifier.wrapContentSize()) {
                            if (suggestions.isEmpty()) {
                                item {
                                    EmptyDiscoverListItem(message = "No event suggestions found.")
                                }
                            }
                            items(suggestions) { event ->
                                Card(
                                    Modifier
                                        .padding(vertical = 4.dp, horizontal = 8.dp)
                                        .clickable(onClick = {
                                            component.viewEvent(event)
                                            showSearchOverlay = false
                                        })
                                        .fillMaxWidth()
                                ) {
                                    Text(
                                        text = "${event.name} at ${event.location}".toTitleCase(),
                                        modifier = Modifier.padding(8.dp),
                                        overflow = TextOverflow.Ellipsis,
                                        maxLines = 1,
                                        style = MaterialTheme.typography.bodyLarge
                                    )
                                }
                            }
                        }
                    }

                    DiscoverTab.RENTALS -> {
                        LazyColumn(modifier = Modifier.wrapContentSize()) {
                            if (filteredRentals.isEmpty()) {
                                item {
                                    EmptyDiscoverListItem(message = "No rental suggestions found.")
                                }
                            }
                            items(filteredRentals.take(10)) { organization ->
                                DiscoverOrganizationSuggestion(
                                    organization = organization,
                                    onClick = {
                                        openRentalDetails(organization)
                                        showSearchOverlay = false
                                    }
                                )
                            }
                        }
                    }
                }
            },
            initial = {
                val message = when (selectedTab) {
                    DiscoverTab.EVENTS -> "Start typing to search for events..."
                    DiscoverTab.RENTALS -> "Start typing to search for rentals..."
                }
                EmptyDiscoverListItem(message = message)
            }
        )
    }

    PlatformDateTimePicker(
        onDateSelected = { selectedInstant ->
            rentalStart = selectedInstant ?: rentalStart
            showStartPicker = false
        },
        onDismissRequest = { showStartPicker = false },
        showPicker = showStartPicker,
        getTime = true,
        canSelectPast = false,
    )

    PlatformDateTimePicker(
        onDateSelected = { selectedInstant ->
            rentalEnd = selectedInstant ?: rentalEnd
            showEndPicker = false
        },
        onDismissRequest = { showEndPicker = false },
        showPicker = showEndPicker,
        getTime = true,
        canSelectPast = false,
    )
}

private fun List<Organization>.filterByQuery(query: String): List<Organization> {
    val normalizedQuery = query.trim()
    if (normalizedQuery.isBlank()) {
        return sortedBy { organization -> organization.name.lowercase() }
    }

    return filter { organization ->
        organization.name.contains(normalizedQuery, ignoreCase = true) ||
            organization.location?.contains(normalizedQuery, ignoreCase = true) == true ||
            organization.description?.contains(normalizedQuery, ignoreCase = true) == true
    }.sortedBy { organization -> organization.name.lowercase() }
}

@Composable
private fun DiscoverOrganizationList(
    organizations: List<Organization>,
    listState: LazyListState,
    firstElementPadding: PaddingValues,
    lastElementPadding: PaddingValues,
    emptyMessage: String,
    onOrganizationClick: (Organization) -> Unit,
) {
    LazyColumn(
        state = listState,
    ) {
        if (organizations.isEmpty()) {
            item {
                EmptyDiscoverListItem(
                    message = emptyMessage,
                    modifier = Modifier
                        .padding(firstElementPadding)
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                )
            }
            return@LazyColumn
        }

        itemsIndexed(organizations, key = { _, organization -> organization.id }) { index, organization ->
            val padding = when (index) {
                0 -> firstElementPadding
                organizations.size - 1 -> lastElementPadding
                else -> PaddingValues()
            }

            DiscoverOrganizationCard(
                organization = organization,
                onClick = { onOrganizationClick(organization) },
                modifier = Modifier
                    .padding(padding)
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .fillMaxWidth()
            )
        }
    }
}

@Composable
private fun DiscoverOrganizationCard(
    organization: Organization,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.clickable(onClick = onClick)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Default.Groups,
                    contentDescription = "Organization icon",
                    tint = MaterialTheme.colorScheme.primary
                )
                Text(
                    text = organization.name.ifBlank { "Organization" },
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            organization.location?.takeIf { it.isNotBlank() }?.let { location ->
                Text(
                    text = location,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            organization.description?.takeIf { it.isNotBlank() }?.let { description ->
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }

            val fieldCount = organization.fieldIds.size
            val detailsText = if (fieldCount == 1) {
                "1 rentable field"
            } else {
                "$fieldCount rentable fields"
            }

            Text(
                text = detailsText,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
    }
}

@Composable
private fun DiscoverOrganizationSuggestion(
    organization: Organization,
    onClick: () -> Unit,
) {
    Card(
        Modifier
            .padding(vertical = 4.dp, horizontal = 8.dp)
            .clickable(onClick = onClick)
            .fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(8.dp)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Default.Groups,
                    contentDescription = "Organization icon",
                    tint = MaterialTheme.colorScheme.primary
                )
                Text(
                    text = organization.name.ifBlank { "Organization" },
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            val fieldCount = organization.fieldIds.size
            val detailsText = if (fieldCount == 1) "1 rentable field" else "$fieldCount rentable fields"

            Text(
                text = detailsText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun RentalDetailsContent(
    organization: Organization,
    start: Instant,
    end: Instant,
    fieldOptions: List<RentalFieldOption>,
    matchingSlotsByField: Map<String, TimeSlot?>,
    selectedFieldIds: Set<String>,
    totalPriceCents: Int,
    isLoadingFields: Boolean,
    topPadding: Dp,
    bottomPadding: Dp,
    canContinue: Boolean,
    validationMessage: String?,
    onBack: () -> Unit,
    onStartClick: () -> Unit,
    onEndClick: () -> Unit,
    onFieldToggle: (String, Boolean) -> Unit,
    onContinue: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(
                start = 16.dp,
                end = 16.dp,
                top = topPadding + 16.dp,
                bottom = bottomPadding + 16.dp
            ),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Button(
                onClick = onBack,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = MaterialTheme.colorScheme.onSurfaceVariant
                )
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back"
                )
                Text("Back to rentals")
            }

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Default.Groups,
                            contentDescription = "Organization icon",
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = organization.name.ifBlank { "Organization" },
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold
                        )
                    }

                    organization.location?.takeIf { it.isNotBlank() }?.let { location ->
                        Text(
                            text = location,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    organization.description?.takeIf { it.isNotBlank() }?.let { description ->
                        Text(
                            text = description,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Text(
                        text = "Select rental times",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(top = 6.dp)
                    )

                    RentalDateTimeRow(
                        label = "Start",
                        value = start.toDisplayDateTime(),
                        onClick = onStartClick
                    )
                    RentalDateTimeRow(
                        label = "End",
                        value = end.toDisplayDateTime(),
                        onClick = onEndClick
                    )

                    Text(
                        text = "Select fields/courts",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(top = 6.dp)
                    )

                    when {
                        isLoadingFields -> {
                            Text(
                                text = "Loading fields...",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        fieldOptions.isEmpty() -> {
                            Text(
                                text = "No fields are configured for this organization.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        else -> {
                            fieldOptions.forEach { option ->
                                val matchedSlot = matchingSlotsByField[option.field.id]
                                val hasAvailableSlot = matchedSlot != null
                                val isChecked = option.field.id in selectedFieldIds
                                val slotPrice = matchedSlot?.price
                                val availabilityLabel = if (matchedSlot != null) {
                                    matchedSlot.toRentalAvailabilityLabel()
                                } else {
                                    "Unavailable for selected time"
                                }

                                RentalFieldSelectionRow(
                                    field = option.field,
                                    checked = isChecked,
                                    enabled = hasAvailableSlot,
                                    priceLabel = if (slotPrice != null && slotPrice > 0) {
                                        (slotPrice / 100.0).moneyFormat()
                                    } else {
                                        null
                                    },
                                    availabilityLabel = availabilityLabel,
                                    onCheckedChange = { checked ->
                                        onFieldToggle(option.field.id, checked)
                                    }
                                )
                            }
                        }
                    }

                    if (totalPriceCents > 0) {
                        Text(
                            text = "Total rental: ${(totalPriceCents / 100.0).moneyFormat()}",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }

                    validationMessage?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }
        }

        Button(
            onClick = onContinue,
            enabled = canContinue,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp)
        ) {
            Text("Continue to create event")
        }
    }
}

@Composable
private fun RentalFieldSelectionRow(
    field: Field,
    checked: Boolean,
    enabled: Boolean,
    priceLabel: String?,
    availabilityLabel: String,
    onCheckedChange: (Boolean) -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = enabled) {
                    onCheckedChange(!checked)
                }
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Checkbox(
                checked = checked,
                enabled = enabled,
                onCheckedChange = { isChecked ->
                    onCheckedChange(isChecked)
                }
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text(
                    text = field.displayLabel(),
                    style = MaterialTheme.typography.bodyLarge
                )
                Text(
                    text = availabilityLabel,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (enabled) {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    } else {
                        MaterialTheme.colorScheme.error
                    }
                )
            }
            if (!priceLabel.isNullOrBlank()) {
                Text(
                    text = priceLabel,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}

@Composable
private fun RentalDateTimeRow(
    label: String,
    value: String,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

@Composable
private fun EmptyDiscoverListItem(
    message: String,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .padding(vertical = 4.dp, horizontal = 8.dp)
            .fillMaxWidth()
    ) {
        Text(
            text = message,
            modifier = Modifier.padding(8.dp),
            overflow = TextOverflow.Ellipsis,
            maxLines = 2,
            style = MaterialTheme.typography.bodyLarge
        )
    }
}

private fun Instant.toDisplayDateTime(): String {
    return toLocalDateTime(TimeZone.currentSystemDefault()).format(dateTimeFormat)
}

private fun Field.displayLabel(): String {
    if (!name.isNullOrBlank()) {
        return name
    }
    return "Field $fieldNumber"
}

private fun TimeSlot.matchesRentalSelection(
    rangeStart: Instant,
    rangeEnd: Instant,
    fieldId: String,
): Boolean {
    if (rangeEnd <= rangeStart) {
        return false
    }
    if (!scheduledFieldId.isNullOrBlank() && scheduledFieldId != fieldId) {
        return false
    }
    if ((price ?: 0) <= 0) {
        return false
    }

    val timeZone = TimeZone.currentSystemDefault()
    val slotStartLocal = startDate.toLocalDateTime(timeZone)
    val selectedStartLocal = rangeStart.toLocalDateTime(timeZone)
    val selectedEndLocal = rangeEnd.toLocalDateTime(timeZone)

    if (selectedStartLocal.date != selectedEndLocal.date) {
        return false
    }

    val selectedStartMinutes = selectedStartLocal.hour * 60 + selectedStartLocal.minute
    val selectedEndMinutes = selectedEndLocal.hour * 60 + selectedEndLocal.minute

    val slotStartMinutes = startTimeMinutes ?: (slotStartLocal.hour * 60 + slotStartLocal.minute)
    val slotEndMinutes = endTimeMinutes ?: endDate
        ?.toLocalDateTime(timeZone)
        ?.let { endLocal -> endLocal.hour * 60 + endLocal.minute }
        ?: return false

    if (slotEndMinutes <= slotStartMinutes) {
        return false
    }
    if (selectedStartMinutes < slotStartMinutes || selectedEndMinutes > slotEndMinutes) {
        return false
    }

    if (repeating) {
        val selectedDayIndex = selectedStartLocal.dayOfWeek.toRentalDayIndex()
        val slotDayIndex = dayOfWeek ?: slotStartLocal.dayOfWeek.toRentalDayIndex()
        if (selectedDayIndex != slotDayIndex) {
            return false
        }

        if (selectedStartLocal.date < slotStartLocal.date) {
            return false
        }
        if (endDate != null && selectedStartLocal.date > endDate!!.toLocalDateTime(timeZone).date) {
            return false
        }
        return true
    }

    val slotDurationMinutes = slotEndMinutes - slotStartMinutes
    if (slotDurationMinutes <= 0) {
        return false
    }

    val slotEndInstant = endDate ?: (startDate + slotDurationMinutes.minutes)

    return rangeStart >= startDate && rangeEnd <= slotEndInstant
}

private fun TimeSlot.toRentalAvailabilityLabel(): String {
    val slotStart = startTimeMinutes.toClockLabel()
    val slotEnd = endTimeMinutes.toClockLabel()
    val dayLabel = dayOfWeek.toDayLabel()
    return if (slotStart != null && slotEnd != null) {
        "$dayLabel $slotStart - $slotEnd"
    } else {
        "Available"
    }
}

private fun Int?.toClockLabel(): String? {
    val minutes = this ?: return null
    if (minutes !in 0..(24 * 60)) {
        return null
    }
    val hour24 = (minutes / 60) % 24
    val minute = minutes % 60
    val hour12 = when (val normalized = hour24 % 12) {
        0 -> 12
        else -> normalized
    }
    val suffix = if (hour24 < 12) "AM" else "PM"
    val minuteText = if (minute < 10) "0$minute" else minute.toString()
    return "$hour12:$minuteText $suffix"
}

private fun Int?.toDayLabel(): String {
    return when (this) {
        0 -> "Mon"
        1 -> "Tue"
        2 -> "Wed"
        3 -> "Thu"
        4 -> "Fri"
        5 -> "Sat"
        6 -> "Sun"
        else -> "Mon"
    }
}

private fun DayOfWeek.toRentalDayIndex(): Int = isoDayNumber - 1

private const val ONE_HOUR_MILLIS = 60L * 60L * 1000L
private const val THREE_HOURS_MILLIS = 3L * ONE_HOUR_MILLIS
