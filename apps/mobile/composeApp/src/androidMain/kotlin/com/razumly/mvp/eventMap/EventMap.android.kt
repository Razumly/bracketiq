package com.razumly.mvp.eventMap

import android.location.Geocoder
import android.location.Location
import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SearchBar
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImagePainter
import coil3.compose.rememberAsyncImagePainter
import coil3.request.ImageRequest
import coil3.request.allowHardware
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.gms.maps.model.PointOfInterest
import com.google.android.libraries.places.api.model.Place
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.MarkerInfoWindowComposable
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import com.razumly.mvp.BuildConfig
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.hasUsableCoordinates
import com.razumly.mvp.core.data.dataTypes.usableLatitudeLongitude
import com.razumly.mvp.core.network.apiBaseUrl
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.util.toGoogle
import com.razumly.mvp.eventMap.composables.MapEventCard
import com.razumly.mvp.eventMap.composables.MapEventCardCarousel
import com.razumly.mvp.eventMap.composables.MapEventClusterMarker
import com.razumly.mvp.eventMap.composables.MapEventMarker
import com.razumly.mvp.eventMap.composables.MapInitialsMarker
import com.razumly.mvp.eventMap.composables.MapPOICard
import com.razumly.mvp.eventMap.composables.MapPlaceCard
import com.razumly.mvp.eventMap.composables.MapPlaceMarker
import dev.icerock.moko.geo.compose.BindLocationTrackerEffect
import io.github.aakira.napier.Napier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Collections.emptyList
import java.util.Locale

private val DISCOVER_EVENT_MARKER_COLOR = Color(0xFF2563EB)
private val DISCOVER_ORGANIZATION_MARKER_COLOR = Color(0xFF16A34A)
private val DISCOVER_RENTAL_MARKER_COLOR = Color(0xFFF97316)
private val MAP_SELECTED_MARKER_COLOR = Color(0xFF2563EB)
private val MAP_ORIGINAL_MARKER_COLOR = Color(0xFFDC2626)
private val MAP_PLACE_MARKER_COLOR = Color(0xFF64748B)
private val MAP_EVENT_CLUSTER_TOUCH_DISTANCE = 54.dp
private const val MAP_MARKER_IMAGE_SIZE_PX = 96
private const val MAP_EVENT_CARD_IMAGE_WIDTH_PX = 560
private const val MAP_EVENT_CARD_IMAGE_HEIGHT_PX = 220

internal data class MapPinConfirmationOption(
    val index: Int,
    val key: String,
    val name: String,
    val address: String?,
)

internal fun mapPinConfirmationAccessibilityLabel(
    name: String,
    address: String?,
): String = buildString {
    append("Choose map pin for ")
    append(name)
    address
        ?.trim()
        ?.takeIf { it.isNotBlank() && !it.equals(name, ignoreCase = true) }
        ?.let { normalizedAddress ->
            append(", ")
            append(normalizedAddress)
        }
}

private fun Place.toMapPinConfirmationOption(index: Int): MapPinConfirmationOption {
    val normalizedAddress = formattedAddress?.trim()?.takeIf(String::isNotBlank)
    val normalizedName = displayName
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?: normalizedAddress
        ?: "Unknown location"
    val stableKey = id
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?: location?.let { location -> "${location.latitude},${location.longitude}" }
        ?: "$normalizedName:$index"

    return MapPinConfirmationOption(
        index = index,
        key = stableKey,
        name = normalizedName,
        address = normalizedAddress?.takeUnless { it.equals(normalizedName, ignoreCase = true) },
    )
}

private data class EventMarkerGroup(
    val key: String,
    val events: List<Event>,
    val position: LatLng,
)

private data class PendingEventMarkerGroup(
    val events: MutableList<Event>,
    var centerX: Float,
    var centerY: Float,
    var latitude: Double,
    var longitude: Double,
)

private data class MarkerImage(
    val painter: Painter?,
    val renderKey: String,
)

private fun resolveMarkerImageUrl(
    imageRef: String?,
    imageUrl: String? = null,
    width: Int = MAP_MARKER_IMAGE_SIZE_PX,
    height: Int = MAP_MARKER_IMAGE_SIZE_PX,
): String? {
    val normalizedImageUrl = imageUrl?.trim().orEmpty()
    if (normalizedImageUrl.isNotBlank()) {
        return normalizedImageUrl
    }

    val normalizedImageRef = imageRef?.trim().orEmpty()
    if (normalizedImageRef.isBlank()) {
        return null
    }

    return when {
        normalizedImageRef.startsWith("http://", ignoreCase = true) ||
            normalizedImageRef.startsWith("https://", ignoreCase = true) -> normalizedImageRef
        normalizedImageRef.startsWith("/") -> "${apiBaseUrl.trimEnd('/')}$normalizedImageRef"
        else -> getImageUrl(
            fileId = normalizedImageRef,
            width = width,
            height = height,
        )
    }
}

@Composable
private fun rememberMarkerImage(imageUrl: String?): MarkerImage {
    val normalizedUrl = imageUrl?.trim()?.takeIf { it.isNotBlank() }
    val context = LocalContext.current
    val imageRequest = remember(context, normalizedUrl) {
        normalizedUrl?.let { url ->
            ImageRequest.Builder(context)
                .data(url)
                .allowHardware(false)
                .build()
        }
    }
    val painter = rememberAsyncImagePainter(model = imageRequest)
    val painterState by painter.state.collectAsState()
    val loaded = normalizedUrl != null && painterState is AsyncImagePainter.State.Success
    return MarkerImage(
        painter = if (loaded) painter else null,
        renderKey = if (loaded) {
            "image-loaded:$normalizedUrl"
        } else {
            "image-fallback:${normalizedUrl.orEmpty()}"
        },
    )
}

@Composable
internal fun MapPinConfirmationPanel(
    options: List<MapPinConfirmationOption>,
    onConfirm: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (options.isEmpty()) return

    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 4.dp,
        shadowElevation = 6.dp,
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "Choose a map pin",
                style = MaterialTheme.typography.titleSmall,
            )
            Text(
                text = "Select the correct result below, then press Select Location.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(
                    items = options,
                    key = { option -> "${option.key}:${option.index}" },
                ) { option ->
                    OutlinedButton(
                        onClick = { onConfirm(option.index) },
                        modifier = Modifier
                            .widthIn(max = 280.dp)
                            .semantics {
                                contentDescription = mapPinConfirmationAccessibilityLabel(
                                    name = option.name,
                                    address = option.address,
                                )
                                role = Role.Button
                            },
                    ) {
                        Column {
                            Text(
                                text = "Choose ${option.name}",
                                style = MaterialTheme.typography.labelLarge,
                            )
                            option.address?.let { address ->
                                Text(
                                    text = address,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
actual fun EventMap(
    component: MapComponent,
    onEventSelected: (event: Event) -> Unit,
    onPlaceSelected: (place: MVPPlace) -> Unit,
    onPlaceSelectionPoint: (x: Float, y: Float) -> Unit,
    selectionRequiresConfirmation: Boolean,
    originalPlace: MVPPlace?,
    selectedPlace: MVPPlace?,
    onPlaceSelectionCleared: () -> Unit,
    canClickPOI: Boolean,
    organizationLogoIdsById: Map<String, String>,
    modifier: Modifier,
    focusedLocation: dev.icerock.moko.geo.LatLng,
    focusedEvent: Event?,
    showSelectedEventCards: Boolean,
    mapActionLabel: String,
    usePrimaryActionButton: Boolean,
    onBackPressed: (() -> Unit)?
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val trackedLocation by component.currentLocation.collectAsState()
    val events by component.events.collectAsState()
    val places by component.places.collectAsState()
    val clusterTouchDistancePx = with(LocalDensity.current) {
        MAP_EVENT_CLUSTER_TOUCH_DISTANCE.toPx()
    }
    val closeButtonBottomPadding =
        LocalNavBarPadding.current.calculateBottomPadding() + MAP_CLOSE_BUTTON_EXTRA_BOTTOM_PADDING
    var searchedPlaces by remember { mutableStateOf<List<Place>>(emptyList()) }
    var searchResultsAwaitingPinChoice by remember { mutableStateOf<List<Place>>(emptyList()) }
    val defaultZoom = 12f
    val defaultDurationMs = 1000
    val trackedLatLng = trackedLocation?.toGoogle()
    val requestedCameraState = focusedLocation.toGoogle()
    val hasExplicitFocusedLocation = focusedEvent != null ||
        distanceBetweenMeters(requestedCameraState, LatLng(0.0, 0.0)) > 1f
    val initCameraState = if (hasExplicitFocusedLocation) {
        requestedCameraState
    } else {
        trackedLatLng ?: requestedCameraState
    }
    val cameraPositionState = rememberCameraPositionState()
    val eventMarkerStates = remember { mutableMapOf<String, MarkerState>() }
    val placeMarkerStates = remember { mutableMapOf<String, MarkerState>() }
    val searchedPlaceMarkerStates = remember { mutableMapOf<String, MarkerState>() }
    val originalPlaceMarkerState = remember { MarkerState() }
    val selectedPlaceMarkerState = remember { MarkerState() }
    var selectedPOI by remember { mutableStateOf<PointOfInterest?>(null) }
    var selectedMapEvents by remember { mutableStateOf<List<Event>>(emptyList()) }
    var selectedMapEventIndex by remember { mutableIntStateOf(0) }
    var mapCameraTick by remember { mutableIntStateOf(0) }
    var isAnimating by remember { mutableStateOf(false) }
    val poiMarkerState = remember { MarkerState() }
    var armedPlaceId by remember { mutableStateOf<String?>(null) }
    var armedSearchedPlaceId by remember { mutableStateOf<String?>(null) }
    var armedPoiPlaceId by remember { mutableStateOf<String?>(null) }
    var hasAppliedInitialUserCameraFocus by remember { mutableStateOf(false) }
    var mapTopLeftInWindow by remember { mutableStateOf(Offset.Zero) }
    val placeSelectionHint = "Click to select"
    val userLocationMatchThresholdMeters = 10f

    fun coordinatesMatch(
        firstLatitude: Double,
        firstLongitude: Double,
        secondLatitude: Double,
        secondLongitude: Double,
        tolerance: Double = 0.000001,
    ): Boolean =
        kotlin.math.abs(firstLatitude - secondLatitude) < tolerance &&
            kotlin.math.abs(firstLongitude - secondLongitude) < tolerance

    fun sameLocation(first: MVPPlace?, second: MVPPlace?): Boolean {
        if (first == null || second == null) return false
        val firstId = first.id.trim()
        val secondId = second.id.trim()
        if (
            firstId.isNotBlank() &&
            secondId.isNotBlank() &&
            !firstId.startsWith("__") &&
            !secondId.startsWith("__") &&
            firstId == secondId
        ) {
            return true
        }
        return coordinatesMatch(
            firstLatitude = first.latitude,
            firstLongitude = first.longitude,
            secondLatitude = second.latitude,
            secondLongitude = second.longitude,
        )
    }

    fun matchesSearchPlace(place: Place, selection: MVPPlace?): Boolean {
        if (selection == null) return false
        val selectionId = selection.id.trim()
        val placeId = place.id?.trim().orEmpty()
        if (
            placeId.isNotBlank() &&
            selectionId.isNotBlank() &&
            !selectionId.startsWith("__") &&
            selectionId == placeId
        ) {
            return true
        }
        val location = place.location ?: return false
        return coordinatesMatch(
            firstLatitude = selection.latitude,
            firstLongitude = selection.longitude,
            secondLatitude = location.latitude,
            secondLongitude = location.longitude,
        )
    }

    fun matchesPoi(poi: PointOfInterest?, selection: MVPPlace?): Boolean {
        if (poi == null || selection == null) return false
        val selectionId = selection.id.trim()
        if (
            poi.placeId.isNotBlank() &&
            selectionId.isNotBlank() &&
            !selectionId.startsWith("__") &&
            poi.placeId == selectionId
        ) {
            return true
        }
        return coordinatesMatch(
            firstLatitude = selection.latitude,
            firstLongitude = selection.longitude,
            secondLatitude = poi.latLng.latitude,
            secondLongitude = poi.latLng.longitude,
        )
    }

    fun overlapsExistingPlace(searchPlace: Place): Boolean =
        places.any { matchesSearchPlace(searchPlace, it) }

    fun searchPlaceMarkerKey(place: Place): String {
        val id = place.id?.trim().orEmpty()
        if (id.isNotBlank()) return "search:$id"

        val location = place.location
        if (location != null) {
            return "search:${location.latitude},${location.longitude}:${place.displayName.orEmpty()}"
        }

        return "search:${place.displayName.orEmpty()}:${place.formattedAddress.orEmpty()}"
    }

    fun eventFallbackImageId(event: Event): String? =
        event.organizationId
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let(organizationLogoIdsById::get)
            ?.trim()
            ?.takeIf(String::isNotBlank)

    fun eventMarkerImageRef(event: Event): String? =
        event.imageId
            .trim()
            .takeIf(String::isNotBlank)
            ?: eventFallbackImageId(event)

    fun eventLatLng(event: Event): LatLng {
        val (latitude, longitude) = event.usableLatitudeLongitude() ?: return LatLng(0.0, 0.0)
        return LatLng(latitude, longitude)
    }

    fun uniqueMapEvents(): List<Event> =
        (events + listOfNotNull(focusedEvent))
            .filter(Event::hasUsableCoordinates)
            .distinctBy { it.id }

    fun buildEventMarkerGroups(sourceEvents: List<Event>): List<EventMarkerGroup> {
        val projection = cameraPositionState.projection
        if (projection == null) {
            return sourceEvents.map { event ->
                EventMarkerGroup(
                    key = "event:${event.id}",
                    events = listOf(event),
                    position = eventLatLng(event),
                )
            }
        }

        val thresholdSquared = clusterTouchDistancePx * clusterTouchDistancePx
        val pendingGroups = mutableListOf<PendingEventMarkerGroup>()
        sourceEvents
            .sortedWith(compareBy<Event> { it.id }.thenBy { it.name })
            .forEach { event ->
                val coordinate = eventLatLng(event)
                val point = projection.toScreenLocation(coordinate)
                var closestGroup: PendingEventMarkerGroup? = null
                var closestDistanceSquared = Float.MAX_VALUE

                pendingGroups.forEach { group ->
                    val dx = point.x.toFloat() - group.centerX
                    val dy = point.y.toFloat() - group.centerY
                    val distanceSquared = dx * dx + dy * dy
                    if (distanceSquared <= thresholdSquared && distanceSquared < closestDistanceSquared) {
                        closestGroup = group
                        closestDistanceSquared = distanceSquared
                    }
                }

                val group = closestGroup
                if (group == null) {
                    pendingGroups += PendingEventMarkerGroup(
                        events = mutableListOf(event),
                        centerX = point.x.toFloat(),
                        centerY = point.y.toFloat(),
                        latitude = event.latitude,
                        longitude = event.longitude,
                    )
                } else {
                    val nextSize = group.events.size + 1
                    group.events += event
                    group.centerX = ((group.centerX * (nextSize - 1)) + point.x.toFloat()) / nextSize
                    group.centerY = ((group.centerY * (nextSize - 1)) + point.y.toFloat()) / nextSize
                    group.latitude = ((group.latitude * (nextSize - 1)) + event.latitude) / nextSize
                    group.longitude = ((group.longitude * (nextSize - 1)) + event.longitude) / nextSize
                }
            }

        return pendingGroups.map { group ->
            val groupedEvents = group.events.sortedWith(
                compareBy<Event> { it.name.lowercase(Locale.getDefault()) }.thenBy { it.id },
            )
            val key = if (groupedEvents.size == 1) {
                "event:${groupedEvents.first().id}"
            } else {
                "cluster:${groupedEvents.map { it.id }.sorted().joinToString("|")}"
            }
            EventMarkerGroup(
                key = key,
                events = groupedEvents,
                position = LatLng(group.latitude, group.longitude),
            )
        }
    }

    val distinctSelectedPlace = selectedPlace?.takeIf { !sameLocation(it, originalPlace) }
    val focusedIsCurrentUserLocation = trackedLatLng?.let { tracked ->
        distanceBetweenMeters(tracked, initCameraState) <= userLocationMatchThresholdMeters
    } == true && focusedEvent == null
    val mapEvents = remember(events, focusedEvent) { uniqueMapEvents() }
    val eventMarkerGroups = remember(mapEvents, mapCameraTick, clusterTouchDistancePx) {
        buildEventMarkerGroups(mapEvents)
    }

    val clearPendingSelection: () -> Unit = {
        selectedPOI = null
        searchedPlaces = emptyList()
        searchResultsAwaitingPinChoice = emptyList()
        armedPlaceId = null
        armedSearchedPlaceId = null
        armedPoiPlaceId = null
        onPlaceSelectionCleared()
    }

    fun localMapPointFor(latLng: LatLng): Offset? =
        cameraPositionState.projection
            ?.toScreenLocation(latLng)
            ?.let { point -> Offset(point.x.toFloat(), point.y.toFloat()) }

    fun updateRevealCenterFor(latLng: LatLng) {
        localMapPointFor(latLng)?.let { point ->
            onPlaceSelectionPoint(
                point.x + mapTopLeftInWindow.x,
                point.y + mapTopLeftInWindow.y,
            )
        }
    }

    suspend fun animateToSelectedLocation(latLng: LatLng) {
        val update = if (cameraPositionState.position.zoom > 0f) {
            CameraUpdateFactory.newLatLng(latLng)
        } else {
            CameraUpdateFactory.newLatLngZoom(latLng, defaultZoom)
        }
        cameraPositionState.animate(update, 500)
    }

    suspend fun selectSearchedPlace(searchResult: Place) {
        val markerLatLng = searchResult.location
        val selectedPlace = runCatching {
            component.getMVPPlace(searchResult)
        }.getOrElse { throwable ->
            Napier.e(
                message = "Failed to resolve searched place details. Falling back to marker data.",
                throwable = throwable,
            )
            val fallbackLatLng = markerLatLng ?: LatLng(0.0, 0.0)
            val fallbackAddress = searchResult.formattedAddress
                ?.takeIf { it.isNotBlank() }
                ?: reverseGeocodeAddress(context, fallbackLatLng)
            MVPPlace(
                name = searchResult.displayName ?: "Selected location",
                id = searchResult.id ?: "",
                coordinates = listOf(fallbackLatLng.longitude, fallbackLatLng.latitude),
                address = fallbackAddress,
            )
        }

        markerLatLng?.let { latLng ->
            animateToSelectedLocation(latLng)
            updateRevealCenterFor(latLng)
        }
        onPlaceSelected(selectedPlace)
    }

    fun chooseSearchedPlacePin(searchResult: Place) {
        searchResultsAwaitingPinChoice = emptyList()
        selectedPOI = null
        armedPlaceId = null
        armedSearchedPlaceId = null
        armedPoiPlaceId = null
        scope.launch {
            selectSearchedPlace(searchResult)
        }
    }

    suspend fun selectPoiPlace(poi: PointOfInterest) {
        val selectedPlace = runCatching {
            component.getPlace(poi.placeId)
        }.getOrElse { throwable ->
            Napier.e(
                message = "Failed to fetch POI details. Falling back to marker coordinates.",
                throwable = throwable,
            )
            val fallbackAddress = reverseGeocodeAddress(context, poi.latLng)
            MVPPlace(
                name = poi.name,
                id = poi.placeId,
                coordinates = listOf(poi.latLng.longitude, poi.latLng.latitude),
                address = fallbackAddress,
            )
        }

        updateRevealCenterFor(poi.latLng)
        onPlaceSelected(selectedPlace)
    }

    LaunchedEffect(selectedPOI) {
        selectedPOI?.let { poi ->
            poiMarkerState.position = poi.latLng
            delay(100)
            poiMarkerState.showInfoWindow()
        }
        if (selectedPOI == null) {
            armedPoiPlaceId = null
        }
    }

    LaunchedEffect(searchedPlaces) {
        armedSearchedPlaceId = null
    }

    LaunchedEffect(selectionRequiresConfirmation) {
        if (!selectionRequiresConfirmation) {
            searchResultsAwaitingPinChoice = emptyList()
        }
    }

    LaunchedEffect(cameraPositionState) {
        snapshotFlow { cameraPositionState.position }.collect { cameraPosition ->
            mapCameraTick += 1
            cameraPositionState.projection?.visibleRegion?.latLngBounds?.let { bounds ->
                component.updateCameraBounds(cameraPosition.target, bounds)
            }
        }
    }

    LaunchedEffect(eventMarkerGroups) {
        val currentGroupKeys = eventMarkerGroups.map { it.key }.toSet()
        eventMarkerStates.keys.removeAll { it !in currentGroupKeys }
        eventMarkerGroups.forEach { group ->
            val existingState = eventMarkerStates[group.key]
            if (existingState == null) {
                eventMarkerStates[group.key] = MarkerState(position = group.position)
            } else if (existingState.position != group.position) {
                existingState.position = group.position
            }
        }
    }

    LaunchedEffect(mapEvents) {
        if (selectedMapEvents.isEmpty()) return@LaunchedEffect
        val currentEventIds = mapEvents.map { it.id }.toSet()
        val retainedSelection = selectedMapEvents.filter { it.id in currentEventIds }
        selectedMapEvents = retainedSelection
        selectedMapEventIndex = selectedMapEventIndex.coerceAtMost(
            (retainedSelection.size - 1).coerceAtLeast(0),
        )
    }

    LaunchedEffect(places) {
        val currentPlaceIds = places.map { place -> place.id }.toSet()
        placeMarkerStates.keys.removeAll { placeId -> placeId !in currentPlaceIds }
    }

    LaunchedEffect(searchedPlaces) {
        val currentSearchResultIds = searchedPlaces.map(::searchPlaceMarkerKey).toSet()
        searchedPlaceMarkerStates.keys.removeAll { placeId -> placeId !in currentSearchResultIds }
    }

    LaunchedEffect(
        selectedPlace?.id,
        originalPlace?.id,
        selectedPOI?.placeId,
        selectionRequiresConfirmation,
    ) {
        if (!selectionRequiresConfirmation || selectedPlace == null) {
            placeMarkerStates.values.forEach(MarkerState::hideInfoWindow)
            searchedPlaceMarkerStates.values.forEach(MarkerState::hideInfoWindow)
            poiMarkerState.hideInfoWindow()
            originalPlaceMarkerState.hideInfoWindow()
            selectedPlaceMarkerState.hideInfoWindow()
            return@LaunchedEffect
        }

        placeMarkerStates.values.forEach(MarkerState::hideInfoWindow)
        searchedPlaceMarkerStates.values.forEach(MarkerState::hideInfoWindow)
        poiMarkerState.hideInfoWindow()
        originalPlaceMarkerState.hideInfoWindow()
        selectedPlaceMarkerState.hideInfoWindow()

        delay(100)
        when {
            places.firstOrNull { sameLocation(it, selectedPlace) } != null -> {
                val matchingPlace = places.first { sameLocation(it, selectedPlace) }
                placeMarkerStates[matchingPlace.id]?.showInfoWindow()
            }
            searchedPlaces.firstOrNull { matchesSearchPlace(it, selectedPlace) } != null -> {
                val matchingSearchPlace = searchedPlaces.first { matchesSearchPlace(it, selectedPlace) }
                searchedPlaceMarkerStates[searchPlaceMarkerKey(matchingSearchPlace)]?.showInfoWindow()
            }
            matchesPoi(selectedPOI, selectedPlace) -> {
                poiMarkerState.position = LatLng(selectedPlace.latitude, selectedPlace.longitude)
                poiMarkerState.showInfoWindow()
            }
            sameLocation(selectedPlace, originalPlace) && originalPlace != null -> {
                originalPlaceMarkerState.position = LatLng(originalPlace.latitude, originalPlace.longitude)
                originalPlaceMarkerState.showInfoWindow()
            }
            else -> {
                selectedPlaceMarkerState.position = LatLng(selectedPlace.latitude, selectedPlace.longitude)
                selectedPlaceMarkerState.showInfoWindow()
            }
        }
    }

    LaunchedEffect(initCameraState, focusedIsCurrentUserLocation) {
        if (focusedIsCurrentUserLocation) {
            if (!hasAppliedInitialUserCameraFocus) {
                val update = if (cameraPositionState.position.zoom > 0f) {
                    CameraUpdateFactory.newLatLng(initCameraState)
                } else {
                    CameraUpdateFactory.newLatLngZoom(initCameraState, defaultZoom)
                }
                cameraPositionState.move(update)
                hasAppliedInitialUserCameraFocus = true
            }
        } else {
            hasAppliedInitialUserCameraFocus = false
            cameraPositionState.move(
                CameraUpdateFactory.newLatLngZoom(initCameraState, defaultZoom),
            )
        }
    }

    BindLocationTrackerEffect(component.locationTracker)

    Box(
        modifier = modifier
            .fillMaxSize()
            .onGloballyPositioned { coordinates ->
                val bounds = coordinates.boundsInWindow()
                mapTopLeftInWindow = bounds.topLeft
            },
    ) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            googleMapOptionsFactory = {
                com.google.android.gms.maps.GoogleMapOptions()
                    .mapId(BuildConfig.MAPS_MAP_ID)
            },
            contentPadding = PaddingValues(
                top = 160.dp,
                end = MAP_ACTION_BUTTON_SCAFFOLD_BOTTOM_SPACING,
                bottom = closeButtonBottomPadding,
            ),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(isMyLocationEnabled = trackedLocation != null),
            uiSettings = MapUiSettings(
                zoomControlsEnabled = false,
                myLocationButtonEnabled = false,
            ),
            onPOIClick = { poi ->
                selectedMapEvents = emptyList()
                selectedMapEventIndex = 0
                if (canClickPOI && !isAnimating) {
                    selectedPOI = poi
                    armedPlaceId = null
                    armedSearchedPlaceId = null
                    armedPoiPlaceId = null
                    isAnimating = true
                    if (selectionRequiresConfirmation) {
                        searchResultsAwaitingPinChoice = emptyList()
                        scope.launch {
                            animateToSelectedLocation(poi.latLng)
                            selectPoiPlace(poi)
                            delay(300)
                            isAnimating = false
                        }
                    } else {
                        scope.launch {
                            cameraPositionState.animate(
                                CameraUpdateFactory.newLatLng(poi.latLng),
                                durationMs = 500,
                            )
                            delay(300)
                            isAnimating = false
                        }
                    }
                }
            },
            onMapClick = {
                selectedMapEvents = emptyList()
                selectedMapEventIndex = 0
            },
        ) {
            if (!canClickPOI) {
                eventMarkerGroups.forEach { group ->
                    key(group.key) {
                        val markerState = eventMarkerStates.getOrPut(group.key) {
                            MarkerState(position = group.position)
                        }
                        if (markerState.position != group.position) {
                            markerState.position = group.position
                        }

                        if (group.events.size == 1) {
                            val event = group.events.first()
                            val fallbackImageId = remember(event.organizationId, organizationLogoIdsById) {
                                eventFallbackImageId(event)
                            }
                            val markerImageRef = remember(event.imageId, fallbackImageId) {
                                eventMarkerImageRef(event)
                            }
                            val markerImageUrl = remember(markerImageRef) {
                                resolveMarkerImageUrl(markerImageRef)
                            }
                            val markerImage = rememberMarkerImage(markerImageUrl)
                            val cardImageRef = event.imageId.trim().takeIf(String::isNotBlank) ?: fallbackImageId
                            val cardImageUrl = remember(cardImageRef) {
                                resolveMarkerImageUrl(
                                    imageRef = cardImageRef,
                                    width = MAP_EVENT_CARD_IMAGE_WIDTH_PX,
                                    height = MAP_EVENT_CARD_IMAGE_HEIGHT_PX,
                                )
                            }
                            val cardImage = rememberMarkerImage(cardImageUrl)
                            MarkerInfoWindowComposable(
                                group.key,
                                event.name,
                                event.imageId,
                                markerImage.renderKey,
                                cardImage.renderKey,
                                state = markerState,
                                anchor = Offset(0.5f, 0.5f),
                                infoWindowAnchor = Offset(0.5f, 0.0f),
                                onClick = {
                                    eventMarkerStates.values.forEach(MarkerState::hideInfoWindow)
                                    selectedPOI = null
                                    selectedMapEvents = group.events
                                    selectedMapEventIndex = 0
                                    true
                                },
                                onInfoWindowClick = { onEventSelected(event) },
                                infoContent = {
                                    MapEventCard(
                                        event = event,
                                        imagePainter = cardImage.painter,
                                        loadImageInternally = false,
                                        fallbackImageId = fallbackImageId,
                                        modifier = Modifier.wrapContentSize(),
                                    )
                                },
                            ) {
                                MapEventMarker(
                                    event = event,
                                    backgroundColor = DISCOVER_EVENT_MARKER_COLOR,
                                    imagePainter = markerImage.painter,
                                )
                            }
                        } else {
                            MarkerInfoWindowComposable(
                                group.key,
                                group.events.size,
                                state = markerState,
                                anchor = Offset(0.5f, 0.5f),
                                infoWindowAnchor = Offset(0.5f, 0.0f),
                                onClick = {
                                    eventMarkerStates.values.forEach(MarkerState::hideInfoWindow)
                                    selectedPOI = null
                                    selectedMapEvents = group.events
                                    selectedMapEventIndex = 0
                                    true
                                },
                                onInfoWindowClick = {
                                    group.events.firstOrNull()?.let(onEventSelected)
                                },
                                infoContent = {},
                            ) {
                                MapEventClusterMarker(
                                    count = group.events.size,
                                    backgroundColor = DISCOVER_EVENT_MARKER_COLOR,
                                )
                            }
                        }
                    }
                }
            }

            places.forEach { place ->
                key("place:${place.id}") {
                    val markerState = placeMarkerStates.getOrPut(place.id) {
                        MarkerState(position = LatLng(place.latitude, place.longitude))
                    }
                    val newPosition = LatLng(place.latitude, place.longitude)
                    if (markerState.position != newPosition) {
                        markerState.position = newPosition
                    }
                    val markerColor = when {
                        sameLocation(place, distinctSelectedPlace) -> MAP_SELECTED_MARKER_COLOR
                        sameLocation(place, originalPlace) -> MAP_ORIGINAL_MARKER_COLOR
                        place.markerKind == MVPPlace.MARKER_KIND_RENTAL -> DISCOVER_RENTAL_MARKER_COLOR
                        place.markerKind == MVPPlace.MARKER_KIND_ORGANIZATION -> DISCOVER_ORGANIZATION_MARKER_COLOR
                        else -> MAP_PLACE_MARKER_COLOR
                    }
                    val markerImageUrl = remember(place.id, place.imageRef, place.imageUrl) {
                        resolveMarkerImageUrl(place.imageRef, place.imageUrl)
                    }
                    val markerImage = rememberMarkerImage(markerImageUrl)

                    MarkerInfoWindowComposable(
                        place.id,
                        place.name,
                        place.imageRef.orEmpty(),
                        place.imageUrl.orEmpty(),
                        place.markerKind,
                        markerImage.renderKey,
                        state = markerState,
                        anchor = Offset(0.5f, 0.5f),
                        infoWindowAnchor = Offset(0.5f, 0.0f),
                        onClick = {
                            if (!canClickPOI) {
                                false
                            } else if (selectionRequiresConfirmation) {
                                searchResultsAwaitingPinChoice = emptyList()
                                selectedPOI = null
                                armedPlaceId = null
                                armedSearchedPlaceId = null
                                armedPoiPlaceId = null
                                scope.launch {
                                    animateToSelectedLocation(newPosition)
                                    updateRevealCenterFor(newPosition)
                                    onPlaceSelected(place)
                                }
                                true
                            } else {
                                val isSecondTap = armedPlaceId == place.id
                                armedPlaceId = if (isSecondTap) null else place.id
                                armedSearchedPlaceId = null
                                armedPoiPlaceId = null
                                if (isSecondTap) {
                                    updateRevealCenterFor(newPosition)
                                    onPlaceSelected(place)
                                    true
                                } else {
                                    false
                                }
                            }
                        },
                        onInfoWindowClick = {
                            selectedPOI = null
                            armedPlaceId = null
                            armedSearchedPlaceId = null
                            armedPoiPlaceId = null
                            updateRevealCenterFor(newPosition)
                            onPlaceSelected(place)
                        },
                        infoContent = {
                            MapPlaceCard(
                                place = place,
                                callToAction = if (canClickPOI && !selectionRequiresConfirmation) {
                                    placeSelectionHint
                                } else {
                                    null
                                },
                                modifier = Modifier.wrapContentSize(),
                            )
                        },
                    ) {
                        MapPlaceMarker(
                            place = place,
                            backgroundColor = markerColor,
                            imagePainter = markerImage.painter,
                        )
                    }
                }
            }

            searchedPlaces.forEach { place ->
                if (overlapsExistingPlace(place)) return@forEach
                val placeMarkerKey = searchPlaceMarkerKey(place)
                key(placeMarkerKey) {
                    val markerState = searchedPlaceMarkerStates.getOrPut(placeMarkerKey) {
                        MarkerState(position = place.location!!)
                    }
                    val markerColor = when {
                        matchesSearchPlace(place, distinctSelectedPlace) -> MAP_SELECTED_MARKER_COLOR
                        matchesSearchPlace(place, originalPlace) -> MAP_ORIGINAL_MARKER_COLOR
                        else -> MAP_PLACE_MARKER_COLOR
                    }

                    MarkerInfoWindowComposable(
                        placeMarkerKey,
                        place.displayName.orEmpty(),
                        state = markerState,
                        anchor = Offset(0.5f, 0.5f),
                        infoWindowAnchor = Offset(0.5f, 0.0f),
                        onClick = {
                            if (!canClickPOI) {
                                false
                            } else if (selectionRequiresConfirmation) {
                                chooseSearchedPlacePin(place)
                                true
                            } else {
                                val isSecondTap = armedSearchedPlaceId == placeMarkerKey
                                armedPlaceId = null
                                armedPoiPlaceId = null
                                armedSearchedPlaceId = if (isSecondTap) null else placeMarkerKey
                                if (isSecondTap) {
                                    chooseSearchedPlacePin(place)
                                    true
                                } else {
                                    false
                                }
                            }
                        },
                        onInfoWindowClick = {
                            chooseSearchedPlacePin(place)
                        },
                        infoContent = {
                            MapPOICard(
                                name = place.displayName ?: "Unknown Place",
                                callToAction = if (selectionRequiresConfirmation) null else placeSelectionHint,
                                modifier = Modifier.wrapContentSize(),
                            )
                        },
                    ) {
                        MapInitialsMarker(
                            name = place.displayName ?: "Unknown Place",
                            backgroundColor = markerColor,
                        )
                    }
                }
            }

            selectedPOI?.let { poi ->
                val markerColor = when {
                    matchesPoi(poi, distinctSelectedPlace) -> MAP_SELECTED_MARKER_COLOR
                    matchesPoi(poi, originalPlace) -> MAP_ORIGINAL_MARKER_COLOR
                    else -> MAP_PLACE_MARKER_COLOR
                }
                MarkerInfoWindowComposable(
                    poi.placeId,
                    poi.name,
                    state = poiMarkerState,
                    anchor = Offset(0.5f, 0.5f),
                    infoWindowAnchor = Offset(0.5f, 0.0f),
                    onClick = {
                        if (!canClickPOI) {
                            false
                        } else if (selectionRequiresConfirmation) {
                            searchResultsAwaitingPinChoice = emptyList()
                            armedPlaceId = null
                            armedSearchedPlaceId = null
                            armedPoiPlaceId = null
                            scope.launch {
                                selectPoiPlace(poi)
                            }
                            false
                        } else {
                            val isSecondTap = armedPoiPlaceId == poi.placeId
                            armedPlaceId = null
                            armedSearchedPlaceId = null
                            armedPoiPlaceId = if (isSecondTap) null else poi.placeId
                            if (isSecondTap) {
                                scope.launch {
                                    selectPoiPlace(poi)
                                }
                                true
                            } else {
                                false
                            }
                        }
                    },
                    onInfoWindowClick = {
                        searchResultsAwaitingPinChoice = emptyList()
                        armedPlaceId = null
                        armedSearchedPlaceId = null
                        armedPoiPlaceId = null
                        scope.launch {
                            selectPoiPlace(poi)
                        }
                    },
                    infoContent = {
                        MapPOICard(
                            name = poi.name,
                            callToAction = if (selectionRequiresConfirmation) null else placeSelectionHint,
                            modifier = Modifier.wrapContentSize(),
                        )
                    },
                ) {
                    MapInitialsMarker(
                        name = poi.name,
                        backgroundColor = markerColor,
                    )
                }
            }

            originalPlace?.takeIf { selectionRequiresConfirmation }?.let { place ->
                val shouldRenderOriginalPlaceMarker =
                    place.latitude != 0.0 || place.longitude != 0.0
                val hasExistingOriginalMarker =
                    places.any { sameLocation(it, place) } ||
                        searchedPlaces.any { matchesSearchPlace(it, place) } ||
                        matchesPoi(selectedPOI, place)

                if (shouldRenderOriginalPlaceMarker && !hasExistingOriginalMarker) {
                    key("original:${place.id}:${place.latitude},${place.longitude}") {
                        originalPlaceMarkerState.position = LatLng(place.latitude, place.longitude)
                        val markerImageUrl = remember(place.id, place.imageRef, place.imageUrl) {
                            resolveMarkerImageUrl(place.imageRef, place.imageUrl)
                        }
                        val markerImage = rememberMarkerImage(markerImageUrl)
                        MarkerInfoWindowComposable(
                            place.id,
                            place.name,
                            place.imageRef.orEmpty(),
                            place.imageUrl.orEmpty(),
                            markerImage.renderKey,
                            state = originalPlaceMarkerState,
                            anchor = Offset(0.5f, 0.5f),
                            infoWindowAnchor = Offset(0.5f, 0.0f),
                            onClick = {
                                if (!canClickPOI) {
                                    false
                                } else if (selectionRequiresConfirmation) {
                                    searchResultsAwaitingPinChoice = emptyList()
                                    scope.launch {
                                        animateToSelectedLocation(originalPlaceMarkerState.position)
                                        updateRevealCenterFor(originalPlaceMarkerState.position)
                                        onPlaceSelected(place)
                                    }
                                    true
                                } else {
                                    false
                                }
                            },
                            onInfoWindowClick = {
                                if (canClickPOI && selectionRequiresConfirmation) {
                                    searchResultsAwaitingPinChoice = emptyList()
                                    scope.launch {
                                        animateToSelectedLocation(originalPlaceMarkerState.position)
                                        updateRevealCenterFor(originalPlaceMarkerState.position)
                                        onPlaceSelected(place)
                                    }
                                }
                            },
                            infoContent = {
                                MapPlaceCard(
                                    place = place,
                                    modifier = Modifier.wrapContentSize(),
                                )
                            },
                        ) {
                            MapPlaceMarker(
                                place = place,
                                backgroundColor = MAP_ORIGINAL_MARKER_COLOR,
                                imagePainter = markerImage.painter,
                            )
                        }
                    }
                }
            }

            distinctSelectedPlace?.takeIf { selectionRequiresConfirmation }?.let { place ->
                val shouldRenderSelectedPlaceMarker =
                    place.latitude != 0.0 || place.longitude != 0.0
                val hasExistingSelectedMarker =
                    places.any { sameLocation(it, place) } ||
                        searchedPlaces.any { matchesSearchPlace(it, place) } ||
                        matchesPoi(selectedPOI, place)

                if (shouldRenderSelectedPlaceMarker && !hasExistingSelectedMarker) {
                    key("selected:${place.id}:${place.latitude},${place.longitude}") {
                        selectedPlaceMarkerState.position = LatLng(place.latitude, place.longitude)
                        val markerImageUrl = remember(place.id, place.imageRef, place.imageUrl) {
                            resolveMarkerImageUrl(place.imageRef, place.imageUrl)
                        }
                        val markerImage = rememberMarkerImage(markerImageUrl)
                        MarkerInfoWindowComposable(
                            place.id,
                            place.name,
                            place.imageRef.orEmpty(),
                            place.imageUrl.orEmpty(),
                            markerImage.renderKey,
                            state = selectedPlaceMarkerState,
                            anchor = Offset(0.5f, 0.5f),
                            infoWindowAnchor = Offset(0.5f, 0.0f),
                            onClick = { true },
                            onInfoWindowClick = {},
                            infoContent = {
                                MapPlaceCard(
                                    place = place,
                                    modifier = Modifier.wrapContentSize(),
                                )
                            },
                        ) {
                            MapPlaceMarker(
                                place = place,
                                backgroundColor = MAP_SELECTED_MARKER_COLOR,
                                imagePainter = markerImage.painter,
                            )
                        }
                    }
                }
            }
        }

        if (showSelectedEventCards && selectedMapEvents.isNotEmpty()) {
            MapEventCardCarousel(
                events = selectedMapEvents,
                selectedIndex = selectedMapEventIndex,
                onSelectedIndexChange = { selectedMapEventIndex = it },
                onEventSelected = onEventSelected,
                fallbackImageIdForEvent = ::eventFallbackImageId,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = closeButtonBottomPadding + 72.dp),
            )
        }

        if (canClickPOI) {
            Column(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth(),
            ) {
                MapSearchBar(
                    modifier = Modifier.fillMaxWidth(),
                    component = component,
                ) { newPlaces ->
                    selectedPOI = null
                    searchedPlaces = newPlaces
                    searchResultsAwaitingPinChoice = if (selectionRequiresConfirmation) {
                        newPlaces
                    } else {
                        emptyList()
                    }
                    if (newPlaces.size > 1) {
                        val bounds = LatLngBounds.builder()
                        newPlaces.forEach { place ->
                            bounds.include(place.location!!)
                        }
                        scope.launch {
                            cameraPositionState.animate(
                                CameraUpdateFactory.newLatLngBounds(bounds.build(), 100),
                                defaultDurationMs,
                            )
                        }
                    } else if (newPlaces.isNotEmpty()) {
                        scope.launch {
                            val location = newPlaces.first().location
                            cameraPositionState.animate(
                                CameraUpdateFactory.newLatLng(location!!),
                                defaultDurationMs,
                            )
                        }
                    }
                }

                MapPinConfirmationPanel(
                    options = searchResultsAwaitingPinChoice.mapIndexed { index, place ->
                        place.toMapPinConfirmationOption(index)
                    },
                    onConfirm = { index ->
                        searchResultsAwaitingPinChoice
                            .getOrNull(index)
                            ?.let(::chooseSearchedPlacePin)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
        }

        trackedLatLng?.takeIf { onBackPressed == null }?.let { userLocation ->
            MapCurrentLocationButton(
                onClick = {
                    scope.launch {
                        val update = if (cameraPositionState.position.zoom > 0f) {
                            CameraUpdateFactory.newLatLng(userLocation)
                        } else {
                            CameraUpdateFactory.newLatLngZoom(userLocation, defaultZoom)
                        }
                        cameraPositionState.animate(update, defaultDurationMs)
                        hasAppliedInitialUserCameraFocus = true
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(
                        start = MAP_ACTION_BUTTON_SCAFFOLD_BOTTOM_SPACING,
                        bottom = closeButtonBottomPadding,
                    ),
            )
        }

        if (onBackPressed != null) {
            MapFloatingActionButton(
                onCloseMap = onBackPressed,
                label = mapActionLabel,
                usePrimaryActionButton = usePrimaryActionButton,
                onLeadingAction = trackedLatLng?.let { userLocation ->
                    {
                        scope.launch {
                            val update = if (cameraPositionState.position.zoom > 0f) {
                                CameraUpdateFactory.newLatLng(userLocation)
                            } else {
                                CameraUpdateFactory.newLatLngZoom(userLocation, defaultZoom)
                            }
                            cameraPositionState.animate(update, defaultDurationMs)
                            hasAppliedInitialUserCameraFocus = true
                        }
                    }
                },
                onClearSelection = if (selectionRequiresConfirmation && selectedPlace != null) {
                    clearPendingSelection
                } else {
                    null
                },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = closeButtonBottomPadding),
            )
        }
    }
}

private suspend fun reverseGeocodeAddress(
    context: android.content.Context,
    latLng: LatLng,
): String? = withContext(Dispatchers.IO) {
    if (!Geocoder.isPresent()) return@withContext null
    runCatching {
        val geocoder = Geocoder(context, Locale.getDefault())
        val addresses = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            geocoder.getFromLocation(latLng.latitude, latLng.longitude, 1)
        } else {
            @Suppress("DEPRECATION")
            geocoder.getFromLocation(latLng.latitude, latLng.longitude, 1)
        }
        addresses
            ?.firstOrNull()
            ?.getAddressLine(0)
            ?.trim()
            ?.takeIf { it.isNotBlank() }
    }.onFailure { throwable ->
        Napier.w(
            message = "Reverse geocode fallback failed: ${throwable.message}",
            tag = "EventMap.reverseGeocodeAddress",
        )
    }.getOrNull()
}

private fun distanceBetweenMeters(start: LatLng, end: LatLng): Float {
    val results = FloatArray(1)
    Location.distanceBetween(
        start.latitude,
        start.longitude,
        end.latitude,
        end.longitude,
        results,
    )
    return results[0]
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
                DropdownMenuItem(
                    text = { Text(name) },
                    onClick = {
                        searchInput = name
                        onSearch(searchInput)
                    },
                )
            }
        }
    }
}
