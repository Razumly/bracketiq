package com.razumly.mvp.eventSearch

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.arkivanov.essenty.instancekeeper.InstanceKeeper
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.repositories.IEventAbsRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.ITournamentRepository
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.calcDistance
import com.razumly.mvp.core.util.getBounds
import com.razumly.mvp.eventSearch.util.EventFilter
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.LocationTracker
import io.github.aakira.napier.Napier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

interface EventSearchComponent {
    val locationTracker: LocationTracker
    val onEventSelected: (event: EventAbs) -> Unit
    val currentRadius: StateFlow<Double>
    val errorState: StateFlow<ErrorMessage?>
    val isLoading: StateFlow<Boolean>
    val suggestedEvents: StateFlow<List<EventAbs>>
    val currentLocation: StateFlow<LatLng?>
    val isLoadingMore: StateFlow<Boolean>
    val hasMoreEvents: StateFlow<Boolean>
    val filter: StateFlow<EventFilter>

    val events: StateFlow<List<EventAbs>>
    val selectedEvent: StateFlow<EventAbs?>
    val showMapCard: StateFlow<Boolean>

    fun setLoadingHandler(handler: LoadingHandler)
    fun loadMoreEvents()
    fun selectRadius(radius: Double)
    fun onMapClick(event: EventAbs? = null)
    fun viewEvent(event: EventAbs)
    fun suggestEvents(searchQuery: String)
    fun updateFilter(update: EventFilter.() -> EventFilter)
}

class DefaultEventSearchComponent(
    componentContext: ComponentContext,
    private val eventAbsRepository: IEventAbsRepository,
    private val eventRepository: IEventRepository,
    private val tournamentRepository: ITournamentRepository,
    eventId: String?,
    tournamentId: String?,
    override val locationTracker: LocationTracker,
    override val onEventSelected: (event: EventAbs) -> Unit,
) : ComponentContext by componentContext, EventSearchComponent {
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    private val _currentRadius = MutableStateFlow(50.0)
    override val currentRadius: StateFlow<Double> = _currentRadius.asStateFlow()

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState: StateFlow<ErrorMessage?> = _errorState.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    override val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _locationStateFlow =
        locationTracker.getLocationsFlow().stateIn(scope, SharingStarted.Eagerly, null)

    private val _currentLocation = MutableStateFlow<LatLng?>(null)
    override val currentLocation = _currentLocation.asStateFlow()

    private val _suggestedEvents = MutableStateFlow<List<EventAbs>>(emptyList())
    override val suggestedEvents: StateFlow<List<EventAbs>> = _suggestedEvents.asStateFlow()

    private val _isLoadingMore = MutableStateFlow(false)
    override val isLoadingMore: StateFlow<Boolean> = _isLoadingMore.asStateFlow()

    private val _hasMoreEvents = MutableStateFlow(true)
    override val hasMoreEvents: StateFlow<Boolean> = _hasMoreEvents.asStateFlow()

    private val _filter = MutableStateFlow(EventFilter())
    override val filter = _filter.asStateFlow()

    private lateinit var loadingHandler: LoadingHandler

    override fun setLoadingHandler(handler: LoadingHandler) {
        loadingHandler = handler
    }

    @OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
    override val events = combine(_currentLocation.filterNotNull(), _currentRadius, _filter) { location, radius, eventFilter ->
        getBounds(radius, location.latitude, location.longitude) to eventFilter
    }.debounce(200L).flatMapLatest { (bounds, eventFilter) ->
        eventAbsRepository.getEventsInBoundsFlow(bounds).map { result ->
            result.getOrElse {
                _errorState.value = ErrorMessage("Failed to fetch events: ${it.message}")
                Napier.e("Failed to fetch events: ${it.message}")
                emptyList()
            }.filter { event ->
                eventFilter.filter(event)
            }
        }
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _selectedEvent = MutableStateFlow<EventAbs?>(null)
    override val selectedEvent: StateFlow<EventAbs?> = _selectedEvent.asStateFlow()

    private val _showMapCard = MutableStateFlow(false)
    override val showMapCard: StateFlow<Boolean> = _showMapCard.asStateFlow()

    private val backCallback = BackCallback(false) {
        _showMapCard.value = false
    }

    init {
        backHandler.register(backCallback)
        eventAbsRepository.resetCursor()

        if (eventId != null) {
            scope.launch {
                eventRepository.getEvent(eventId).onSuccess {
                    onEventSelected(it.event)
                }.onFailure { e ->
                    _errorState.value = ErrorMessage("Failed to fetch event: ${e.message}")
                }
            }
        } else if (tournamentId != null) {
            scope.launch {
                tournamentRepository.getTournament(tournamentId).onSuccess {
                    onEventSelected(it)
                }.onFailure { e ->
                    _errorState.value = ErrorMessage("Failed to fetch tournament: ${e.message}")
                }
            }
        }
        scope.launch {
            _showMapCard.collect {
                backCallback.isEnabled = it
            }
        }

        scope.launch {
            locationTracker.startTracking()
        }

        instanceKeeper.put(CLEANUP_KEY, Cleanup(locationTracker))

        scope.launch {
            try {
                _locationStateFlow.collect {
                    if (it == null) {
                        _errorState.value = ErrorMessage("Location not available")
                        return@collect
                    }
                    if (_currentLocation.value == null) {
                        _currentLocation.value = it
                        eventRepository.resetCursor()
                        loadMoreEvents()
                    }
                    if (calcDistance(_currentLocation.value!!, it) > 50) {
                        _currentLocation.value = it
                        loadMoreEvents()
                    }
                }
            } catch (e: Exception) {
                _errorState.value = ErrorMessage("Failed to track location: ${e.message}")
            }
        }

        scope.launch {
            try {
                currentRadius.collect {
                        if (_locationStateFlow.value != null) {
                            loadMoreEvents()
                        }
                    }
            } catch (e: Exception) {
                _errorState.value = ErrorMessage("Failed to update events: ${e.message}")
            }
        }
    }

    override fun selectRadius(radius: Double) {
        _currentRadius.value = radius
    }

    override fun onMapClick(event: EventAbs?) {
        _selectedEvent.value = event
        _showMapCard.value = !_showMapCard.value
    }

    override fun viewEvent(event: EventAbs) {
        onEventSelected(event)
    }

    override fun suggestEvents(searchQuery: String) {
        scope.launch {
            if (_currentLocation.value == null) return@launch
            eventAbsRepository.searchEvents(searchQuery, _currentLocation.value!!)
                .onSuccess {
                    _suggestedEvents.value = it.first
                    _isLoading.value = false
                }.onFailure { e ->
                    _errorState.value = ErrorMessage("Failed to fetch events: ${e.message}")
                }
        }
    }

    override fun loadMoreEvents() {
        if (_isLoadingMore.value || !_hasMoreEvents.value || _isLoading.value) return

        scope.launch {
            _isLoadingMore.value = true

            val radius = _currentRadius.value
            val currentLocation = _currentLocation.value ?: return@launch
            val currentBounds = getBounds(radius, currentLocation.latitude, currentLocation.longitude)

            eventAbsRepository.getEventsInBounds(currentBounds)
                .onSuccess { (_, hasMore) ->
                    _hasMoreEvents.value = hasMore
                }
                .onFailure { e ->
                    _errorState.value = ErrorMessage("Failed to load more events: ${e.message}")
                }
            _isLoadingMore.value = false
        }
    }

    override fun updateFilter(update: EventFilter.() -> EventFilter) {
        _filter.value = _filter.value.update()
    }

    private class Cleanup(private val locationTracker: LocationTracker): InstanceKeeper.Instance {
        override fun onDestroy() {
            locationTracker.stopTracking()
        }
    }

    companion object {
        const val CLEANUP_KEY = "Cleanup_Search"
    }
}

