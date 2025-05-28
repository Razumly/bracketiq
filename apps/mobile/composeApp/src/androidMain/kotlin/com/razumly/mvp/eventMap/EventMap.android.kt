package com.razumly.mvp.eventMap

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.gms.maps.model.PointOfInterest
import com.google.android.libraries.places.api.model.Place
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.presentation.util.CircularRevealShape
import com.razumly.mvp.core.util.toGoogle
import dev.icerock.moko.geo.compose.BindLocationTrackerEffect
import io.github.aakira.napier.Napier
import kotlinx.coroutines.launch

@Composable
actual fun EventMap(
    component: MapComponent,
    onEventSelected: (event: EventAbs) -> Unit,
    onPlaceSelected: (place: MVPPlace) -> Unit,
    canClickPOI: Boolean,
    modifier: Modifier,
    focusedLocation: dev.icerock.moko.geo.LatLng?,
    focusedEvent: EventAbs?,
    showMap: Boolean,
    revealCenter: Offset
) {
    val selectedPlace = remember { mutableStateOf<PointOfInterest?>(null) }
    val scope = rememberCoroutineScope()
    var places by remember { mutableStateOf<List<Place>>(listOf()) }
    val events by component.events.collectAsState()
    val defaultZoom = 12f
    val defaultDurationMs = 1000
    val initCameraState = focusedLocation?.toGoogle()
    val cameraPositionState = rememberCameraPositionState()
    val currentLocation by component.currentLocation.collectAsState()

    val animationProgress by animateFloatAsState(
        targetValue = if (showMap) 1f else 0f, animationSpec = tween(durationMillis = 1000)
    )
    BindLocationTrackerEffect(component.locationTracker)

    LaunchedEffect(initCameraState, currentLocation) {
        if (initCameraState != null) {
            cameraPositionState.move(
                CameraUpdateFactory.newLatLngZoom(
                    initCameraState,
                    defaultZoom
                )
            )
        } else if (currentLocation != null) {
            cameraPositionState.move(
                CameraUpdateFactory.newLatLngZoom(
                    currentLocation!!.toGoogle(),
                    defaultZoom
                )
            )
        }
    }
    var currentCameraState by remember { mutableStateOf(cameraPositionState) }

    LaunchedEffect(cameraPositionState) {
        snapshotFlow { cameraPositionState }
            .collect { newTarget ->
                currentCameraState = newTarget
            }
    }

    Box(
        modifier = modifier.fillMaxSize()
            .graphicsLayer {
            alpha = if (animationProgress > 0f) 1f else 0f
        }.clip(CircularRevealShape(animationProgress, revealCenter)),
    ) {
        BindLocationTrackerEffect(component.locationTracker)
        LaunchedEffect(currentLocation) {
            currentLocation?.let { validLoc ->
                val target = validLoc.toGoogle()

                if (focusedEvent == null) {
                    cameraPositionState.animate(
                        CameraUpdateFactory.newLatLngZoom(target, defaultZoom),
                        defaultDurationMs
                    )
                }
            }
        }
        GoogleMap(
            modifier = Modifier
                .fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(isMyLocationEnabled = true),
            uiSettings = MapUiSettings(zoomControlsEnabled = false),
            onPOIClick = { poi ->
                if (canClickPOI) {
                    scope.launch {
                        selectedPlace.value = poi
                        cameraPositionState.animate(
                            CameraUpdateFactory.newCameraPosition(
                                CameraPosition.fromLatLngZoom(
                                    poi.latLng,
                                    defaultZoom
                                )
                            )
                        )
                    }
                }
            }
        ) {
            selectedPlace.value?.let { poi ->
                val state = rememberUpdatedMarkerState(poi.latLng)
                state.showInfoWindow()
                scope.launch {
                    onPlaceSelected(component.getPlace(poi.placeId))
                    selectedPlace.value = null
                }
                Marker(
                    state = state,
                    title = poi.name,
                    onClick = {
                        state.showInfoWindow()
                        true
                    }
                )
            }
            if (!canClickPOI) {
                events.forEach { event ->
                    val eventPosition = LatLng(event.lat, event.long)
                    val state = rememberUpdatedMarkerState(eventPosition)
                    Marker(
                        state = state,
                        title = event.name,
                        snippet = "${event.fieldType} - $${event.price}",
                        onInfoWindowClick = { onEventSelected(event) }
                    )
                }
            }
            places.forEach { place ->
                val state = rememberUpdatedMarkerState(place.location!!)
                Marker(
                    state = state,
                    title = place.displayName,
                    onClick = {
                        state.showInfoWindow()
                        scope.launch {
                            onPlaceSelected(component.getMVPPlace(place))
                        }
                        true
                    }
                )
            }

            focusedEvent?.let { event ->
                val eventPosition = LatLng(event.lat, event.long)
                val state = rememberUpdatedMarkerState(eventPosition)
                Marker(
                    state = state,
                    title = event.name,
                    snippet = "${event.fieldType} - $${event.price}",
                    onInfoWindowClick = { onEventSelected(event) }
                )
            }
        }

        if (canClickPOI) {
            currentCameraState.projection?.visibleRegion?.latLngBounds?.let {
                MapSearchBar(
                    Modifier
                        .padding(horizontal = 16.dp),
                    component,
                    currentCameraState.position.target,
                    it
                ) { newPlaces ->
                    selectedPlace.value = null
                    if (newPlaces.size > 1) {
                        val bounds = LatLngBounds.builder()
                        newPlaces.forEach { place ->
                            bounds.include(place.location!!)
                        }
                    } else if (newPlaces.isNotEmpty()) {
                        scope.launch {
                            val location = newPlaces.first().location!!
                            cameraPositionState.animate(
                                CameraUpdateFactory.newLatLngZoom(location, defaultZoom),
                                defaultDurationMs
                            )
                        }
                    } else {
                        // Fallback to current location
                        currentLocation?.let { validLoc ->
                            val target = validLoc.toGoogle()
                            scope.launch {
                                cameraPositionState.animate(
                                    CameraUpdateFactory.newLatLngZoom(target, defaultZoom),
                                    defaultDurationMs
                                )
                            }
                        }
                    }
                    places = newPlaces
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapSearchBar(
    modifier: Modifier,
    mapComponent: MapComponent,
    viewCenter: LatLng,
    bounds: LatLngBounds,
    onSearchResults: (List<Place>) -> Unit,
) {
    // State for query text, suggestions and active search mode
    var searchInput by remember { mutableStateOf("") }
    var suggestions by remember { mutableStateOf<List<Place>>(emptyList()) }
    var searchActive by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    val onActiveChange: (Boolean) -> Unit = { isActive ->
        searchActive = isActive
    }
    val colors1 =
        SearchBarDefaults.colors()

    val onSearch: (query: String) -> Unit = { query ->
        coroutineScope.launch {
            val results = try {
                mapComponent.searchPlaces(query, viewCenter, bounds)
            } catch (e: Exception) {
                Napier.e("Failed to get places: $e")
                emptyList()
            }
            onSearchResults(results)
            searchInput = "" // Clear search query after search
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
                    // Only get suggestions when there is some text
                    if (newQuery.isNotEmpty()) {
                        coroutineScope.launch {
                            suggestions = try {
                                mapComponent.suggestPlaces(newQuery, viewCenter)
                            } catch (e: Exception) {
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
    )
    {
        suggestions.forEach { suggestion ->
            suggestion.displayName?.let { name ->
                DropdownMenuItem(
                    text = { Text(name) },
                    onClick = {
                        searchInput = name
                        onSearch(searchInput)
                    }
                )
            }
        }
    }
}

@Composable
private fun rememberUpdatedMarkerState(newPosition: LatLng): MarkerState =
    remember { MarkerState(position = newPosition) }
        .apply { position = newPosition }