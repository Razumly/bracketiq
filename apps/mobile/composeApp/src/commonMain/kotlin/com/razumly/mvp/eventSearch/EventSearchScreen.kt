package com.razumly.mvp.eventSearch

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.automirrored.filled.List
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Alignment
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.SearchBox
import com.razumly.mvp.core.presentation.composables.SearchOverlay
import com.razumly.mvp.core.presentation.util.isScrollingUp
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

private enum class DiscoverTab(val label: String, val searchPlaceholder: String) {
    EVENTS(label = "Events", searchPlaceholder = "Search events"),
    ORGANIZATIONS(label = "Organizations", searchPlaceholder = "Search organizations"),
    RENTALS(label = "Rentals", searchPlaceholder = "Search rentals")
}

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun EventSearchScreen(
    component: EventSearchComponent,
    mapComponent: MapComponent,
) {
    val events by component.events.collectAsState()
    val organizations by component.organizations.collectAsState()
    val rentals by component.rentals.collectAsState()
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

    val filteredOrganizations = remember(organizations, searchQuery) {
        organizations.filterByQuery(searchQuery)
    }
    val filteredRentals = remember(rentals, searchQuery) {
        rentals.filterByQuery(searchQuery)
    }
    val eventsByOrganizationId = remember(events) {
        events.mapNotNull { event -> event.organizationId?.takeIf { it.isNotBlank() } }
            .associateWith { organizationId ->
                events.count { event -> event.organizationId == organizationId }
            }
    }

    val currentListScrollingUp = when (selectedTab) {
        DiscoverTab.EVENTS -> eventsScrollingUp
        DiscoverTab.ORGANIZATIONS -> organizationsScrollingUp
        DiscoverTab.RENTALS -> rentalsScrollingUp
    }

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

    val loadingHandler = LocalLoadingHandler.current
    val popupHandler = LocalPopupHandler.current

    if (showMapCard) {
        LaunchedEffect(events) {
            mapComponent.setEvents(events)
        }
    }

    LaunchedEffect(eventsScrollingUp, showMapCard, showingFilter, selectedTab) {
        showFab = selectedTab == DiscoverTab.EVENTS && (eventsScrollingUp || showMapCard) && !showingFilter
    }

    LaunchedEffect(currentListScrollingUp, showSearchOverlay, showingFilter, searchQuery) {
        showFloatingSearch =
            currentListScrollingUp || showSearchOverlay || showingFilter || searchQuery.isNotEmpty()
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
                                onClick = { selectedTab = tab },
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

                    DiscoverTab.ORGANIZATIONS -> {
                        DiscoverOrganizationList(
                            organizations = filteredOrganizations,
                            listState = organizationsListState,
                            firstElementPadding = firstElementPadding,
                            lastElementPadding = offsetNavPadding,
                            emptyMessage = if (searchQuery.isBlank()) {
                                "No organizations discovered nearby yet."
                            } else {
                                "No organizations match your search."
                            },
                            eventsByOrganizationId = eventsByOrganizationId,
                            showRentalDetails = false
                        )
                    }

                    DiscoverTab.RENTALS -> {
                        DiscoverOrganizationList(
                            organizations = filteredRentals,
                            listState = rentalsListState,
                            firstElementPadding = firstElementPadding,
                            lastElementPadding = offsetNavPadding,
                            emptyMessage = if (searchQuery.isBlank()) {
                                "No rentals discovered nearby yet."
                            } else {
                                "No rentals match your search."
                            },
                            eventsByOrganizationId = eventsByOrganizationId,
                            showRentalDetails = true
                        )
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
                                    eventsCount = eventsByOrganizationId[organization.id] ?: 0,
                                    showRentalDetails = false,
                                    onClick = { showSearchOverlay = false }
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
                                    eventsCount = eventsByOrganizationId[organization.id] ?: 0,
                                    showRentalDetails = true,
                                    onClick = { showSearchOverlay = false }
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

@Composable
private fun DiscoverOrganizationList(
    organizations: List<Organization>,
    listState: LazyListState,
    firstElementPadding: PaddingValues,
    lastElementPadding: PaddingValues,
    emptyMessage: String,
    eventsByOrganizationId: Map<String, Int>,
    showRentalDetails: Boolean,
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
                eventsCount = eventsByOrganizationId[organization.id] ?: 0,
                showRentalDetails = showRentalDetails,
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
    eventsCount: Int,
    showRentalDetails: Boolean,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Text(
                text = organization.name.ifBlank { "Organization" },
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

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

            val detailsText = if (showRentalDetails) {
                val fieldCount = organization.fieldIds.size
                if (fieldCount == 1) {
                    "1 rentable field"
                } else {
                    "$fieldCount rentable fields"
                }
            } else {
                val eventLabel = if (eventsCount == 1) "event" else "events"
                "$eventsCount related $eventLabel"
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
    eventsCount: Int,
    showRentalDetails: Boolean,
    onClick: () -> Unit,
) {
    Card(
        Modifier
            .padding(vertical = 4.dp, horizontal = 8.dp)
            .clickable(onClick = onClick)
            .fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(8.dp)) {
            Text(
                text = organization.name.ifBlank { "Organization" },
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            val detailsText = if (showRentalDetails) {
                val fieldCount = organization.fieldIds.size
                if (fieldCount == 1) "1 rentable field" else "$fieldCount rentable fields"
            } else {
                val eventLabel = if (eventsCount == 1) "event" else "events"
                "$eventsCount related $eventLabel"
            }

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
