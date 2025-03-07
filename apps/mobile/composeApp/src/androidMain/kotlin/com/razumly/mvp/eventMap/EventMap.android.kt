package com.razumly.mvp.eventMap

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.ui.Modifier
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.libraries.places.api.model.Place
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.compose.rememberMarkerState
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MVPPlace
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
) {
    val selectedLocation = remember { mutableStateOf<MVPPlace?>(null) }
    val scope = rememberCoroutineScope()
    val places = remember { mutableStateOf<List<MVPPlace>>(listOf()) }
    val cameraPositionState = rememberCameraPositionState()
    val currentLocation by component.currentLocation.collectAsState()
    val events by component.events.collectAsState()
    val defaultZoom = 12f
    val defaultDurationMs = 1000

    Box(
        modifier = modifier.fillMaxSize(),
    ) {
        BindLocationTrackerEffect(component.locationTracker)
        LaunchedEffect(currentLocation) {
            currentLocation?.let { validLoc ->
                val target = LatLng(
                    validLoc.latitude,
                    validLoc.longitude
                )

                if (!canClickPOI) {
                    component.getEvents()
                }

                cameraPositionState.animate(
                    CameraUpdateFactory.newLatLngZoom(target, defaultZoom),
                    defaultDurationMs // Animation duration
                )
            }
        }
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            uiSettings = MapUiSettings(zoomControlsEnabled = false),
            onPOIClick = { poi ->
                if (canClickPOI) {
                    scope.launch {
                        selectedLocation.value = component.getPlace(poi.placeId)
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
            selectedLocation.value?.let { place ->
                val position = LatLng(place.lat, place.long)
                Marker(
                    state = rememberMarkerState(position = position),
                    title = place.name,
                    onClick = {
                        onPlaceSelected(place)
                        true
                    }
                )
            }
            events.forEach { event ->
                val eventPosition = LatLng(event.lat, event.long)
                Marker(
                    state = rememberMarkerState(position = eventPosition),
                    title = event.name,
                    snippet = "${event.fieldType} - $${event.price}",
                    onInfoWindowClick = { onEventSelected(event) }
                )
            }
            places.value.forEach { place ->
                val position = LatLng(place.lat, place.long)
                Marker(
                    state = rememberMarkerState(position = position),
                    title = place.name,
                    onClick = {
                        onPlaceSelected(place)
                        true
                    }
                )
            }
        }

        cameraPositionState.projection?.visibleRegion?.latLngBounds?.let {
            MapSearchBar(
                component,
                currentLocation ?: dev.icerock.moko.geo.LatLng(0.0, 0.0),
                it
            ) { newPlaces ->
                selectedLocation.value = null
                if (newPlaces.size > 1) {
                    val bounds = LatLngBounds.builder()
                    newPlaces.forEach { place ->
                        bounds.include(LatLng(place.lat, place.long))
                    }
                    scope.launch {
                        cameraPositionState.animate(
                            CameraUpdateFactory.newLatLngBounds(bounds.build(), 0),
                            defaultDurationMs
                        )
                    }
                } else if (newPlaces.isNotEmpty()) {
                    scope.launch {
                        val location = LatLng(
                            newPlaces.first().lat,
                            newPlaces.first().long
                        )
                        cameraPositionState.animate(
                            CameraUpdateFactory.newLatLngZoom(location, defaultZoom),
                            defaultDurationMs
                        )
                    }
                } else {
                    // Fallback to current location
                    currentLocation?.let { validLoc ->
                        val target = LatLng(
                            validLoc.latitude,
                            validLoc.longitude
                        )
                        scope.launch {
                            cameraPositionState.animate(
                                CameraUpdateFactory.newLatLngZoom(target, defaultZoom),
                                defaultDurationMs
                            )
                        }
                    }
                }
                places.value = newPlaces
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapSearchBar(
    mapComponent: MapComponent,
    currentLocation: dev.icerock.moko.geo.LatLng,
    bounds: LatLngBounds,
    onSearchResults: (List<MVPPlace>) -> Unit,
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
                mapComponent.searchPlaces(query, currentLocation, bounds)
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
        inputField = {
            SearchBarDefaults.InputField(
                query = searchInput,
                onQueryChange = { newQuery ->
                    searchInput = newQuery
                    // Only get suggestions when there is some text
                    if (newQuery.isNotEmpty()) {
                        coroutineScope.launch {
                            suggestions = try {
                                mapComponent.suggestPlaces(newQuery, currentLocation)
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