package com.razumly.mvp.eventSearch

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.repositories.IEventAbsRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.util.calcDistance
import com.razumly.mvp.core.util.getBounds
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.LocationTracker
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SearchEventListComponent(
    componentContext: ComponentContext,
    userRepository: IUserRepository,
    private val teamRepository: ITeamRepository,
    private val eventAbsRepository: IEventAbsRepository,
    val locationTracker: LocationTracker,
    val onEventSelected: (event: EventAbs) -> Unit,
) : ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _currentRadius = MutableStateFlow(50.0)
    val currentRadius: StateFlow<Double> = _currentRadius.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _locationStateFlow =
        locationTracker.getLocationsFlow().stateIn(scope, SharingStarted.Eagerly, null)

    private val _currentLocation = MutableStateFlow<LatLng?>(null)

    @OptIn(ExperimentalCoroutinesApi::class)
    val events = combine(_currentLocation.filterNotNull(), _currentRadius) { location, radius ->
        getBounds(radius, location.latitude, location.longitude)
    }.flatMapLatest { bounds ->
            eventAbsRepository.getEventsInBoundsFlow(bounds).map { result ->
                    result.getOrElse {
                        _error.value = "Failed to fetch events: ${it.message}"
                        Napier.e("Failed to fetch events: ${it.message}")
                        emptyList()
                    }
                }
        }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _selectedEvent = MutableStateFlow<EventAbs?>(null)
    val selectedEvent: StateFlow<EventAbs?> = _selectedEvent.asStateFlow()

    private val _showMapCard = MutableStateFlow(false)
    val showMapCard: StateFlow<Boolean> = _showMapCard.asStateFlow()

    private val backCallback = BackCallback(false) {
        _showMapCard.value = false
    }

    private val currentUser = userRepository.currentUser


    init {
        backHandler.register(backCallback)

        scope.launch {
            _showMapCard.collect {
                backCallback.isEnabled = it
            }
        }

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
                currentRadius.collect {
                        if (_locationStateFlow.value != null) {
                            getEvents()
                        }
                    }
            } catch (e: Exception) {
                _error.value = "Failed to update events: ${e.message}"
            }
        }
    }

    fun selectRadius(radius: Double) {
        _currentRadius.value = radius
    }

    fun onMapClick(event: EventAbs? = null) {
        _selectedEvent.value = event
        _showMapCard.value = !_showMapCard.value
    }

    fun viewEvent(event: EventAbs) {
        onEventSelected(event)
    }

    private suspend fun getEvents() {
        _isLoading.value = true
        _error.value = null

        val radius = _currentRadius.value
        val currentLocation = _currentLocation.value ?: run {
            _error.value = "Location not available"
            return
        }
        val currentBounds = getBounds(radius, currentLocation.latitude, currentLocation.longitude)

        eventAbsRepository.getEventsInBounds(currentBounds).onSuccess {
            _isLoading.value = false
        }.onFailure { e ->
            _error.value = "Failed to fetch events: ${e.message}"
        }
    }
}

