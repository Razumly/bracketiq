package com.razumly.mvp.eventSearch.presentation

import com.razumly.mvp.core.data.AppwriteRepository
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.rickclephas.kmp.observableviewmodel.ViewModel
import com.rickclephas.kmp.observableviewmodel.launch
import com.rickclephas.kmp.observableviewmodel.stateIn
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.LocationTracker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.PI
import kotlin.math.acos
import kotlin.math.cos
import kotlin.math.sin

class EventSearchViewModel(
    private val appwriteRepository: AppwriteRepository,
    locationTracker: LocationTracker
) : ViewModel() {
    private val _events = MutableStateFlow<List<EventAbs>>(emptyList())
    val events: StateFlow<List<EventAbs>> = _events.asStateFlow()

    private val _currentRadius = MutableStateFlow(50)
    val currentRadius: StateFlow<Int> = _currentRadius.asStateFlow()

    private val _locationStateFlow = locationTracker.getLocationsFlow()
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private val _currentLocation = MutableStateFlow<LatLng?>(null)

    private val _selectedEvent = MutableStateFlow<EventAbs?>(null)
    val selectedEvent: StateFlow<EventAbs?> = _selectedEvent.asStateFlow()


    init {
        viewModelScope.launch {
            _locationStateFlow.collect {
                if (it == null) {
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
        }
        viewModelScope.launch {
            getEvents()
            currentRadius
                .collect {
                    if (_locationStateFlow.value != null) {
                        getEvents()
                    }
                }
        }
    }

    suspend fun selectEvent(event: EventAbs) {
        if (event.collectionId == "tournaments") {
            _selectedEvent.value = appwriteRepository.getTournament(event.id)
        }
    }

    private fun calcDistance(start: LatLng, end: LatLng): Double {
        return acos(
            sin(start.latitude) * sin(end.latitude) + cos(start.latitude) * cos(end.latitude) * cos(
                end.longitude - start.longitude
            )
        ) * 3959
    }

    private suspend fun getEvents() {
        val radius = currentRadius.value
        val currentLocation = _currentLocation.value ?: return
        val earthCircumference = 24902.0;
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
    }
}