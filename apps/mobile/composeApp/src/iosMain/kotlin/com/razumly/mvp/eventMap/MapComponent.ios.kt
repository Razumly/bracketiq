package com.razumly.mvp.eventMap

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.instancekeeper.InstanceKeeper
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.util.getBounds
import com.razumly.mvp.core.util.jsonMVP
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.LocationTracker
import io.github.aakira.napier.Napier
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.darwin.Darwin
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonContentPolymorphicSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject

actual class MapComponent(
    componentContext: ComponentContext,
    private val eventRepository: IEventRepository,
    val locationTracker: LocationTracker,
    private val apiKey: String,
    private val bundleId: String
) : ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _currentLocation = MutableStateFlow<LatLng?>(null)
    actual val currentLocation = _currentLocation.asStateFlow()

    private val _events = MutableStateFlow<List<Event>>(emptyList())
    val events: StateFlow<List<Event>> = _events.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _isMapVisible = MutableStateFlow(false)
    val isMapVisible = _isMapVisible.asStateFlow()

    private val _currentRadiusMeters = MutableStateFlow(50.0)

    private val _showMap = MutableStateFlow(false)
    actual val showMap = _showMap.asStateFlow()

    private val httpClient = HttpClient(Darwin) {
        install(ContentNegotiation) {
            json(jsonMVP)
        }
    }

    init {
        scope.launch {
            locationTracker.startTracking()
        }

        instanceKeeper.put(
            CLEANUP_KEY,
            Cleanup(locationTracker)
        )

        scope.launch {
            locationTracker.getLocationsFlow().collect {
                _currentLocation.value = it
            }
        }
    }

    fun showMap() {
        _isMapVisible.value = true
    }

    fun hideMap() {
        _isMapVisible.value = false
    }

    fun setRadius(radius: Double) {
        _currentRadiusMeters.value = radius
    }

    actual fun setEvents(events: List<Event>) {
        _events.value = events
    }

    /**
     * Fetch full place details (including photos) via the Place Details Web Service.
     */
    suspend fun getPlace(placeId: String): MVPPlace? {
        val url = "https://places.googleapis.com/v1/places/$placeId" +
                "?fields=name,location,displayName"

        return try {
            val response = httpClient.get(url) {
                header("Content-Type", "application/json")
                header("X-Goog-Api-Key", apiKey)
            }.body<WebPlaceDetails>()

            MVPPlace(
                name = response.displayName.text,
                id = placeId,
                lat = response.location.latitude,
                long = response.location.longitude,
            )
        } catch (t: Throwable) {
            _error.value = t.message
            null
        }
    }

    /**
     * Autocomplete suggestions via the Place Autocomplete Web Service.
     */
    suspend fun suggestPlaces(
        query: String,
        latLng: LatLng
    ): List<MVPPlace> {
        val radius = _currentRadiusMeters.value
        val bias = LocationBias(
            circle = LocationBias.Circle(
                center = LatLngDto(latLng.latitude, latLng.longitude),
                radius = radius
            )
        )
        val reqBody = AutocompleteRequest(input = query, locationBias = bias)
        Napier.d("Request: $reqBody")

        return try {
            val resp = httpClient.post("https://places.googleapis.com/v1/places:autocomplete") {
                header("Content-Type", "application/json")
                header("X-Goog-Api-Key", apiKey)
                header(
                    "X-Goog-FieldMask",
                    "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text"
                )
                setBody(reqBody)
            }
            Napier.d("Response: ${resp.bodyAsText()}")
            val body: AutoCompleteResponse = resp.body()

            body.suggestions.map { sug ->
                when (sug) {
                    is Suggestion.PlacePrediction -> sug.placePrediction.let { pp ->
                        MVPPlace(
                            name = pp.text.text,
                            id = pp.placeId
                        )
                    }

                    is Suggestion.QueryPrediction -> MVPPlace(
                        name = sug.queryPrediction.text,
                        id = "Query"
                    )

                    else -> throw SerializationException("Unknown Suggestion kind: ${sug::class.simpleName}")
                }
            }
        } catch (t: Throwable) {
            _error.value = t.message
            Napier.e("Error: ${t.message}")
            emptyList()
        }
    }

    /**
     * Text search via the Place Text Search Web Service.
     */
    suspend fun searchPlaces(
        query: String,
        latLng: LatLng,
    ): List<MVPPlace> {
        val radius = _currentRadiusMeters.value
        val bias = LocationBias(
            circle = LocationBias.Circle(
                center = LatLngDto(latLng.latitude, latLng.longitude),
                radius = radius
            )
        )

        val requestBody = SearchTextRequest(
            textQuery = query,
            locationBias = bias
        )
        Napier.d("Request: $requestBody")

        return try {
            val resp = httpClient.post("https://places.googleapis.com/v1/places:searchText") {
                header("Content-Type", "application/json")
                header("X-Goog-Api-Key", apiKey)
                header("X-Goog-FieldMask", "places.displayName,places.location")
                setBody(requestBody)
            }
            Napier.d("Response: ${resp.bodyAsText()}")
            val body: SearchTextResponse = resp.body()
            body.places.map { place ->
                MVPPlace(
                    name = place.displayName.text,
                    id = place.id,
                    lat = place.location.latitude,
                    long = place.location.longitude,
                )
            }
        } catch (t: Throwable) {
            _error.value = t.message
            Napier.e("Error: ${t.message}")
            emptyList()
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

        eventRepository.getEventsInBounds(currentBounds).onSuccess {
            _events.value = it.first
        }.onFailure {
            _error.value = "Failed to fetch events: ${it.message}"
        }

        _isLoading.value = false
    }

    class Cleanup(private val locationTracker: LocationTracker) : InstanceKeeper.Instance {
        override fun onDestroy() {
            locationTracker.stopTracking()
        }
    }

    companion object {
        const val CLEANUP_KEY = "Cleanup_Map"
    }

    actual fun toggleMap() {
        _showMap.value = !_showMap.value
    }
}

/** JSON data classes **/
@Serializable
data class WebPlaceDetails(
    val displayName: LocalizedText,
    val location: LatLngDto,
    val photos: List<PhotoRef> = emptyList()
)

@Serializable
data class AuthorAttribution(val displayName: String, val uri: String, val photoUri: String)

@Serializable
data class AutocompleteRequest(
    val input: String,
    val locationBias: LocationBias
)


@Serializable
data class Prediction(
    val place: String = "",
    val placeId: String,
    val text: StructuredMainText,
)

@Serializable(with = Suggestion.Serializer::class)
sealed class Suggestion {
    @Serializable
    data class PlacePrediction(val placePrediction: Prediction) : Suggestion()

    @Serializable
    data class QueryPrediction(val queryPrediction: StructuredMainText) : Suggestion()

    object Serializer : JsonContentPolymorphicSerializer<Suggestion>(Suggestion::class) {
        override fun selectDeserializer(element: JsonElement): DeserializationStrategy<Suggestion> {
            val obj = element.jsonObject
            return when {
                "placePrediction" in obj -> PlacePrediction.serializer()
                "queryPrediction" in obj -> QueryPrediction.serializer()
                else -> throw SerializationException("Unknown Suggestion kind: $obj")
            }
        }
    }
}

@Serializable
data class AutoCompleteResponse(
    val suggestions: List<Suggestion>
)

@Serializable
data class StructuredMainText(
    val text: String,
    val matches: List<MatchText> = emptyList()
)

@Serializable
data class MatchText(
    val startOffset: Int?,
    val endOffset: Int,
)

@Serializable
private data class SearchTextRequest(
    val textQuery: String,
    val locationBias: LocationBias? = null
)

@Serializable
data class LocationBias(
    val circle: Circle
) {
    @Serializable
    data class Circle(
        val center: LatLngDto,
        val radius: Double
    )
}

@Serializable
private data class SearchTextResponse(
    val places: List<IOSGMPlace>
)

@Serializable
data class IOSGMPlace(
    val displayName: LocalizedText,
    val id: String = "",
    val photos: List<PhotoRef> = emptyList(),
    val location: LatLngDto
)

@Serializable
data class LocalizedText(val text: String, val languageCode: String)

@Serializable
data class LatLngDto(val latitude: Double, val longitude: Double)

@Serializable
data class PhotoRef(
    val name: String,
    val widthPx: Int,
    val heightPx: Int,
    val authorAttributions: List<AuthorAttribution>,
    val flagContentUri: String,
    val googleMapsUri: String
)
