package com.razumly.mvp.eventSearch.presentation

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.razumly.mvp.core.data.IMVPRepository
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.eventList.EventListComponent
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.LocationTracker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.acos
import kotlin.math.cos
import kotlin.math.sin

class SearchEventListComponent(
    componentContext: ComponentContext,
    private val appwriteRepository: IMVPRepository,
    val locationTracker: LocationTracker,
    private val onTournamentSelected: (String) -> Unit,
) : EventListComponent, ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _events = MutableStateFlow<List<EventAbs>>(emptyList())
    override val events: StateFlow<List<EventAbs>> = _events.asStateFlow()

    private val _currentRadius = MutableStateFlow(50)
    override val currentRadius: StateFlow<Int> = _currentRadius.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _locationStateFlow = locationTracker.getLocationsFlow()
        .stateIn(scope, SharingStarted.Eagerly, null)

    private val _currentLocation = MutableStateFlow<LatLng?>(null)

    private val _selectedEvent = MutableStateFlow<EventAbs?>(null)
    override val selectedEvent: StateFlow<EventAbs?> = _selectedEvent.asStateFlow()

    init {
        scope.launch {
            try {
                _locationStateFlow.collect {
                    if (it == null) {
                        _error.value = "Location not available"
                        return@collect
                    }
                    if (_currentLocation.value == null) {
                        _currentLocation.value = it
                        getEvents()
                    }
                    if (calcDistance(_currentLocation.value!!, it) > 50) {
                        _currentLocation.value = it
                        getEvents()
                    }
                }
            } catch (e: Exception) {
                _error.value = "Failed to track location: ${e.message}"
            }
        }

        scope.launch {
            try {
                getEvents()
                currentRadius
                    .collect {
                        if (_locationStateFlow.value != null) {
                            getEvents()
                        }
                    }
            } catch (e: Exception) {
                _error.value = "Failed to update events: ${e.message}"
            }
        }
    }

    override fun selectEvent(event: EventAbs?) {
        try {
            if (event == null) return
            if (event.collectionId == "tournaments") {
                onTournamentSelected(event.id)
            }
        } catch (e: Exception) {
            _error.value = "Failed to select event: ${e.message}"
        }
    }

    private fun calcDistance(start: LatLng, end: LatLng): Double {
        return try {
            acos(
                sin(start.latitude) * sin(end.latitude) + cos(start.latitude) * cos(end.latitude) * cos(
                    end.longitude - start.longitude
                )
            ) * 3959
        } catch (e: Exception) {
            _error.value = "Failed to calculate distance: ${e.message}"
            0.0
        }
    }

    private suspend fun getEvents() {
        try {
            _isLoading.value = true
            _error.value = null

            val radius = currentRadius.value
            val currentLocation = _currentLocation.value ?: run {
                _error.value = "Location not available"
                return
            }

            val earthCircumference = 24902.0
            val deltaLatitude = 360.0 * radius / earthCircumference
            val deltaLongitude =
                deltaLatitude / cos((currentLocation.latitude.times(PI)) / 180.0)

            val currentBounds = Bounds(
                north = currentLocation.latitude + deltaLatitude,
                south = currentLocation.latitude - deltaLatitude,
                west = currentLocation.longitude - deltaLongitude,
                east = currentLocation.longitude + deltaLongitude,
            )

            _events.value = appwriteRepository.getEvents(currentBounds)
        } catch (e: Exception) {
            _error.value = "Failed to fetch events: ${e.message}"
            _events.value = emptyList()
        } finally {
            _isLoading.value = false
        }
    }
}

