package com.razumly.mvp.eventMap

import android.content.Context
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.libraries.places.api.Places
import com.google.android.libraries.places.api.model.Place
import com.google.android.libraries.places.api.model.RectangularBounds
import com.google.android.libraries.places.api.net.FetchPlaceRequest
import com.google.android.libraries.places.api.net.FindAutocompletePredictionsRequest
import com.google.android.libraries.places.api.net.PlacesClient
import com.google.android.libraries.places.api.net.SearchByTextRequest
import com.razumly.mvp.BuildConfig
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.repositories.IEventAbsRepository
import com.razumly.mvp.core.util.getBounds
import com.razumly.mvp.core.util.getCurrentLocation
import dev.icerock.moko.geo.LocationTracker
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resumeWithException

actual class MapComponent(
    componentContext: ComponentContext,
    private val eventAbsRepository: IEventAbsRepository,
    context: Context,
    val locationTracker: LocationTracker
) : ComponentContext by componentContext {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _currentLocation = MutableStateFlow<dev.icerock.moko.geo.LatLng?>(null)
    actual val currentLocation = _currentLocation.asStateFlow()

    private val _events = MutableStateFlow<List<EventAbs>>(emptyList())
    val events: StateFlow<List<EventAbs>> = _events.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _currentRadiusMeters = MutableStateFlow(50.0)

    private val _showMap = MutableStateFlow(false)
    actual val showMap = _showMap.asStateFlow()

    // Add internal bounds tracking
    private val _currentViewCenter = MutableStateFlow<LatLng?>(null)
    private val _currentBounds = MutableStateFlow<LatLngBounds?>(null)

    private val placesClient: PlacesClient by lazy {
        if (!Places.isInitialized()) {
            Places.initializeWithNewPlacesApiEnabled(context, BuildConfig.MAPS_API_KEY)
        }
        Places.createClient(context)
    }

    private val _backCallback = BackCallback {
        _showMap.value = false
    }

    init {
        backHandler.register(_backCallback)
        _backCallback.priority = BackCallback.PRIORITY_MAX
        scope.launch {
            _showMap.collect {
                _backCallback.isEnabled = it
            }
        }
        scope.launch {
            locationTracker.startTracking()
            _currentLocation.value = locationTracker.getCurrentLocation()
        }
    }

    // Add method to update camera bounds from the map
    fun updateCameraBounds(center: LatLng, bounds: LatLngBounds) {
        _currentViewCenter.value = center
        _currentBounds.value = bounds
    }

    suspend fun getMVPPlace(place: Place): MVPPlace {
        return place.toMVPPlace(placesClient)
    }

    fun setRadius(radius: Double) {
        _currentRadiusMeters.value = radius
    }

    actual fun setEvents(events: List<EventAbs>) {
        _events.value = events
    }

    actual fun toggleMap() {
        _showMap.value = !_showMap.value
    }

    suspend fun getPlace(placeId: String): MVPPlace =
        suspendCancellableCoroutine { cont ->
            val fields = listOf(
                Place.Field.ID,
                Place.Field.DISPLAY_NAME,
                Place.Field.LOCATION
            )
            val fetchPlaceRequest = FetchPlaceRequest.builder(placeId, fields).build()
            placesClient.fetchPlace(fetchPlaceRequest)
                .addOnSuccessListener { placeResponse ->
                    scope.launch {
                        val place = placeResponse.place.toMVPPlace(placesClient)
                        cont.resume(place) { cause, _, _ ->
                            Napier.d { "Cancelled fetchPlace: $cause" }
                        }
                    }
                }
                .addOnFailureListener { exception ->
                    cont.resumeWithException(exception)
                }
        }

    suspend fun suggestPlaces(query: String): List<Place> =
        suspendCancellableCoroutine { cont ->
            val viewCenter = _currentViewCenter.value ?: run {
                cont.resume(emptyList()) { cause, _, _ ->
                    Napier.d { "Cancelled autocomplete - no view center: $cause" }
                }
                return@suspendCancellableCoroutine
            }

            val request = FindAutocompletePredictionsRequest.builder()
                .setQuery(query)
                .build()

            placesClient.findAutocompletePredictions(request)
                .addOnSuccessListener { response ->
                    val results = response.autocompletePredictions.map { prediction ->
                        Place
                            .builder()
                            .setId(prediction.placeId)
                            .setDisplayName(prediction.getPrimaryText(null).toString())
                            .build()
                    }
                    cont.resume(results) { cause, _, _ ->
                        Napier.d { "Cancelled autocomplete: $cause" }
                    }
                }
                .addOnFailureListener { exception ->
                    cont.resumeWithException(exception)
                }
        }

    suspend fun searchPlaces(query: String): List<Place> =
        suspendCancellableCoroutine { cont ->
            val bounds = _currentBounds.value ?: run {
                cont.resume(emptyList()) { cause, _, _ ->
                    Napier.d { "Cancelled search - no bounds: $cause" }
                }
                return@suspendCancellableCoroutine
            }

            val fields = listOf(
                Place.Field.ID,
                Place.Field.DISPLAY_NAME,
                Place.Field.LOCATION
            )

            val request = SearchByTextRequest.builder(query, fields)
                .setLocationBias(RectangularBounds.newInstance(bounds))
                .build()

            placesClient.searchByText(request).addOnSuccessListener { response ->
                val result = response.places
                cont.resume(result) { cause, _, _ ->
                    Napier.d { "Cancelled search: $cause" }
                }
            }.addOnFailureListener { response ->
                Napier.e("Failed to search: ${response.message}")
                cont.resume(emptyList()) { cause, _, _ ->
                    Napier.d { "Cancelled search after failure: $cause" }
                }
            }
        }

    suspend fun getEvents() {
        _isLoading.value = true
        _error.value = null
        val currentLocation = _currentLocation.value ?: run {
            _error.value = "Location not available"
            return
        }

        val currentBounds = getBounds(
            _currentRadiusMeters.value,
            currentLocation.latitude,
            currentLocation.longitude
        )

        eventAbsRepository.getEventsInBounds(currentBounds).onSuccess {
            _events.value = it.first
        }.onFailure {
            _error.value = "Failed to fetch events: ${it.message}"
        }

        _isLoading.value = false
    }
}
