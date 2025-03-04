package com.razumly.mvp.eventMap

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SearchBar
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.gms.maps.model.PointOfInterest
import com.google.android.libraries.places.api.model.Place
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.compose.rememberMarkerState
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import dev.icerock.moko.geo.LatLng
import kotlinx.coroutines.launch

@Composable
actual fun EventMap(
    events: List<EventAbs>,
    currentLocation: LatLng?,
    component: MapComponent,
    onEventSelected: (event: EventAbs) -> Unit,
    onPlaceSelected: (place: MVPPlace) -> Unit,
    canClickPOI: Boolean,
) {
    val selectedLocation = remember { mutableStateOf<PointOfInterest?>(null) }
    val scope = rememberCoroutineScope()
    val places = remember { mutableStateOf<List<MVPPlace>>(listOf()) }

    Box(
        modifier = Modifier.fillMaxSize(),
    ) {
        val currentLocationGoogle = com.google.android.gms.maps.model.LatLng(
            currentLocation?.latitude ?: 0.0,
            currentLocation?.longitude ?: 0.0,
        )
        val cameraPositionState = rememberCameraPositionState {
            position = CameraPosition.fromLatLngZoom(currentLocationGoogle, 10f)
        }
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            onPOIClick = { poi ->
                if (canClickPOI) {
                    selectedLocation.value = poi
                    scope.launch {
                        cameraPositionState.animate(
                            CameraUpdateFactory.newCameraPosition(
                                CameraPosition.fromLatLngZoom(
                                    poi.latLng,
                                    10f
                                )
                            )
                        )
                    }
                }
            }
        ) {
            cameraPositionState.projection?.visibleRegion?.latLngBounds?.let {
                MapSearchBar(
                    component,
                    currentLocation ?: LatLng(0.0, 0.0),
                    100,
                    it
                ) { newPlaces ->
                    places.value = newPlaces
                }
            }
            selectedLocation.value?.let {
                val eventPosition = it.latLng
                Marker(
                    state = rememberMarkerState(position = eventPosition),
                    title = it.name
                )
            }
            events.forEach { event ->
                val eventPosition = com.google.android.gms.maps.model.LatLng(event.lat, event.long)
                Marker(
                    state = rememberMarkerState(position = eventPosition),
                    title = event.name,
                    snippet = "${event.fieldType} - $${event.price}",
                    onInfoWindowClick = { onEventSelected(event) }
                )
            }
            places.value.forEach { place ->
                val position = com.google.android.gms.maps.model.LatLng(place.lat, place.long)
                Marker(
                    state = rememberMarkerState(position = position),
                    title = place.name,
                    onInfoWindowClick = { onPlaceSelected(place) }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapSearchBar(
    mapComponent: MapComponent,
    currentLocation: LatLng,
    radius: Int = 100,
    bounds: LatLngBounds,
    onSearchResults: (List<MVPPlace>) -> Unit,
) {
    // State for query text, suggestions and active search mode
    var query by remember { mutableStateOf("") }
    var suggestions by remember { mutableStateOf<List<Place>>(emptyList()) }
    var searchActive by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    val onActiveChange: (Boolean) -> Unit = { isActive ->
        searchActive = isActive
    }
    val colors1 =
        SearchBarDefaults.colors()// When a suggestion is selected, update query and start search immediately
    // Display dropdown suggestions
    SearchBar(
        inputField = {
            SearchBarDefaults.InputField(
                query = query,
                onQueryChange = { newQuery ->
                    query = newQuery
                    // Only get suggestions when there is some text
                    if (newQuery.isNotEmpty()) {
                        coroutineScope.launch {
                            suggestions = try {
                                mapComponent.suggestPlaces(newQuery, currentLocation, radius)
                            } catch (e: Exception) {
                                emptyList()
                            }
                        }
                    } else {
                        suggestions = emptyList()
                    }
                },
                onSearch = {
                    // When search is explicitly executed, start the search with the current query
                    coroutineScope.launch {
                        val results = try {
                            mapComponent.searchPlaces(query, currentLocation, bounds)
                        } catch (e: Exception) {
                            emptyList()
                        }
                        onSearchResults(results)
                    }
                    searchActive = false
                },
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
                        query = name
                        coroutineScope.launch {
                            val results = try {
                                mapComponent.searchPlaces(
                                    name,
                                    currentLocation,
                                    bounds
                                )
                            } catch (e: Exception) {
                                emptyList()
                            }
                            onSearchResults(results)
                        }
                        searchActive = false
                    }
                )
            }
        }
    }
}