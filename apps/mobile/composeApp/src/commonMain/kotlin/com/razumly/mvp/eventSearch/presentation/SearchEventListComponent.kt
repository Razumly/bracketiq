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

    private val _locationStateFlow = locationTracker.getLocationsFlow()
        .stateIn(scope, SharingStarted.Eagerly, null)

    private val _currentLocation = MutableStateFlow<LatLng?>(null)

    private val _selectedEvent = MutableStateFlow<EventAbs?>(null)
    override val selectedEvent: StateFlow<EventAbs?> = _selectedEvent.asStateFlow()

    init {
        scope.launch {
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

        scope.launch {
            getEvents()
            currentRadius
                .collect {
                    if (_locationStateFlow.value != null) {
                        getEvents()
                    }
                }
        }
    }

    override fun selectEvent(event: EventAbs?) {
        if (event!!.collectionId == "tournaments") {
            onTournamentSelected(event.id)
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
    }
}
