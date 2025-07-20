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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.FabPosition
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.SearchBox
import com.razumly.mvp.core.presentation.composables.SearchOverlay
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.util.LocalErrorHandler
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.home.LocalNavBarPadding
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials
import dev.chrisbanes.haze.rememberHazeState
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.compose.BindLocationTrackerEffect

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun EventSearchScreen(
    component: DefaultEventSearchComponent,
    mapComponent: MapComponent,
) {
    val events by component.events.collectAsState()
    val showMapCard by component.showMapCard.collectAsState()
    val selectedEvent by component.selectedEvent.collectAsState()
    val hazeState = rememberHazeState()
    val offsetNavPadding =
        PaddingValues(bottom = LocalNavBarPadding.current.calculateBottomPadding().plus(32.dp))
    val lazyListState = rememberLazyListState()
    var fabOffset by remember { mutableStateOf(Offset.Zero) }
    var revealCenter by remember { mutableStateOf(Offset.Zero) }
    val suggestions by component.suggestedEvents.collectAsState()
    val currentLocation by component.currentLocation.collectAsState()
    var searchQuery by remember { mutableStateOf("") }
    var showSearchOverlay by remember { mutableStateOf(false) }
    var searchBoxPosition by remember { mutableStateOf(Offset.Zero) }
    var searchBoxSize by remember { mutableStateOf(IntSize.Zero) }
    val isLoadingMore by component.isLoadingMore.collectAsState()
    val hasMoreEvents by component.hasMoreEvents.collectAsState()
    val currentFilter by component.filter.collectAsState()

    val loadingHandler = LocalLoadingHandler.current
    val errorHandler = LocalErrorHandler.current

    if (showMapCard) {
        LaunchedEffect(events) {
            mapComponent.setEvents(events)
        }
    }

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
        component.errorState.collect { error ->
            if (error != null) {
                errorHandler.showError(error.message)
            }
        }
    }

    Box {
        BindLocationTrackerEffect(component.locationTracker)
        Scaffold(
            topBar = {
                Column(
                    modifier = Modifier.wrapContentSize().hazeEffect(
                        hazeState, HazeMaterials.ultraThin(NavigationBarDefaults.containerColor)
                    ).statusBarsPadding()
                ) {
                    SearchBox(
                        placeholder = "Search for Events",
                        filter = true,
                        onChange = { query ->
                            searchQuery = query
                            component.suggestEvents(query)
                            showSearchOverlay = query.isNotEmpty()
                        },
                        onSearch = { /* Handle search */ },
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
                        onFilterChange = { update -> component.updateFilter(update) },
                        currentFilter = currentFilter,
                    )
                }
            },
            floatingActionButton = {
                AnimatedVisibility(visible = lazyListState.isScrollingUp().value || showMapCard,
                    enter = (slideInVertically { it / 2 } + fadeIn()),
                    exit = (slideOutVertically { it / 2 } + fadeOut())) {
                    Button(onClick = {
                        revealCenter = fabOffset
                        component.onMapClick()
                        mapComponent.toggleMap()
                    },
                        modifier = Modifier.padding(offsetNavPadding)
                            .onGloballyPositioned { layoutCoordinates ->
                                val boundsInWindow = layoutCoordinates.boundsInWindow()
                                fabOffset = boundsInWindow.center
                            },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.Black, contentColor = Color.White
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
            val firstElementPadding = PaddingValues(top = paddingValues.calculateTopPadding())
            Box(
                Modifier.hazeSource(hazeState).fillMaxSize()
            ) {
                EventList(
                    events = events,
                    firstElementPadding = firstElementPadding,
                    lastElementPadding = offsetNavPadding,
                    lazyListState = lazyListState,
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
                        LatLng(it.lat, it.long)
                    } ?: currentLocation ?: LatLng(0.0,0.0),
                    focusedEvent = null,
                    revealCenter = revealCenter,
                )
            }
        }

        SearchOverlay(
            isVisible = showSearchOverlay,
            searchQuery = searchQuery,
            searchBoxPosition = searchBoxPosition,
            searchBoxSize = searchBoxSize,
            onDismiss = {
                showSearchOverlay = false
            },
            suggestions = {
                LazyColumn(modifier = Modifier.wrapContentSize()) {
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
            },
            initial = {
                Card(
                    Modifier
                        .padding(vertical = 4.dp, horizontal = 8.dp)
                        .fillMaxWidth()
                ) {
                    Text(
                        text = "Start typing to search for events...",
                        modifier = Modifier.padding(8.dp),
                        overflow = TextOverflow.Ellipsis,
                        maxLines = 1,
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
            }
        )
    }
}