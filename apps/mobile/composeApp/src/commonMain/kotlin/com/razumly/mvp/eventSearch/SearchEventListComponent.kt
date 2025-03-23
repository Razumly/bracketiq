package com.razumly.mvp.eventSearch

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.razumly.mvp.core.data.repositories.IMVPRepository
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.util.calcDistance
import com.razumly.mvp.core.util.getBounds
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

class SearchEventListComponent(
    componentContext: ComponentContext,
    private val mvpRepository: IMVPRepository,
    val locationTracker: LocationTracker,
    private val onEventSelected: (event: EventAbs) -> Unit,
) : ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _events = MutableStateFlow<List<EventAbs>>(emptyList())
    val events: StateFlow<List<EventAbs>> = _events.asStateFlow()

    private val _currentRadius = MutableStateFlow(50.0)
    val currentRadius: StateFlow<Double> = _currentRadius.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _locationStateFlow = locationTracker.getLocationsFlow()
        .stateIn(scope, SharingStarted.Eagerly, null)

    private val _currentLocation = MutableStateFlow<LatLng?>(null)

    private val _selectedEvent = MutableStateFlow<EventAbs?>(null)
    val selectedEvent: StateFlow<EventAbs?> = _selectedEvent.asStateFlow()

    private val _showMapCard = MutableStateFlow(false)
    val showMapCard: StateFlow<Boolean> = _showMapCard.asStateFlow()

    private val _validTeams = MutableStateFlow<List<TeamWithRelations>>(listOf())
    val validTeams = _validTeams.asStateFlow()

    private val backCallback = BackCallback(false) {
        _showMapCard.value = false
    }

    val currentUser = mvpRepository
        .getCurrentUserFlow()
        .stateIn(scope, SharingStarted.Eagerly, null)

    private val _userTeams = MutableStateFlow<List<TeamWithRelations>>(listOf())

    init {
        backHandler.register(backCallback)

        scope.launch {
            _showMapCard.collect {
                backCallback.isEnabled = it
            }
        }

        scope.launch {
            currentUser.collect { user ->
                if (user != null) {
                    mvpRepository.getTeamsWithPlayersFlow(user.user.teamIds).collect { teams ->
                        _userTeams.value = teams
                    }
                }
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

    fun onMapClick() {
        _showMapCard.value = !_showMapCard.value
    }

    fun clearSelectedEvent() {
        _selectedEvent.value = null
    }

    fun selectEvent(event: EventAbs) {
        _selectedEvent.value = event
        _validTeams.value = _userTeams.value.filter { team ->
            team.players.size == event.teamSizeLimit
        }
    }

    fun viewEvent(event: EventAbs) {
        onEventSelected(event)
    }

    fun joinEvent(event: EventAbs?) {
        if(event == null) return
        scope.launch {
            mvpRepository.addCurrentUserToEvent(event)
        }
    }

    fun joinEventAsTeam(team: TeamWithRelations) {
        if(_selectedEvent.value == null) return
        scope.launch {
            mvpRepository.addTeamToEvent(_selectedEvent.value!!, team)
        }
    }

    private suspend fun getEvents() {
        try {
            _isLoading.value = true
            _error.value = null

            val radius = _currentRadius.value
            val currentLocation = _currentLocation.value ?: run {
                _error.value = "Location not available"
                return
            }
            val currentBounds = getBounds(radius, currentLocation.latitude, currentLocation.longitude)

            _events.value = mvpRepository.getEvents(currentBounds, null)
        } catch (e: Exception) {
            _error.value = "Failed to fetch events: ${e.message}"
            _events.value = emptyList()
        } finally {
            _isLoading.value = false
        }
    }
}

