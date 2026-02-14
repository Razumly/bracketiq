@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FabPosition
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.kizitonwose.calendar.compose.WeekCalendar
import com.kizitonwose.calendar.compose.weekcalendar.rememberWeekCalendarState
import com.kizitonwose.calendar.core.Week
import com.kizitonwose.calendar.core.WeekDay
import com.kizitonwose.calendar.core.WeekDayPosition
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.SearchBox
import com.razumly.mvp.core.presentation.composables.SearchOverlay
import com.razumly.mvp.core.presentation.util.dateFormat
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
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.toInstant
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.time.Duration.Companion.minutes
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private enum class DiscoverTab(val label: String, val searchPlaceholder: String) {
    EVENTS(label = "Events", searchPlaceholder = "Search events"),
    ORGANIZATIONS(label = "Organizations", searchPlaceholder = "Search organizations"),
    RENTALS(label = "Rentals", searchPlaceholder = "Search rentals")
}

internal enum class RentalDetailsStep {
    BUILDER,
    CONFIRMATION,
}

private enum class RentalDragHandle {
    TOP,
    BOTTOM,
}

internal data class RentalSelectionDraft(
    val id: Long,
    val fieldId: String,
    val date: LocalDate,
    val startMinutes: Int,
    val endMinutes: Int,
)

internal data class ResolvedRentalSelection(
    val selection: RentalSelectionDraft,
    val field: Field,
    val slots: List<TimeSlot>,
    val startInstant: Instant,
    val endInstant: Instant,
    val totalPriceCents: Int,
)

private data class RentalBusyRange(
    val eventId: String,
    val eventName: String,
    val startMinutes: Int,
    val endMinutes: Int,
)

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun EventSearchScreen(
    component: EventSearchComponent,
    mapComponent: MapComponent,
) {
    val events by component.events.collectAsState()
    val organizations by component.organizations.collectAsState()
    val isLoadingOrganizations by component.isLoadingOrganizations.collectAsState()
    val rentals by component.rentals.collectAsState()
    val isLoadingRentals by component.isLoadingRentals.collectAsState()
    val showMapCard by component.showMapCard.collectAsState()
    val selectedEvent by component.selectedEvent.collectAsState()
    val hazeState = rememberHazeState()
    val offsetNavPadding =
        PaddingValues(bottom = LocalNavBarPadding.current.calculateBottomPadding().plus(32.dp))

    val eventsListState = rememberLazyListState()
    val organizationsListState = rememberLazyListState()
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

    val eventsScrollingUp by eventsListState.isScrollingUp()
    val organizationsScrollingUp by organizationsListState.isScrollingUp()
    val rentalsScrollingUp by rentalsListState.isScrollingUp()

    val density = LocalDensity.current
    var overlayTopOffset by remember { mutableStateOf(0.dp) }
    var overlayStartOffset by remember { mutableStateOf(0.dp) }
    var overlayWidth by remember { mutableStateOf(0.dp) }

    val filteredRentals = remember(rentals, searchQuery) {
        rentals.filterByQuery(searchQuery)
    }
    val filteredOrganizations = remember(organizations, searchQuery) {
        organizations.filterByQuery(searchQuery)
    }
    val organizationLookup = remember(organizations, rentals) {
        (organizations + rentals).associateBy { organization -> organization.id }
    }
    val organizationPlaces = remember(filteredOrganizations) {
        filteredOrganizations.mapNotNull { organization -> organization.toMvpPlaceOrNull() }
    }
    val rentalPlaces = remember(filteredRentals) {
        filteredRentals.mapNotNull { organization -> organization.toMvpPlaceOrNull() }
    }

    val currentListScrollingUp = when (selectedTab) {
        DiscoverTab.EVENTS -> eventsScrollingUp
        DiscoverTab.ORGANIZATIONS -> organizationsScrollingUp
        DiscoverTab.RENTALS -> rentalsScrollingUp
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

    LaunchedEffect(showMapCard, selectedTab, events, organizationPlaces, rentalPlaces) {
        if (!showMapCard) {
            return@LaunchedEffect
        }
        when (selectedTab) {
            DiscoverTab.EVENTS -> {
                mapComponent.setPlaces(emptyList())
                mapComponent.setEvents(events)
            }
            DiscoverTab.ORGANIZATIONS -> {
                mapComponent.setEvents(emptyList())
                mapComponent.setPlaces(organizationPlaces)
            }
            DiscoverTab.RENTALS -> {
                mapComponent.setEvents(emptyList())
                mapComponent.setPlaces(rentalPlaces)
            }
        }
    }

    LaunchedEffect(currentListScrollingUp, showMapCard, showingFilter, selectedTab) {
        showFab = (currentListScrollingUp || showMapCard) && !showingFilter
    }

    LaunchedEffect(currentListScrollingUp, showSearchOverlay, showingFilter, searchQuery) {
        showFloatingSearch = currentListScrollingUp ||
            showSearchOverlay ||
            showingFilter ||
            searchQuery.isNotEmpty()
    }

    LaunchedEffect(selectedTab) {
        if (selectedTab != DiscoverTab.EVENTS) {
            showingFilter = false
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

    LaunchedEffect(selectedTab, organizations, isLoadingOrganizations) {
        if (selectedTab == DiscoverTab.ORGANIZATIONS && organizations.isEmpty() && !isLoadingOrganizations) {
            component.refreshOrganizations()
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
                    }

                    DiscoverTab.ORGANIZATIONS -> {
                        DiscoverOrganizationList(
                            organizations = filteredOrganizations,
                            listState = organizationsListState,
                            firstElementPadding = firstElementPadding,
                            lastElementPadding = offsetNavPadding,
                            emptyMessage = if (isLoadingOrganizations) {
                                "Loading organizations..."
                            } else if (searchQuery.isBlank()) {
                                "No organizations discovered yet."
                            } else {
                                "No organizations match your search."
                            },
                            onOrganizationClick = { organization ->
                                component.viewOrganization(organization)
                            }
                        )
                    }

                    DiscoverTab.RENTALS -> {
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
                                component.viewOrganization(
                                    organization,
                                    com.razumly.mvp.core.presentation.OrganizationDetailTab.RENTALS
                                )
                            }
                        )
                    }
                }

                EventMap(
                    component = mapComponent,
                    onEventSelected = { event ->
                        if (selectedTab == DiscoverTab.EVENTS) {
                            component.viewEvent(event)
                        }
                    },
                    onPlaceSelected = { place ->
                        val organization = organizationLookup[place.id]
                        when (selectedTab) {
                            DiscoverTab.ORGANIZATIONS -> {
                                if (organization != null) {
                                    component.viewOrganization(organization)
                                }
                            }

                            DiscoverTab.RENTALS -> {
                                if (organization != null) {
                                    component.viewOrganization(
                                        organization,
                                        com.razumly.mvp.core.presentation.OrganizationDetailTab.RENTALS
                                    )
                                }
                            }

                            else -> {}
                        }
                    },
                    canClickPOI = false,
                    focusedLocation = selectedEvent?.takeIf { selectedTab == DiscoverTab.EVENTS }?.let {
                        LatLng(it.latitude, it.longitude)
                    } ?: currentLocation ?: LatLng(0.0, 0.0),
                    focusedEvent = selectedEvent?.takeIf { selectedTab == DiscoverTab.EVENTS },
                    revealCenter = revealCenter,
                )
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

                    DiscoverTab.ORGANIZATIONS -> {
                        LazyColumn(modifier = Modifier.wrapContentSize()) {
                            if (filteredOrganizations.isEmpty()) {
                                item {
                                    EmptyDiscoverListItem(message = "No organization suggestions found.")
                                }
                            }
                            items(filteredOrganizations.take(10)) { organization ->
                                DiscoverOrganizationSuggestion(
                                    organization = organization,
                                    onClick = {
                                        component.viewOrganization(organization)
                                        showSearchOverlay = false
                                    }
                                )
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
                                        component.viewOrganization(
                                            organization,
                                            com.razumly.mvp.core.presentation.OrganizationDetailTab.RENTALS
                                        )
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
                    DiscoverTab.ORGANIZATIONS -> "Start typing to search for organizations..."
                    DiscoverTab.RENTALS -> "Start typing to search for rentals..."
                }
                EmptyDiscoverListItem(message = message)
            }
        )
    }

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

private fun Organization.toMvpPlaceOrNull(): MVPPlace? {
    val coords = coordinates ?: return null
    if (coords.size < 2) return null
    val longitude = coords[0]
    val latitude = coords[1]
    if (latitude.isNaN() || longitude.isNaN()) return null
    return MVPPlace(
        name = name,
        id = id,
        coordinates = listOf(longitude, latitude),
    )
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
internal fun RentalDetailsContent(
    selectedDate: LocalDate,
    fieldOptions: List<RentalFieldOption>,
    busyBlocks: List<RentalBusyBlock>,
    selectionsForSelectedDate: List<RentalSelectionDraft>,
    allSelectionCount: Int,
    totalPriceCents: Int,
    isLoadingFields: Boolean,
    bottomPadding: Dp,
    canGoNext: Boolean,
    validationMessage: String?,
    onSelectedDateChange: (LocalDate) -> Unit,
    onCreateSelection: (fieldId: String, startMinutes: Int) -> Unit,
    onCanUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onDeleteSelection: (selectionId: Long) -> Unit,
    onNext: () -> Unit,
) {
    val verticalScrollState = rememberScrollState()
    var viewportBoundsInWindow by remember { mutableStateOf<Rect?>(null) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(
                start = 16.dp,
                end = 16.dp,
                top = 0.dp,
                bottom = bottomPadding + 16.dp
            )
            .onGloballyPositioned { coordinates ->
                viewportBoundsInWindow = coordinates.boundsInWindow()
            },
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(
            modifier = Modifier
                .weight(1f, fill = false)
                .verticalScroll(verticalScrollState),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "Select rental slots",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 6.dp)
                )
                Text(
                    text = "Tap any available 30-minute cell to add a slot. Drag top/bottom handles to resize.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                RentalWeekSelector(
                    selectedDate = selectedDate,
                    onSelectedDateChange = onSelectedDateChange
                )

                when {
                    isLoadingFields -> {
                        Text(
                            text = "Loading fields and rental slots...",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    fieldOptions.isEmpty() -> {
                        Text(
                            text = "No fields/courts are configured for this organization.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    else -> {
                        RentalTimelineGrid(
                            selectedDate = selectedDate,
                            fieldOptions = fieldOptions,
                            busyBlocks = busyBlocks,
                            selectionsForSelectedDate = selectionsForSelectedDate,
                            verticalScrollState = verticalScrollState,
                            viewportBoundsInWindow = viewportBoundsInWindow,
                            onCreateSelection = onCreateSelection,
                            onCanUpdateSelection = onCanUpdateSelection,
                            onUpdateSelection = onUpdateSelection,
                            onDeleteSelection = onDeleteSelection,
                        )
                    }
                }

                Text(
                    text = "Selected slots: $allSelectionCount",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
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

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp),
            horizontalArrangement = Arrangement.End
        ) {
            Button(
                onClick = onNext,
                enabled = canGoNext,
            ) {
                Text("Next")
            }
        }
    }
}

@Composable
internal fun RentalConfirmationContent(
    organization: Organization,
    selections: List<ResolvedRentalSelection>,
    totalPriceCents: Int,
    topPadding: Dp,
    bottomPadding: Dp,
    validationMessage: String?,
    canContinue: Boolean,
    onBack: () -> Unit,
    onContinue: () -> Unit,
) {
    val sortedSelections = remember(selections) {
        selections.sortedBy { selection -> selection.startInstant }
    }

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
            modifier = Modifier.weight(1f, fill = false),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            TextButton(onClick = onBack) {
                Text("Back to schedule")
            }

            Text(
                text = "Confirm rentals for ${organization.name.ifBlank { "Organization" }}",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold
            )

            if (sortedSelections.isEmpty()) {
                EmptyDiscoverListItem(
                    message = "No rental selections added yet."
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f, fill = false),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(sortedSelections, key = { resolved -> resolved.selection.id }) { resolved ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    text = resolved.field.displayLabel(),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = "${resolved.startInstant.toDisplayDateTime()} - ${resolved.endInstant.toDisplayDateTime()}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    text = if (resolved.slots.size == 1) {
                                        "Slot: ${resolved.slots.first().toRentalAvailabilityLabel()}"
                                    } else {
                                        "Slots: ${resolved.slots.size} selected"
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                val price = resolved.totalPriceCents
                                if (price > 0) {
                                    Text(
                                        text = "Price: ${(price / 100.0).moneyFormat()}",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                            }
                        }
                    }
                }
            }

            if (totalPriceCents > 0) {
                Text(
                    text = "Total rental: ${(totalPriceCents / 100.0).moneyFormat()}",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold
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

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp),
            horizontalArrangement = Arrangement.End
        ) {
            Button(
                onClick = onContinue,
                enabled = canContinue
            ) {
                Text("Continue to create event")
            }
        }
    }
}

@Composable
private fun RentalWeekSelector(
    selectedDate: LocalDate,
    onSelectedDateChange: (LocalDate) -> Unit,
) {
    val selectedEpochDay = remember(selectedDate) { selectedDate.toEpochDays() }
    val weekCalendarState = rememberWeekCalendarState(
        startDate = LocalDate.fromEpochDays(selectedEpochDay - 180),
        endDate = LocalDate.fromEpochDays(selectedEpochDay + 180),
        firstVisibleWeekDate = selectedDate,
        firstDayOfWeek = DayOfWeek.MONDAY,
    )

    LaunchedEffect(selectedDate) {
        weekCalendarState.animateScrollToDate(selectedDate)
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = selectedDate.format(dateFormat),
            style = MaterialTheme.typography.titleSmall
        )
        WeekCalendar(
            state = weekCalendarState,
            modifier = Modifier.fillMaxWidth(),
            weekHeader = { week ->
                RentalWeekHeader(week = week)
            },
            dayContent = { day ->
                val isSelected = day.date == selectedDate
                val isEnabled = day.position == WeekDayPosition.RangeDate
                Card(
                    modifier = Modifier
                        .padding(horizontal = 2.dp, vertical = 4.dp)
                        .clickable(enabled = isEnabled) {
                            onSelectedDateChange(day.date)
                        },
                    colors = CardDefaults.cardColors(
                        containerColor = when {
                            isSelected -> MaterialTheme.colorScheme.primary
                            else -> MaterialTheme.colorScheme.surfaceVariant
                        },
                        contentColor = when {
                            isSelected -> MaterialTheme.colorScheme.onPrimary
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        }
                    )
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        Text(
                            text = day.date.dayOfWeek.toShortLabel(),
                            style = MaterialTheme.typography.labelSmall
                        )
                        Text(
                            text = day.date.dayOfMonth.toString(),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        )
    }
}

@Composable
private fun RentalWeekHeader(week: Week) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        week.days.forEach { day ->
            Text(
                text = day.date.dayOfWeek.toShortLabel(),
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun RentalTimelineGrid(
    selectedDate: LocalDate,
    fieldOptions: List<RentalFieldOption>,
    busyBlocks: List<RentalBusyBlock>,
    selectionsForSelectedDate: List<RentalSelectionDraft>,
    verticalScrollState: ScrollState,
    viewportBoundsInWindow: Rect?,
    onCreateSelection: (fieldId: String, startMinutes: Int) -> Unit,
    onCanUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onDeleteSelection: (selectionId: Long) -> Unit,
) {
    val timelineStartMinutes = RENTAL_TIMELINE_START_MINUTES
    val timelineEndMinutes = RENTAL_TIMELINE_END_MINUTES
    val startsByMinute = remember {
        (timelineStartMinutes until timelineEndMinutes step SLOT_INTERVAL_MINUTES).toList()
    }
    val timelineHeight = remember(startsByMinute) {
        RENTAL_FIELD_HEADER_HEIGHT + (RENTAL_TIMELINE_ROW_HEIGHT * startsByMinute.size)
    }
    val timeZone = remember { TimeZone.currentSystemDefault() }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(timelineHeight)
    ) {
        Column(
            modifier = Modifier.width(RENTAL_TIME_COLUMN_WIDTH)
        ) {
            Spacer(modifier = Modifier.height(RENTAL_FIELD_HEADER_HEIGHT))
            startsByMinute.forEach { startMinutes ->
                Box(
                    modifier = Modifier
                        .height(RENTAL_TIMELINE_ROW_HEIGHT)
                        .fillMaxWidth()
                        .padding(end = 6.dp),
                    contentAlignment = Alignment.TopEnd
                ) {
                    Text(
                        text = startMinutes.toClockLabel().orEmpty(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        LazyRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(fieldOptions, key = { option -> option.field.id }) { option ->
                val selectionsForField = selectionsForSelectedDate.filter { selection ->
                    selection.fieldId == option.field.id
                }

                RentalFieldTimelineColumn(
                    option = option,
                    selectedDate = selectedDate,
                    startsByMinute = startsByMinute,
                    busyBlocks = busyBlocks,
                    selections = selectionsForField,
                    timeZone = timeZone,
                    verticalScrollState = verticalScrollState,
                    viewportBoundsInWindow = viewportBoundsInWindow,
                    onCreateSelection = onCreateSelection,
                    onCanUpdateSelection = onCanUpdateSelection,
                    onUpdateSelection = onUpdateSelection,
                    onDeleteSelection = onDeleteSelection,
                )
            }
        }
    }
}

@Composable
private fun RentalFieldTimelineColumn(
    option: RentalFieldOption,
    selectedDate: LocalDate,
    startsByMinute: List<Int>,
    busyBlocks: List<RentalBusyBlock>,
    selections: List<RentalSelectionDraft>,
    timeZone: TimeZone,
    verticalScrollState: ScrollState,
    viewportBoundsInWindow: Rect?,
    onCreateSelection: (fieldId: String, startMinutes: Int) -> Unit,
    onCanUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onDeleteSelection: (selectionId: Long) -> Unit,
) {
    val busyRanges = remember(option.field.id, busyBlocks, selectedDate, timeZone) {
        busyBlocks
            .asSequence()
            .filter { block -> block.fieldId == option.field.id }
            .mapNotNull { block ->
                block.toBusyRangeOnDate(
                    date = selectedDate,
                    timeZone = timeZone,
                )
            }
            .sortedBy { range -> range.startMinutes }
            .toList()
    }

    Card(
        modifier = Modifier.width(RENTAL_FIELD_COLUMN_WIDTH),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(RENTAL_FIELD_HEADER_HEIGHT)
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = option.field.displayLabel(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(RENTAL_TIMELINE_ROW_HEIGHT * startsByMinute.size)
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                startsByMinute.forEach { startMinutes ->
                    val endMinutes = startMinutes + SLOT_INTERVAL_MINUTES
                    val isAvailable = findMatchingSlot(
                        option = option,
                        date = selectedDate,
                        startMinutes = startMinutes,
                        endMinutes = endMinutes,
                        timeZone = timeZone,
                    ) != null
                    val isBusy = busyRanges.any { range ->
                        rangesOverlap(
                            firstStart = range.startMinutes,
                            firstEnd = range.endMinutes,
                            secondStart = startMinutes,
                            secondEnd = endMinutes,
                        )
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(RENTAL_TIMELINE_ROW_HEIGHT)
                            .border(
                                width = 1.dp,
                                color = MaterialTheme.colorScheme.outlineVariant
                            )
                            .background(
                                if (isBusy) {
                                    MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.45f)
                                } else if (isAvailable) {
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.08f)
                                } else {
                                    MaterialTheme.colorScheme.surface
                                }
                            )
                            .clickable(enabled = isAvailable && !isBusy) {
                                onCreateSelection(option.field.id, startMinutes)
                            }
                    )
                }
            }

            busyRanges.forEach { busyRange ->
                val topOffset = RENTAL_TIMELINE_ROW_HEIGHT * (
                    (busyRange.startMinutes - RENTAL_TIMELINE_START_MINUTES).toFloat() /
                        SLOT_INTERVAL_MINUTES.toFloat()
                    )
                val blockHeight = RENTAL_TIMELINE_ROW_HEIGHT * (
                    (busyRange.endMinutes - busyRange.startMinutes).toFloat() /
                        SLOT_INTERVAL_MINUTES.toFloat()
                    )
                if (blockHeight <= 0.dp) {
                    return@forEach
                }

                RentalBusyOverlayBlock(
                    busyRange = busyRange,
                    topOffset = topOffset,
                    height = blockHeight,
                )
            }

            selections.forEach { selection ->
                val offsetRows = (selection.startMinutes - RENTAL_TIMELINE_START_MINUTES) / SLOT_INTERVAL_MINUTES
                val durationRows = (selection.endMinutes - selection.startMinutes) / SLOT_INTERVAL_MINUTES
                if (durationRows <= 0) {
                    return@forEach
                }

                val topOffset = RENTAL_TIMELINE_ROW_HEIGHT * offsetRows
                val blockHeight = RENTAL_TIMELINE_ROW_HEIGHT * durationRows
                val selectedSlot = findMatchingSlot(
                    option = option,
                    date = selectedDate,
                    startMinutes = selection.startMinutes,
                    endMinutes = selection.endMinutes,
                    timeZone = timeZone,
                )
                val resolvedRange = resolveRentalRange(
                    option = option,
                    date = selectedDate,
                    startMinutes = selection.startMinutes,
                    endMinutes = selection.endMinutes,
                    timeZone = timeZone,
                )

                RentalSelectionOverlayBlock(
                    selection = selection,
                    topOffset = topOffset,
                    height = blockHeight,
                    selectionPriceCents = resolvedRange?.totalPriceCents ?: selectedSlot?.price ?: 0,
                    verticalScrollState = verticalScrollState,
                    viewportBoundsInWindow = viewportBoundsInWindow,
                    onDeleteSelection = onDeleteSelection,
                    onCanUpdateSelection = onCanUpdateSelection,
                    onUpdateSelection = onUpdateSelection,
                )
            }
        }
    }
}

@Composable
private fun RentalSelectionOverlayBlock(
    selection: RentalSelectionDraft,
    topOffset: Dp,
    height: Dp,
    selectionPriceCents: Int,
    verticalScrollState: ScrollState,
    viewportBoundsInWindow: Rect?,
    onDeleteSelection: (selectionId: Long) -> Unit,
    onCanUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
) {
    val density = LocalDensity.current
    val rowHeightPx = with(density) { RENTAL_TIMELINE_ROW_HEIGHT.toPx() }
    val autoScrollStepPx = with(density) { RENTAL_AUTO_SCROLL_STEP.toPx() }
    var topHandleDragRemainder by remember(selection.id) { mutableStateOf(0f) }
    var bottomHandleDragRemainder by remember(selection.id) { mutableStateOf(0f) }
    var previewStartMinutes by remember(selection.id, selection.startMinutes) {
        mutableStateOf(selection.startMinutes)
    }
    var previewEndMinutes by remember(selection.id, selection.endMinutes) {
        mutableStateOf(selection.endMinutes)
    }
    var activeDragHandle by remember(selection.id) { mutableStateOf<RentalDragHandle?>(null) }
    var dragPointerWindowY by remember(selection.id) { mutableStateOf<Float?>(null) }
    var topHandleBoundsInWindow by remember(selection.id) { mutableStateOf<Rect?>(null) }
    var bottomHandleBoundsInWindow by remember(selection.id) { mutableStateOf<Rect?>(null) }

    fun applyHandleDragDelta(handle: RentalDragHandle, dragDeltaPx: Float) {
        if (dragDeltaPx == 0f) {
            return
        }
        when (handle) {
            RentalDragHandle.TOP -> {
                topHandleDragRemainder += dragDeltaPx
                val steps = (topHandleDragRemainder / rowHeightPx).toInt()
                if (steps == 0) {
                    return
                }
                topHandleDragRemainder -= steps * rowHeightPx
                val proposedStart = (previewStartMinutes + (steps * SLOT_INTERVAL_MINUTES))
                    .coerceAtLeast(RENTAL_TIMELINE_START_MINUTES)
                    .coerceAtMost(previewEndMinutes - SLOT_INTERVAL_MINUTES)
                if (proposedStart != previewStartMinutes) {
                    val canApply = onCanUpdateSelection(
                        selection.id,
                        proposedStart,
                        previewEndMinutes
                    )
                    if (canApply) {
                        previewStartMinutes = proposedStart
                    } else {
                        topHandleDragRemainder = 0f
                    }
                }
            }

            RentalDragHandle.BOTTOM -> {
                bottomHandleDragRemainder += dragDeltaPx
                val steps = (bottomHandleDragRemainder / rowHeightPx).toInt()
                if (steps == 0) {
                    return
                }
                bottomHandleDragRemainder -= steps * rowHeightPx
                val proposedEnd = (previewEndMinutes + (steps * SLOT_INTERVAL_MINUTES))
                    .coerceAtLeast(previewStartMinutes + SLOT_INTERVAL_MINUTES)
                    .coerceAtMost(RENTAL_TIMELINE_END_MINUTES)
                if (proposedEnd != previewEndMinutes) {
                    val canApply = onCanUpdateSelection(
                        selection.id,
                        previewStartMinutes,
                        proposedEnd
                    )
                    if (canApply) {
                        previewEndMinutes = proposedEnd
                    } else {
                        bottomHandleDragRemainder = 0f
                    }
                }
            }
        }
    }

    LaunchedEffect(activeDragHandle, dragPointerWindowY, viewportBoundsInWindow, autoScrollStepPx) {
        val handle = activeDragHandle ?: return@LaunchedEffect
        while (isActive && activeDragHandle == handle) {
            val pointerY = dragPointerWindowY ?: break
            val viewport = viewportBoundsInWindow ?: break
            val edgeThreshold = viewport.height * RENTAL_AUTO_SCROLL_EDGE_RATIO
            val scrollDelta = when (handle) {
                RentalDragHandle.TOP -> {
                    if (pointerY <= (viewport.top + edgeThreshold)) -autoScrollStepPx else 0f
                }

                RentalDragHandle.BOTTOM -> {
                    if (pointerY >= (viewport.bottom - edgeThreshold)) autoScrollStepPx else 0f
                }
            }
            if (scrollDelta != 0f) {
                val consumedScrollDelta = verticalScrollState.scrollBy(scrollDelta)
                applyHandleDragDelta(handle, consumedScrollDelta)
            }
            delay(RENTAL_AUTO_SCROLL_FRAME_DELAY_MS)
        }
    }

    fun resetDragState() {
        activeDragHandle = null
        dragPointerWindowY = null
        topHandleDragRemainder = 0f
        bottomHandleDragRemainder = 0f
    }

    fun finishDrag() {
        val hasPendingChange = previewStartMinutes != selection.startMinutes ||
            previewEndMinutes != selection.endMinutes
        if (hasPendingChange) {
            val wasApplied = onUpdateSelection(
                selection.id,
                previewStartMinutes,
                previewEndMinutes
            )
            if (!wasApplied) {
                previewStartMinutes = selection.startMinutes
                previewEndMinutes = selection.endMinutes
            }
        }
        resetDragState()
    }

    Card(
        modifier = Modifier
            .offset(y = topOffset)
            .padding(horizontal = 4.dp, vertical = 2.dp)
            .fillMaxWidth()
            .height(height),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(start = 6.dp, end = 6.dp, top = 10.dp, bottom = 10.dp),
                verticalArrangement = Arrangement.Top
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "${selection.startMinutes.toClockLabel().orEmpty()} - ${selection.endMinutes.toClockLabel().orEmpty()}",
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "x",
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.clickable {
                            onDeleteSelection(selection.id)
                        }
                    )
                }

                selectionPriceCents.takeIf { it > 0 }?.let { priceCents ->
                    Text(
                        text = "Total: ${(priceCents / 100.0).moneyFormat()}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.9f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Box(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = (-RENTAL_DRAG_HANDLE_HALF_HEIGHT))
                    .width(RENTAL_DRAG_HANDLE_WIDTH)
                    .height(RENTAL_DRAG_HANDLE_HEIGHT)
                    .onGloballyPositioned { coordinates ->
                        topHandleBoundsInWindow = coordinates.boundsInWindow()
                    }
                    .background(
                        MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.9f),
                        RoundedCornerShape(3.dp)
                    )
                    .pointerInput(
                        selection.id,
                        rowHeightPx,
                        selection.startMinutes,
                        selection.endMinutes
                    ) {
                        detectVerticalDragGestures(
                            onDragStart = {
                                previewStartMinutes = selection.startMinutes
                                previewEndMinutes = selection.endMinutes
                                activeDragHandle = RentalDragHandle.TOP
                                dragPointerWindowY = topHandleBoundsInWindow?.center?.y
                            },
                            onDragEnd = {
                                finishDrag()
                            },
                            onDragCancel = {
                                previewStartMinutes = selection.startMinutes
                                previewEndMinutes = selection.endMinutes
                                resetDragState()
                            },
                            onVerticalDrag = { change, dragAmount ->
                                change.consume()
                                dragPointerWindowY = topHandleBoundsInWindow?.top?.plus(change.position.y)
                                applyHandleDragDelta(RentalDragHandle.TOP, dragAmount)
                            }
                        )
                    }
            )

            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .offset(y = RENTAL_DRAG_HANDLE_HALF_HEIGHT)
                    .width(RENTAL_DRAG_HANDLE_WIDTH)
                    .height(RENTAL_DRAG_HANDLE_HEIGHT)
                    .onGloballyPositioned { coordinates ->
                        bottomHandleBoundsInWindow = coordinates.boundsInWindow()
                    }
                    .background(
                        MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.9f),
                        RoundedCornerShape(3.dp)
                    )
                    .pointerInput(
                        selection.id,
                        rowHeightPx,
                        selection.startMinutes,
                        selection.endMinutes
                    ) {
                        detectVerticalDragGestures(
                            onDragStart = {
                                previewStartMinutes = selection.startMinutes
                                previewEndMinutes = selection.endMinutes
                                activeDragHandle = RentalDragHandle.BOTTOM
                                dragPointerWindowY = bottomHandleBoundsInWindow?.center?.y
                            },
                            onDragEnd = {
                                finishDrag()
                            },
                            onDragCancel = {
                                previewStartMinutes = selection.startMinutes
                                previewEndMinutes = selection.endMinutes
                                resetDragState()
                            },
                            onVerticalDrag = { change, dragAmount ->
                                change.consume()
                                dragPointerWindowY = bottomHandleBoundsInWindow?.top?.plus(change.position.y)
                                applyHandleDragDelta(RentalDragHandle.BOTTOM, dragAmount)
                            }
                        )
                    }
            )
        }
    }

    if (activeDragHandle != null) {
        val previewOffsetRows = (previewStartMinutes - RENTAL_TIMELINE_START_MINUTES) / SLOT_INTERVAL_MINUTES
        val previewDurationRows = (previewEndMinutes - previewStartMinutes) / SLOT_INTERVAL_MINUTES
        if (previewDurationRows > 0) {
            val previewTopOffset = RENTAL_TIMELINE_ROW_HEIGHT * previewOffsetRows
            val previewHeight = RENTAL_TIMELINE_ROW_HEIGHT * previewDurationRows
            Card(
                modifier = Modifier
                    .offset(y = previewTopOffset)
                    .padding(horizontal = 4.dp, vertical = 2.dp)
                    .fillMaxWidth()
                    .height(previewHeight),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.22f),
                    contentColor = Color.Transparent
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {}
        }
    }
}

@Composable
private fun RentalBusyOverlayBlock(
    busyRange: RentalBusyRange,
    topOffset: Dp,
    height: Dp,
) {
    Card(
        modifier = Modifier
            .offset(y = topOffset)
            .padding(horizontal = 4.dp, vertical = 2.dp)
            .fillMaxWidth()
            .height(height),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.75f),
            contentColor = MaterialTheme.colorScheme.onErrorContainer
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 6.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = busyRange.eventName,
                style = MaterialTheme.typography.labelSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = "Booked",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onErrorContainer.copy(alpha = 0.8f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
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

internal fun resolveRentalSelection(
    selection: RentalSelectionDraft,
    fieldOptions: List<RentalFieldOption>,
    timeZone: TimeZone,
): ResolvedRentalSelection? {
    val option = fieldOptions.firstOrNull { option -> option.field.id == selection.fieldId } ?: return null
    val startInstant = selection.date.toInstantAtMinutes(selection.startMinutes, timeZone)
    val endInstant = selection.date.toInstantAtMinutes(selection.endMinutes, timeZone)
    if (endInstant <= startInstant) {
        return null
    }

    val resolvedRange = resolveRentalRange(
        option = option,
        date = selection.date,
        startMinutes = selection.startMinutes,
        endMinutes = selection.endMinutes,
        timeZone = timeZone,
    ) ?: return null

    return ResolvedRentalSelection(
        selection = selection,
        field = option.field,
        slots = resolvedRange.slots,
        startInstant = startInstant,
        endInstant = endInstant,
        totalPriceCents = resolvedRange.totalPriceCents,
    )
}

private data class ResolvedRentalRange(
    val slots: List<TimeSlot>,
    val totalPriceCents: Int,
)

private fun resolveRentalRange(
    option: RentalFieldOption,
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
    timeZone: TimeZone,
): ResolvedRentalRange? {
    if (endMinutes <= startMinutes) {
        return null
    }
    if (startMinutes < RENTAL_TIMELINE_START_MINUTES || endMinutes > RENTAL_TIMELINE_END_MINUTES) {
        return null
    }

    var segmentStartMinutes = startMinutes
    val matchedSlots = mutableListOf<TimeSlot>()
    var totalPriceCents = 0

    while (segmentStartMinutes < endMinutes) {
        val segmentEndMinutes = (segmentStartMinutes + SLOT_INTERVAL_MINUTES)
            .coerceAtMost(endMinutes)
        val segmentStart = date.toInstantAtMinutes(segmentStartMinutes, timeZone)
        val segmentEnd = date.toInstantAtMinutes(segmentEndMinutes, timeZone)

        val matchedSlot = selectBestSlotForInterval(
            slots = option.rentalSlots,
            rangeStart = segmentStart,
            rangeEnd = segmentEnd,
            fieldId = option.field.id,
            timeZone = timeZone,
        ) ?: return null

        matchedSlots += matchedSlot
        totalPriceCents += (matchedSlot.price ?: 0).coerceAtLeast(0)
        segmentStartMinutes += SLOT_INTERVAL_MINUTES
    }

    return ResolvedRentalRange(
        slots = matchedSlots.distinctBy { slot -> slot.id },
        totalPriceCents = totalPriceCents,
    )
}

private fun selectBestSlotForInterval(
    slots: List<TimeSlot>,
    rangeStart: Instant,
    rangeEnd: Instant,
    fieldId: String,
    timeZone: TimeZone,
): TimeSlot? {
    return slots
        .asSequence()
        .filter { slot ->
            slot.matchesRentalSelection(
                rangeStart = rangeStart,
                rangeEnd = rangeEnd,
                fieldId = fieldId,
            )
        }
        .sortedWith(
            compareBy<TimeSlot> { slot -> slot.slotDurationMinutes(timeZone) }
                .thenBy { slot -> slot.price ?: Int.MAX_VALUE }
        )
        .firstOrNull()
}

private fun findMatchingSlot(
    option: RentalFieldOption,
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
    timeZone: TimeZone,
): TimeSlot? {
    if (endMinutes <= startMinutes) {
        return null
    }
    if (startMinutes < RENTAL_TIMELINE_START_MINUTES || endMinutes > RENTAL_TIMELINE_END_MINUTES) {
        return null
    }
    val startInstant = date.toInstantAtMinutes(startMinutes, timeZone)
    val endInstant = date.toInstantAtMinutes(endMinutes, timeZone)
    return selectBestSlotForInterval(
        slots = option.rentalSlots,
        rangeStart = startInstant,
        rangeEnd = endInstant,
        fieldId = option.field.id,
        timeZone = timeZone,
    )
}

internal fun rangesOverlap(
    firstStart: Int,
    firstEnd: Int,
    secondStart: Int,
    secondEnd: Int,
): Boolean {
    if (firstEnd <= firstStart || secondEnd <= secondStart) {
        return false
    }
    return firstStart < secondEnd && secondStart < firstEnd
}

internal fun canApplyRentalSelectionRange(
    selectionId: Long,
    fieldId: String,
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
    selections: List<RentalSelectionDraft>,
    fieldOptions: List<RentalFieldOption>,
    busyBlocks: List<RentalBusyBlock>,
    timeZone: TimeZone,
): Boolean {
    if (endMinutes <= startMinutes) {
        return false
    }
    if (startMinutes < RENTAL_TIMELINE_START_MINUTES || endMinutes > RENTAL_TIMELINE_END_MINUTES) {
        return false
    }

    val fieldOption = fieldOptions.firstOrNull { option ->
        option.field.id == fieldId
    } ?: return false

    val overlapsSelection = selections.any { selection ->
        selection.id != selectionId &&
            selection.fieldId == fieldId &&
            selection.date == date &&
            rangesOverlap(
                selection.startMinutes,
                selection.endMinutes,
                startMinutes,
                endMinutes,
            )
    }
    if (overlapsSelection) {
        return false
    }

    val overlapsBusyBlock = busyBlocks.any { block ->
        block.fieldId == fieldId &&
            rangeOverlapsBusyBlockOnDate(
                block = block,
                date = date,
                startMinutes = startMinutes,
                endMinutes = endMinutes,
                timeZone = timeZone,
            )
    }
    if (overlapsBusyBlock) {
        return false
    }

    return isRangeCoveredByRentalAvailability(
        option = fieldOption,
        date = date,
        startMinutes = startMinutes,
        endMinutes = endMinutes,
        timeZone = timeZone,
    )
}

internal fun rangeOverlapsBusyBlockOnDate(
    block: RentalBusyBlock,
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
    timeZone: TimeZone,
): Boolean {
    if (endMinutes <= startMinutes) {
        return false
    }
    val rangeStart = date.toInstantAtMinutes(startMinutes, timeZone)
    val rangeEnd = date.toInstantAtMinutes(endMinutes, timeZone)
    return rangeStart < block.end && block.start < rangeEnd
}

internal fun isRangeCoveredByRentalAvailability(
    option: RentalFieldOption,
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
    timeZone: TimeZone,
): Boolean {
    return resolveRentalRange(
        option = option,
        date = date,
        startMinutes = startMinutes,
        endMinutes = endMinutes,
        timeZone = timeZone,
    ) != null
}

private fun RentalBusyBlock.toBusyRangeOnDate(
    date: LocalDate,
    timeZone: TimeZone,
): RentalBusyRange? {
    if (end <= start) {
        return null
    }

    val dayStart = date.toInstantAtMinutes(0, timeZone)
    val dayEnd = date.toInstantAtMinutes(24 * 60, timeZone)
    val clippedStart = if (start > dayStart) start else dayStart
    val clippedEnd = if (end < dayEnd) end else dayEnd
    if (clippedEnd <= clippedStart) {
        return null
    }

    val startMinutes = (clippedStart - dayStart).inWholeMinutes.toInt()
    val endMinutes = (clippedEnd - dayStart).inWholeMinutes.toInt()
    val normalizedStart = startMinutes.coerceIn(RENTAL_TIMELINE_START_MINUTES, RENTAL_TIMELINE_END_MINUTES)
    val normalizedEnd = endMinutes.coerceIn(RENTAL_TIMELINE_START_MINUTES, RENTAL_TIMELINE_END_MINUTES)
    if (normalizedEnd <= normalizedStart) {
        return null
    }

    return RentalBusyRange(
        eventId = eventId,
        eventName = eventName.ifBlank { "Reserved event" },
        startMinutes = normalizedStart,
        endMinutes = normalizedEnd,
    )
}

private fun LocalDate.toInstantAtMinutes(
    minutesFromStartOfDay: Int,
    timeZone: TimeZone,
): Instant {
    val startOfDay = LocalDateTime(
        year = year,
        monthNumber = monthNumber,
        dayOfMonth = dayOfMonth,
        hour = 0,
        minute = 0,
        second = 0,
        nanosecond = 0
    ).toInstant(timeZone)
    return startOfDay + minutesFromStartOfDay.minutes
}

private fun DayOfWeek.toShortLabel(): String {
    return when (this) {
        DayOfWeek.MONDAY -> "Mon"
        DayOfWeek.TUESDAY -> "Tue"
        DayOfWeek.WEDNESDAY -> "Wed"
        DayOfWeek.THURSDAY -> "Thu"
        DayOfWeek.FRIDAY -> "Fri"
        DayOfWeek.SATURDAY -> "Sat"
        DayOfWeek.SUNDAY -> "Sun"
    }
}

internal const val SLOT_INTERVAL_MINUTES = 30
private const val RENTAL_TIMELINE_START_MINUTES = 6 * 60
private const val RENTAL_TIMELINE_END_MINUTES = 24 * 60
private val RENTAL_TIME_COLUMN_WIDTH = 72.dp
private val RENTAL_FIELD_COLUMN_WIDTH = 180.dp
private val RENTAL_FIELD_HEADER_HEIGHT = 48.dp
private val RENTAL_TIMELINE_ROW_HEIGHT = 34.dp
private val RENTAL_DRAG_HANDLE_WIDTH = 26.dp
private val RENTAL_DRAG_HANDLE_HEIGHT = 6.dp
private val RENTAL_DRAG_HANDLE_HALF_HEIGHT = RENTAL_DRAG_HANDLE_HEIGHT / 2
private val RENTAL_AUTO_SCROLL_STEP = 8.dp
private const val RENTAL_AUTO_SCROLL_EDGE_RATIO = 0.25f
private const val RENTAL_AUTO_SCROLL_FRAME_DELAY_MS = 16L

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
        val slotDayIndex = toMondayBasedDayIndex(timeZone) ?: slotStartLocal.dayOfWeek.toRentalDayIndex()
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
    val dayLabel = toMondayBasedDayIndex(TimeZone.currentSystemDefault()).toDayLabel()
    return if (slotStart != null && slotEnd != null) {
        "$dayLabel $slotStart - $slotEnd"
    } else {
        "Available"
    }
}

private fun TimeSlot.slotDurationMinutes(timeZone: TimeZone): Int {
    val startMinutesValue = startTimeMinutes ?: startDate.toLocalDateTime(timeZone).let { local ->
        local.hour * 60 + local.minute
    }
    val endMinutesValue = endTimeMinutes ?: endDate?.toLocalDateTime(timeZone)?.let { local ->
        local.hour * 60 + local.minute
    } ?: return Int.MAX_VALUE

    return if (endMinutesValue > startMinutesValue) {
        endMinutesValue - startMinutesValue
    } else {
        Int.MAX_VALUE
    }
}

private fun TimeSlot.toMondayBasedDayIndex(timeZone: TimeZone): Int? {
    val startDayIndex = startDate.toLocalDateTime(timeZone).dayOfWeek.toRentalDayIndex()
    val raw = dayOfWeek?.let { value -> ((value % 7) + 7) % 7 } ?: return startDayIndex

    // Support both Monday-based (Mon=0) and Sunday-based (Sun=0) persisted values.
    val sundayBasedStartIndex = (startDayIndex + 1) % 7
    return when {
        raw == startDayIndex -> raw
        raw == sundayBasedStartIndex -> (raw + 6) % 7
        else -> raw
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
