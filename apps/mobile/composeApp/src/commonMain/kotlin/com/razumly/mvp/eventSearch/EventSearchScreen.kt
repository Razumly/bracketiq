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
import coil3.compose.AsyncImagePainter
import coil3.compose.rememberAsyncImagePainter
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
import com.razumly.mvp.core.presentation.composables.NetworkAvatar
import com.razumly.mvp.core.presentation.composables.PullToRefreshContainer
import com.razumly.mvp.core.presentation.composables.SearchBox
import com.razumly.mvp.core.presentation.composables.SearchOverlay
import com.razumly.mvp.core.presentation.util.CircularRevealUnderlay
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventSearch.composables.EmptyDiscoverListItem
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.eventSearch.tabs.events.composables.EventsTabContent
import com.razumly.mvp.eventSearch.tabs.organizations.DiscoverOrganizationList
import com.razumly.mvp.eventSearch.tabs.organizations.toMvpPlaceOrNull
import com.razumly.mvp.eventSearch.tabs.organizations.composables.DiscoverOrganizationSuggestion
import com.razumly.mvp.eventSearch.tabs.rentals.DiscoverRentalList
import com.razumly.mvp.eventSearch.tabs.rentals.composables.DiscoverRentalSuggestion
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

internal enum class RentalDragHandle {
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

internal data class RentalBusyRange(
    val eventId: String,
    val eventName: String,
    val startMinutes: Int,
    val endMinutes: Int,
)
private val DISCOVER_FIRST_ITEM_EXTRA_TOP_GAP = 4.dp
private val DISCOVER_PULL_INDICATOR_TOP_OFFSET = 64.dp
private val DISCOVER_MAP_FAB_EXTRA_DOWN_OFFSET = 10.dp

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun EventSearchScreen(
    component: EventSearchComponent,
    mapComponent: MapComponent,
) {
    val events by component.events.collectAsState()
    val organizations by component.organizations.collectAsState()
    val allOrganizations by component.allOrganizations.collectAsState()
    val organizationSuggestions by component.suggestedOrganizations.collectAsState()
    val isLoadingOrganizations by component.isLoadingOrganizations.collectAsState()
    val rentals by component.rentals.collectAsState()
    val isLoadingRentals by component.isLoadingRentals.collectAsState()
    val isMapVisible by mapComponent.showMap.collectAsState()
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

    val organizationLookup = remember(allOrganizations, rentals) {
        (allOrganizations + rentals).associateBy { organization -> organization.id }
    }
    val organizationPlaces = remember(organizations) {
        organizations.mapNotNull { organization -> organization.toMvpPlaceOrNull() }
    }
    val rentalPlaces = remember(rentals) {
        rentals.mapNotNull { organization -> organization.toMvpPlaceOrNull() }
    }

    val currentListScrollingUp = when (selectedTab) {
        DiscoverTab.EVENTS -> eventsScrollingUp
        DiscoverTab.ORGANIZATIONS -> organizationsScrollingUp
        DiscoverTab.RENTALS -> rentalsScrollingUp
    }
    val isRefreshingCurrentTab = when (selectedTab) {
        DiscoverTab.EVENTS -> isLoadingMore
        DiscoverTab.ORGANIZATIONS -> isLoadingOrganizations
        DiscoverTab.RENTALS -> isLoadingRentals
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

    LaunchedEffect(isMapVisible, selectedTab, events, organizationPlaces, rentalPlaces) {
        if (!isMapVisible) {
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

    LaunchedEffect(currentListScrollingUp, isMapVisible, showingFilter, selectedTab) {
        showFab = (currentListScrollingUp || isMapVisible) && !showingFilter
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
        val normalizedQuery = searchQuery.trim()
        if (normalizedQuery.length < 2) {
            component.suggestEvents("")
            component.suggestOrganizations("", rentalsOnly = selectedTab == DiscoverTab.RENTALS)
            return@LaunchedEffect
        }

        delay(250)
        when (selectedTab) {
            DiscoverTab.EVENTS -> component.suggestEvents(normalizedQuery)
            DiscoverTab.ORGANIZATIONS -> component.suggestOrganizations(normalizedQuery, rentalsOnly = false)
            DiscoverTab.RENTALS -> component.suggestOrganizations(normalizedQuery, rentalsOnly = true)
        }
    }

    LaunchedEffect(selectedTab, rentals, isLoadingRentals) {
        if (selectedTab == DiscoverTab.RENTALS && rentals.isEmpty() && !isLoadingRentals) {
            component.refreshRentals()
        }
    }

    LaunchedEffect(selectedTab, allOrganizations, isLoadingOrganizations) {
        if (selectedTab == DiscoverTab.ORGANIZATIONS && allOrganizations.isEmpty() && !isLoadingOrganizations) {
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
        CircularRevealUnderlay(
            isRevealed = isMapVisible,
            revealCenterInWindow = revealCenter,
            modifier = Modifier.fillMaxSize(),
            backgroundContent = {
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
                    modifier = Modifier.fillMaxSize(),
                    onBackPressed = mapComponent::toggleMap,
                )
            },
            foregroundContent = {
                Box(modifier = Modifier.fillMaxSize()) {
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
                            if (!isMapVisible) {
                                revealCenter = fabOffset
                            }
                            component.onMapClick()
                            mapComponent.toggleMap()
                        },
                        modifier = Modifier
                            .padding(offsetNavPadding)
                            .offset(y = DISCOVER_MAP_FAB_EXTRA_DOWN_OFFSET)
                            .onGloballyPositioned { layoutCoordinates ->
                                val boundsInWindow = layoutCoordinates.boundsInWindow()
                                fabOffset = boundsInWindow.center
                            },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.Black,
                            contentColor = Color.White
                        )
                    ) {
                        val text = if (isMapVisible) "List" else "Map"
                        val icon =
                            if (isMapVisible) Icons.AutoMirrored.Filled.List else Icons.Default.Place
                        Text(text)
                        Icon(icon, contentDescription = "$text Button")
                    }
                }
            },
            floatingActionButtonPosition = FabPosition.Center,
        ) { paddingValues ->
            val firstElementPadding = PaddingValues(
                top = paddingValues.calculateTopPadding().plus(72.dp + DISCOVER_FIRST_ITEM_EXTRA_TOP_GAP)
            )
            PullToRefreshContainer(
                isRefreshing = isRefreshingCurrentTab,
                onRefresh = {
                    when (selectedTab) {
                        DiscoverTab.EVENTS -> component.refreshEvents(force = true)
                        DiscoverTab.ORGANIZATIONS -> component.refreshOrganizations(force = true)
                        DiscoverTab.RENTALS -> component.refreshRentals(force = true)
                    }
                },
                modifier = Modifier.fillMaxSize(),
                enabled = !isMapVisible,
                shiftContentWithPull = true,
                indicatorTopPadding = paddingValues.calculateTopPadding()
                    .plus(DISCOVER_PULL_INDICATOR_TOP_OFFSET),
            ) {
                Box(
                    Modifier
                        .hazeSource(hazeState)
                        .fillMaxSize()
                ) {
                    when (selectedTab) {
                        DiscoverTab.EVENTS -> {
                            EventsTabContent(
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
                                organizations = organizations,
                                isLoading = isLoadingOrganizations,
                                listState = organizationsListState,
                                firstElementPadding = firstElementPadding,
                                lastElementPadding = offsetNavPadding,
                                emptyMessage = "No organizations discovered yet.",
                                onOrganizationClick = { organization ->
                                    component.viewOrganization(organization)
                                }
                            )
                        }

                        DiscoverTab.RENTALS -> {
                            DiscoverRentalList(
                                organizations = rentals,
                                isLoading = isLoadingRentals,
                                listState = rentalsListState,
                                firstElementPadding = firstElementPadding,
                                lastElementPadding = offsetNavPadding,
                                emptyMessage = "No rentals discovered nearby yet.",
                                onOrganizationClick = { organization ->
                                    component.viewOrganization(
                                        organization,
                                        com.razumly.mvp.core.presentation.OrganizationDetailTab.RENTALS
                                    )
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
                val isQueryReady = searchQuery.trim().length >= 2
                when (selectedTab) {
                    DiscoverTab.EVENTS -> {
                        LazyColumn(modifier = Modifier.wrapContentSize()) {
                            if (!isQueryReady) {
                                item {
                                    EmptyDiscoverListItem(message = "Type at least 2 characters.")
                                }
                            } else if (suggestions.isEmpty()) {
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
                            if (!isQueryReady) {
                                item {
                                    EmptyDiscoverListItem(message = "Type at least 2 characters.")
                                }
                            } else if (organizationSuggestions.isEmpty()) {
                                item {
                                    EmptyDiscoverListItem(message = "No organization suggestions found.")
                                }
                            }
                            items(organizationSuggestions) { organization ->
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
                            if (!isQueryReady) {
                                item {
                                    EmptyDiscoverListItem(message = "Type at least 2 characters.")
                                }
                            } else if (organizationSuggestions.isEmpty()) {
                                item {
                                    EmptyDiscoverListItem(message = "No rental suggestions found.")
                                }
                            }
                            items(organizationSuggestions) { organization ->
                                DiscoverRentalSuggestion(
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
            },
        )
    }

}
