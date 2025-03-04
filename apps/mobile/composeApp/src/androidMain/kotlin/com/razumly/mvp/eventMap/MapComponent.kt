package com.razumly.mvp.eventMap

import android.content.Context
import com.arkivanov.decompose.ComponentContext
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.libraries.places.api.Places
import com.google.android.libraries.places.api.model.Place
import com.google.android.libraries.places.api.model.RectangularBounds
import com.google.android.libraries.places.api.net.FetchResolvedPhotoUriRequest
import com.google.android.libraries.places.api.net.FindAutocompletePredictionsRequest
import com.google.android.libraries.places.api.net.PlacesClient
import com.google.android.libraries.places.api.net.SearchNearbyRequest
import com.razumly.mvp.BuildConfig
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.util.calcDistance
import com.razumly.mvp.core.util.getBounds
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.LocationTracker
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlin.coroutines.resumeWithException


actual class MapComponent(
    componentContext: ComponentContext,
    context: Context,
    locationTracker: LocationTracker
): ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val _locationStateFlow = locationTracker.getLocationsFlow()
        .stateIn(scope, SharingStarted.Eagerly, null)

    private val _currentLocation = MutableStateFlow<LatLng?>(null)
    actual val currentLocation = _currentLocation.asStateFlow()

    private val placesClient: PlacesClient by lazy {
        if (!Places.isInitialized()) {
            Places.initialize(context, BuildConfig.MAPS_API_KEY)
        }
        Places.createClient(context)
    }

    init {
        scope.launch {
            _locationStateFlow.collect {
                if (it == null) {
                    return@collect
                }
                if (_currentLocation.value == null) {
                    _currentLocation.value = it
                }
                if (calcDistance(_currentLocation.value!!, it) > 50) {
                    _currentLocation.value = it
                }
            }
        }
    }

    suspend fun suggestPlaces(query: String, latLng: LatLng, radius: Int): List<Place> =
        kotlinx.coroutines.suspendCancellableCoroutine { cont ->
            val currentBounds = getBounds(radius, latLng.latitude, latLng.longitude)

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
                        Napier.d{"Cancelled autocomplete: $cause"}
                    }
                }
                .addOnFailureListener { exception ->
                    cont.resumeWithException(exception)
                }
        }

    suspend fun searchPlaces(query: String, latLng: LatLng, bounds: LatLngBounds) : List<MVPPlace> =
        kotlinx.coroutines.suspendCancellableCoroutine { cont ->
            val center = com.google.android.gms.maps.model.LatLng(latLng.latitude, latLng.longitude)
            val fields = listOf(
                Place.Field.ID,
                Place.Field.DISPLAY_NAME,
                Place.Field.LOCATION,
                Place.Field.PHOTO_METADATAS
            )
            val request = SearchNearbyRequest.builder(
                RectangularBounds.newInstance(bounds),
                fields
            ).build()

            placesClient.searchNearby(request).addOnSuccessListener { response ->
                val result = response.places.map {
                    val metadata = it.photoMetadatas
                    var url = ""
                    if (metadata != null && metadata.isNotEmpty()) {
                        val photoRequest = FetchResolvedPhotoUriRequest.builder(metadata.first())
                            .setMaxWidth(500)
                            .setMaxHeight(300)
                            .build()
                        placesClient.fetchResolvedPhotoUri(photoRequest).addOnSuccessListener { response ->
                            url = response.uri?.toString() ?: ""
                        }
                    }

                    MVPPlace(
                        it.displayName ?: "",
                        it.id ?: "",
                        it.location?.latitude ?: 0.0,
                        it.location?.longitude ?: 0.0,
                        url
                    )
                }
                cont.resume(result) { cause, _, _ ->
                    Napier.d{"Cancelled search: $cause"}
                }
            }.addOnFailureListener { response ->
                Napier.e("Failed to search: ${response.message}")
            }
        }
}