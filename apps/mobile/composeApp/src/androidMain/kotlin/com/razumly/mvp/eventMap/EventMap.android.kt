package com.razumly.mvp.eventMap

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SearchBar
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.gms.maps.model.PointOfInterest
import com.google.android.libraries.places.api.model.Place
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.MarkerInfoWindow
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.presentation.util.CircularRevealShape
import com.razumly.mvp.core.util.toGoogle
import com.razumly.mvp.eventMap.composables.MapEventCard
import com.razumly.mvp.eventMap.composables.MapPOICard
import dev.icerock.moko.geo.compose.BindLocationTrackerEffect
import io.github.aakira.napier.Napier
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Collections.emptyList

@Composable
actual fun EventMap(
    component: MapComponent,
    onEventSelected: (event: Event) -> Unit,
    onPlaceSelected: (place: MVPPlace) -> Unit,
    canClickPOI: Boolean,
    modifier: Modifier,
    focusedLocation: dev.icerock.moko.geo.LatLng,
    focusedEvent: Event?,
    revealCenter: Offset,
    onBackPressed: (() -> Unit)?
) {
    val scope = rememberCoroutineScope()
    val showMap by component.showMap.collectAsState()
    var searchedPlaces by remember { mutableStateOf<List<Place>>(emptyList()) }
    val events by component.events.collectAsState()
    val places by component.places.collectAsState()
    val defaultZoom = 12f
    val defaultDurationMs = 1000
    val initCameraState = focusedLocation.toGoogle()
    val cameraPositionState = rememberCameraPositionState()
    val eventMarkerStates = remember { mutableMapOf<String, MarkerState>() }
    var selectedPOI by remember { mutableStateOf<PointOfInterest?>(null) }
    var isAnimating by remember { mutableStateOf(false) }
    val poiMarkerState = remember { MarkerState() }

    LaunchedEffect(selectedPOI) {
        selectedPOI?.let { poi ->
            poiMarkerState.position = poi.latLng
            delay(100)
            poiMarkerState.showInfoWindow()
        }
    }

    LaunchedEffect(cameraPositionState) {
        snapshotFlow { cameraPositionState.position }.collect { cameraPosition ->
            cameraPositionState.projection?.visibleRegion?.latLngBounds?.let { bounds ->
                component.updateCameraBounds(cameraPosition.target, bounds)
            }
        }
    }

    LaunchedEffect(events) {
        val currentEventIds = events.map { it.id }.toSet()
        eventMarkerStates.keys.removeAll { it !in currentEventIds }
        events.forEach { event ->
            val existingState = eventMarkerStates[event.id]
            if (existingState == null) {
                eventMarkerStates[event.id] = MarkerState(position = LatLng(event.latitude, event.longitude))
            } else {
                val newPosition = LatLng(event.latitude, event.longitude)
                if (existingState.position != newPosition) {
                    existingState.position = newPosition
                }
            }
        }
    }

    val animationProgress by animateFloatAsState(
        targetValue = if (showMap) 1f else 0f, animationSpec = tween(durationMillis = 1000)
    )

    BindLocationTrackerEffect(component.locationTracker)

    if (animationProgress > 0f) {
        LaunchedEffect(initCameraState) {
            cameraPositionState.move(
                CameraUpdateFactory.newLatLngZoom(initCameraState, defaultZoom)
            )
        }

        Box(
            modifier = modifier
                .fillMaxSize()
                .clip(CircularRevealShape(animationProgress, revealCenter)),
        ) {
            GoogleMap(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 160.dp),
                cameraPositionState = cameraPositionState,
                properties = MapProperties(isMyLocationEnabled = true),
                uiSettings = MapUiSettings(zoomControlsEnabled = false),
                onPOIClick = { poi ->
                    if (canClickPOI && !isAnimating) {
                        selectedPOI = poi
                        isAnimating = true
                        scope.launch {
                            cameraPositionState.animate(
                                CameraUpdateFactory.newCameraPosition(
                                    CameraPosition.fromLatLngZoom(poi.latLng, defaultZoom)
                                ), durationMs = 500
                            )
                            delay(300)
                            isAnimating = false
                        }
                    }
                }) {

                if (!canClickPOI) {
                    events.forEach { event ->
                        val markerState = eventMarkerStates[event.id]
                        markerState?.let {
                            MarkerInfoWindow(
                                state = it,
                                icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_AZURE),
                                onClick = { marker -> false },
                                onInfoWindowClick = { marker -> onEventSelected(event) }) { marker ->
                                MapEventCard(
                                    event = event, modifier = Modifier.wrapContentSize()
                                )
                            }
                        }
                    }
                }

                places.forEach { place ->
                    val markerState = remember(place.id) {
                        MarkerState(position = LatLng(place.latitude, place.longitude))
                    }
                    val newPosition = LatLng(place.latitude, place.longitude)
                    if (markerState.position != newPosition) {
                        markerState.position = newPosition
                    }

                    MarkerInfoWindow(
                        state = markerState,
                        icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_ORANGE),
                        onClick = { marker -> false },
                        onInfoWindowClick = { marker -> onPlaceSelected(place) },
                    ) { marker ->
                        MapPOICard(
                            name = place.name,
                            modifier = Modifier.wrapContentSize()
                        )
                    }
                }

                searchedPlaces.forEach { place ->
                    val markerState = remember(place.id) {
                        MarkerState(position = place.location!!)
                    }

                    MarkerInfoWindow(
                        state = markerState,
                        icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_AZURE),
                        onClick = { marker ->
                            scope.launch {
                                onPlaceSelected(component.getMVPPlace(place))
                            }
                            false
                        },
                    ) { marker ->
                        // Info window content for searched places
                        MapPOICard(
                            name = place.displayName ?: "Unknown Place",
                            modifier = Modifier.wrapContentSize()
                        )
                    }
                }

                selectedPOI?.let { poi ->
                    MarkerInfoWindow(
                        state = poiMarkerState,
                        icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_AZURE),
                        onClick = { marker ->
                            scope.launch {
                                onPlaceSelected(component.getPlace(poi.placeId))
                            }
                            false
                        },
                    ) { marker ->
                        MapPOICard(
                            name = poi.name, modifier = Modifier.wrapContentSize()
                        )
                    }
                }

                focusedEvent?.let { event ->
                    val focusedMarkerState = remember(event.id) {
                        MarkerState(position = LatLng(event.latitude, event.longitude))
                    }
                    MarkerInfoWindow(
                        state = focusedMarkerState,
                        icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_RED),
                        onClick = { marker -> false },
                    ) { marker ->
                        MapEventCard(
                            event = event, modifier = Modifier.wrapContentSize()
                        )
                    }
                }
            }

            if (canClickPOI) {
                MapSearchBar(
                    modifier = Modifier.fillMaxWidth(),
                    component = component,
                ) { newPlaces ->
                    selectedPOI = null // Clear POI selection when searching
                    searchedPlaces = newPlaces
                    if (newPlaces.size > 1) {
                        val bounds = LatLngBounds.builder()
                        newPlaces.forEach { place ->
                            bounds.include(place.location!!)
                        }
                        scope.launch {
                            cameraPositionState.animate(
                                CameraUpdateFactory.newLatLngBounds(bounds.build(), 100),
                                defaultDurationMs
                            )
                        }
                    } else if (newPlaces.isNotEmpty()) {
                        scope.launch {
                            val location = newPlaces.first().location
                            cameraPositionState.animate(
                                CameraUpdateFactory.newLatLngZoom(location!!, defaultZoom),
                                defaultDurationMs
                            )
                        }
                    }
                }
            }

            if (onBackPressed != null) {
                MapFloatingActionButton(
                    onCloseMap = onBackPressed,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 128.dp)
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapSearchBar(
    modifier: Modifier,
    component: MapComponent,
    onSearchResults: (List<Place>) -> Unit,
) {
    var searchInput by remember { mutableStateOf("") }
    var suggestions by remember { mutableStateOf<List<Place>>(emptyList()) }
    var searchActive by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    val onActiveChange: (Boolean) -> Unit = { isActive ->
        searchActive = isActive
    }

    val colors1 = SearchBarDefaults.colors()

    val onSearch: (query: String) -> Unit = { query ->
        coroutineScope.launch {
            val results = try {
                component.searchPlaces(query)
            } catch (e: Exception) {
                Napier.e("Failed to get places: $e")
                emptyList()
            }

            onSearchResults(results)
            searchInput = ""
            suggestions = emptyList()
            searchActive = false
        }
    }

    SearchBar(
        modifier = modifier,
        inputField = {
            SearchBarDefaults.InputField(
                query = searchInput,
                onQueryChange = { newQuery ->
                    searchInput = newQuery
                    if (newQuery.isNotEmpty()) {
                        coroutineScope.launch {
                            suggestions = try {
                                component.suggestPlaces(newQuery)
                            } catch (e: Exception) {
                                Napier.d("Failed to get suggestions: $e")
                                emptyList()
                            }
                        }
                    } else {
                        suggestions = emptyList()
                    }
                },
                onSearch = onSearch,
                expanded = searchActive,
                onExpandedChange = onActiveChange,
                placeholder = { Text("Search places") },
            )
        },
        expanded = searchActive,
        onExpandedChange = onActiveChange,
        colors = colors1,
    ) {
        suggestions.forEach { suggestion ->
            suggestion.displayName?.let { name ->
                DropdownMenuItem(text = { Text(name) }, onClick = {
                    searchInput = name
                    onSearch(searchInput)
                })
            }
        }
    }
}
