@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.arkivanov.essenty.instancekeeper.InstanceKeeper
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.OrganizationDetailTab
import com.razumly.mvp.core.presentation.RentalCreateContext
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.calcDistance
import com.razumly.mvp.core.util.getBounds
import com.razumly.mvp.eventDetail.data.IMatchRepository
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
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlin.time.ExperimentalTime

interface EventSearchComponent {
    val locationTracker: LocationTracker
    val currentRadius: StateFlow<Double>
    val errorState: StateFlow<ErrorMessage?>
    val isLoading: StateFlow<Boolean>
    val suggestedEvents: StateFlow<List<Event>>
    val currentLocation: StateFlow<LatLng?>
    val isLoadingMore: StateFlow<Boolean>
    val hasMoreEvents: StateFlow<Boolean>
    val filter: StateFlow<EventFilter>
    val organizations: StateFlow<List<Organization>>
    val isLoadingOrganizations: StateFlow<Boolean>
    val rentals: StateFlow<List<Organization>>
    val isLoadingRentals: StateFlow<Boolean>
    val rentalFieldOptions: StateFlow<List<RentalFieldOption>>
    val isLoadingRentalFields: StateFlow<Boolean>
    val rentalBusyBlocks: StateFlow<List<RentalBusyBlock>>

    val events: StateFlow<List<Event>>
    val selectedEvent: StateFlow<Event?>
    val showMapCard: StateFlow<Boolean>

    fun setLoadingHandler(handler: LoadingHandler)
    fun loadMoreEvents()
    fun selectRadius(radius: Double)
    fun onMapClick(event: Event? = null)
    fun viewEvent(event: Event)
    fun viewOrganization(organization: Organization, initialTab: OrganizationDetailTab = OrganizationDetailTab.OVERVIEW)
    fun startRentalCreate(context: RentalCreateContext)
    fun suggestEvents(searchQuery: String)
    fun updateFilter(update: EventFilter.() -> EventFilter)
    fun refreshOrganizations(force: Boolean = false)
    fun refreshRentals(force: Boolean = false)
    fun loadRentalFieldOptions(fieldIds: List<String>)
    fun loadRentalBusyBlocks(organizationId: String, fieldIds: List<String>)
    fun clearRentalFieldOptions()
    fun clearRentalBusyBlocks()
}

data class RentalFieldOption(
    val field: Field,
    val rentalSlots: List<TimeSlot>,
)

data class RentalBusyBlock(
    val eventId: String,
    val eventName: String,
    val fieldId: String,
    val start: kotlin.time.Instant,
    val end: kotlin.time.Instant,
)

class DefaultEventSearchComponent(
    componentContext: ComponentContext,
    private val eventRepository: IEventRepository,
    private val matchRepository: IMatchRepository,
    private val billingRepository: IBillingRepository,
    private val fieldRepository: IFieldRepository,
    eventId: String?,
    override val locationTracker: LocationTracker,
    private val navigationHandler: INavigationHandler
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

    private val _suggestedEvents = MutableStateFlow<List<Event>>(emptyList())
    override val suggestedEvents: StateFlow<List<Event>> = _suggestedEvents.asStateFlow()

    private val _isLoadingMore = MutableStateFlow(false)
    override val isLoadingMore: StateFlow<Boolean> = _isLoadingMore.asStateFlow()

    private val _hasMoreEvents = MutableStateFlow(true)
    override val hasMoreEvents: StateFlow<Boolean> = _hasMoreEvents.asStateFlow()

    private val _filter = MutableStateFlow(EventFilter())
    override val filter = _filter.asStateFlow()
    private val _organizations = MutableStateFlow<List<Organization>>(emptyList())
    override val organizations: StateFlow<List<Organization>> = _organizations.asStateFlow()
    private val _isLoadingOrganizations = MutableStateFlow(false)
    override val isLoadingOrganizations: StateFlow<Boolean> = _isLoadingOrganizations.asStateFlow()
    private val _rentals = MutableStateFlow<List<Organization>>(emptyList())
    override val rentals: StateFlow<List<Organization>> = _rentals.asStateFlow()
    private val _isLoadingRentals = MutableStateFlow(false)
    override val isLoadingRentals: StateFlow<Boolean> = _isLoadingRentals.asStateFlow()
    private val _rentalFieldOptions = MutableStateFlow<List<RentalFieldOption>>(emptyList())
    override val rentalFieldOptions: StateFlow<List<RentalFieldOption>> = _rentalFieldOptions.asStateFlow()
    private val _isLoadingRentalFields = MutableStateFlow(false)
    override val isLoadingRentalFields: StateFlow<Boolean> = _isLoadingRentalFields.asStateFlow()
    private val _rentalBusyBlocks = MutableStateFlow<List<RentalBusyBlock>>(emptyList())
    override val rentalBusyBlocks: StateFlow<List<RentalBusyBlock>> = _rentalBusyBlocks.asStateFlow()
    private var organizationsLoaded = false
    private var rentalsLoaded = false

    private lateinit var loadingHandler: LoadingHandler

    override fun setLoadingHandler(handler: LoadingHandler) {
        loadingHandler = handler
    }

    @OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
    override val events = combine(
        _currentLocation.filterNotNull(),
        _currentRadius,
        _filter
    ) { location, radius, eventFilter ->
        getBounds(radius, location.latitude, location.longitude) to eventFilter
    }.debounce(200L).flatMapLatest { (bounds, eventFilter) ->
        eventRepository.getEventsInBoundsFlow(bounds).map { result ->
            result.getOrElse {
                _errorState.value = ErrorMessage("Failed to fetch events: ${it.message}")
                Napier.e("Failed to fetch events: ${it.message}")
                emptyList()
            }.filter { event ->
                eventFilter.filter(event)
            }
        }
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _selectedEvent = MutableStateFlow<Event?>(null)
    override val selectedEvent: StateFlow<Event?> = _selectedEvent.asStateFlow()

    private val _showMapCard = MutableStateFlow(false)
    override val showMapCard: StateFlow<Boolean> = _showMapCard.asStateFlow()

    private val backCallback = BackCallback(false) {
        _showMapCard.value = false
    }

    init {
        backHandler.register(backCallback)
        eventRepository.resetCursor()

        if (eventId != null) {
            scope.launch {
                eventRepository.getEvent(eventId).onSuccess {
                    navigationHandler.navigateToEvent(it)
                }.onFailure { e ->
                    _errorState.value = ErrorMessage("Failed to fetch event: ${e.message}")
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
            _locationStateFlow.collect {
                try {
                    if (it == null) {
                        return@collect
                    }
                    if (_currentLocation.value == null) {
                        _currentLocation.value = it
                        eventRepository.resetCursor()
                        loadMoreEvents()
                        refreshOrganizations(force = true)
                        refreshRentals(force = true)
                    }
                    if (calcDistance(_currentLocation.value!!, it) > 50) {
                        _currentLocation.value = it
                        loadMoreEvents()
                        refreshOrganizations(force = true)
                        refreshRentals(force = true)
                    }
                } catch (e: Exception) {
                    _errorState.value = ErrorMessage("Failed to track location: ${e.message}")
                }
            }
        }

        scope.launch {
            currentRadius.collect {
                if (_locationStateFlow.value != null) {
                    try {
                        loadMoreEvents()
                        refreshOrganizations(force = true)
                        refreshRentals(force = true)
                    } catch (e: Exception) {
                        _errorState.value = ErrorMessage("Failed to update events: ${e.message}")
                    }
                }
            }
        }

        refreshRentals()
    }

    override fun selectRadius(radius: Double) {
        _currentRadius.value = radius
    }

    override fun onMapClick(event: Event?) {
        _selectedEvent.value = event
        _showMapCard.value = !_showMapCard.value
    }

    override fun viewEvent(event: Event) {
        navigationHandler.navigateToEvent(event)
    }

    override fun viewOrganization(organization: Organization, initialTab: OrganizationDetailTab) {
        navigationHandler.navigateToOrganization(organization.id, initialTab)
    }

    override fun startRentalCreate(context: RentalCreateContext) {
        navigationHandler.navigateToCreate(context)
    }

    override fun suggestEvents(searchQuery: String) {
        scope.launch {
            if (_currentLocation.value == null) return@launch
            eventRepository.searchEvents(searchQuery, _currentLocation.value!!)
                .onSuccess { (events, _) ->
                    val activeFilter = _filter.value
                    _suggestedEvents.value = events.filter { event -> activeFilter.filter(event) }
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
            val currentBounds =
                getBounds(radius, currentLocation.latitude, currentLocation.longitude)
            val activeFilter = _filter.value

            eventRepository.getEventsInBounds(
                bounds = currentBounds,
                dateFrom = activeFilter.date.first,
                dateTo = activeFilter.date.second,
            )
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
        val previous = _filter.value
        val updated = previous.update()
        _filter.value = updated

        val dateRangeChanged = previous.date != updated.date
        if (dateRangeChanged && _locationStateFlow.value != null) {
            _hasMoreEvents.value = true
            eventRepository.resetCursor()
            loadMoreEvents()
        }
    }

    override fun refreshOrganizations(force: Boolean) {
        scope.launch {
            loadOrganizations(force = force)
        }
    }

    override fun refreshRentals(force: Boolean) {
        scope.launch {
            loadRentalOrganizations(force = force)
        }
    }

    override fun loadRentalFieldOptions(fieldIds: List<String>) {
        scope.launch {
            _isLoadingRentalFields.value = true
            _rentalFieldOptions.value = emptyList()

            val fields = fieldRepository.getFields(fieldIds)
                .getOrElse { e ->
                    _errorState.value = ErrorMessage("Failed to fetch organization fields: ${e.message}")
                    _isLoadingRentalFields.value = false
                    return@launch
                }

            val sortedFields = fields.sortedBy { field -> fieldDisplayLabel(field).lowercase() }
            val slotIds = sortedFields
                .flatMap { field -> field.rentalSlotIds }
                .distinct()
                .filter(String::isNotBlank)

            val timeSlotById = if (slotIds.isEmpty()) {
                emptyMap()
            } else {
                fieldRepository.getTimeSlots(slotIds)
                    .getOrElse { e ->
                        _errorState.value = ErrorMessage("Failed to fetch rental time slots: ${e.message}")
                        _isLoadingRentalFields.value = false
                        return@launch
                    }
                    .associateBy { slot -> slot.id }
            }

            _rentalFieldOptions.value = sortedFields.map { field ->
                val linkedSlots = field.rentalSlotIds.mapNotNull { slotId -> timeSlotById[slotId] }

                // Fallback for legacy/stale data where field.rentalSlotIds is empty but slots exist by scheduledFieldId.
                val fallbackSlots = if (linkedSlots.isEmpty()) {
                    fieldRepository.getTimeSlotsForField(field.id)
                        .onFailure { error ->
                            Napier.w("Fallback rental-slot lookup failed for field ${field.id}: ${error.message}")
                        }
                        .getOrElse { emptyList() }
                } else {
                    emptyList()
                }

                val mergedSlots = (linkedSlots + fallbackSlots)
                    .distinctBy { slot -> slot.id }
                    .sortedBy { slot -> slot.startTimeMinutes ?: Int.MAX_VALUE }

                RentalFieldOption(field = field, rentalSlots = mergedSlots)
            }

            _isLoadingRentalFields.value = false
        }
    }

    override fun loadRentalBusyBlocks(organizationId: String, fieldIds: List<String>) {
        scope.launch {
            val normalizedFieldIds = fieldIds.map { id -> id.trim() }.filter(String::isNotBlank).distinct()
            if (organizationId.isBlank() || normalizedFieldIds.isEmpty()) {
                _rentalBusyBlocks.value = emptyList()
                return@launch
            }
            val selectedFieldSet = normalizedFieldIds.toSet()

            eventRepository.getEventsByOrganization(organizationId, limit = 300)
                .onSuccess { organizationEvents ->
                    val busyBlocks = organizationEvents.flatMap { event ->
                        when (event.eventType) {
                            EventType.EVENT -> {
                                val eventFieldIds = event.fieldIds
                                    .map { id -> id.trim() }
                                    .filter(String::isNotBlank)
                                    .distinct()
                                if (eventFieldIds.isEmpty()) {
                                    emptyList()
                                } else {
                                    eventFieldIds
                                        .intersect(selectedFieldSet)
                                        .map { fieldId ->
                                            RentalBusyBlock(
                                                eventId = event.id,
                                                eventName = event.name.ifBlank { "Reserved event" },
                                                fieldId = fieldId,
                                                start = event.start,
                                                end = event.end,
                                            )
                                        }
                                }
                            }

                            EventType.LEAGUE, EventType.TOURNAMENT -> {
                                val eventFieldIds = event.fieldIds
                                    .map { id -> id.trim() }
                                    .filter(String::isNotBlank)
                                    .distinct()
                                if (eventFieldIds.isNotEmpty() &&
                                    eventFieldIds.intersect(selectedFieldSet).isEmpty()
                                ) {
                                    emptyList()
                                } else {
                                    matchRepository.getMatchesOfTournament(event.id)
                                        .onFailure { error ->
                                            Napier.w(
                                                "Failed to load matches for event ${event.id}: ${error.message}",
                                                tag = "Discover"
                                            )
                                        }
                                        .getOrElse { emptyList() }
                                        .mapNotNull { match ->
                                            val fieldId = match.fieldId?.trim()
                                            val matchEnd = match.end
                                            if (fieldId.isNullOrBlank()) return@mapNotNull null
                                            if (!selectedFieldSet.contains(fieldId)) return@mapNotNull null
                                            if (matchEnd == null || matchEnd <= match.start) return@mapNotNull null

                                            RentalBusyBlock(
                                                eventId = event.id,
                                                eventName = event.name.ifBlank { "Reserved match" },
                                                fieldId = fieldId,
                                                start = match.start,
                                                end = matchEnd,
                                            )
                                        }
                                }
                            }
                        }
                    }
                        .filter { block -> block.end > block.start }
                        .distinctBy { block -> "${block.eventId}:${block.fieldId}:${block.start.toEpochMilliseconds()}:${block.end.toEpochMilliseconds()}" }

                    _rentalBusyBlocks.value = busyBlocks
                }
                .onFailure { error ->
                    _rentalBusyBlocks.value = emptyList()
                    _errorState.value = ErrorMessage("Failed to load existing field events: ${error.message}")
                }
        }
    }

    override fun clearRentalFieldOptions() {
        _rentalFieldOptions.value = emptyList()
        _isLoadingRentalFields.value = false
    }

    override fun clearRentalBusyBlocks() {
        _rentalBusyBlocks.value = emptyList()
    }

    private suspend fun loadRentalOrganizations(force: Boolean = false) {
        if (_isLoadingRentals.value) return
        if (rentalsLoaded && !force) return

        _isLoadingRentals.value = true
        val organizations = loadOrganizations(force = force)
        val normalizedOrganizations = organizations.map { organization ->
            organization.copy(
                fieldIds = organization.fieldIds
                    .distinct()
                    .filter(String::isNotBlank)
            )
        }

        val missingFieldIds = normalizedOrganizations.any { organization ->
            organization.fieldIds.isEmpty()
        }
        val organizationFieldIdsFromFields = if (missingFieldIds) {
            fieldRepository.listFields()
                .getOrElse { emptyList() }
                .filter { field -> !field.organizationId.isNullOrBlank() }
                .groupBy { field -> field.organizationId!! }
                .mapValues { (_, fields) ->
                    fields.map { field -> field.id }
                        .distinct()
                        .filter(String::isNotBlank)
                }
        } else {
            emptyMap()
        }

        val rentals = normalizedOrganizations
            .map { organization ->
                if (organization.fieldIds.isNotEmpty()) {
                    organization
                } else {
                    organization.copy(
                        fieldIds = organizationFieldIdsFromFields[organization.id].orEmpty()
                    )
                }
            }
            .filter { organization -> organization.fieldIds.isNotEmpty() }
            .sortedBy { organization -> organization.name.lowercase() }

        _rentals.value = rentals
        rentalsLoaded = true
        _isLoadingRentals.value = false
        Napier.d("Loaded ${_rentals.value.size} rental organizations", tag = "Discover")
    }

    private suspend fun loadOrganizations(force: Boolean = false): List<Organization> {
        if (_isLoadingOrganizations.value) return _organizations.value
        if (organizationsLoaded && !force) return _organizations.value

        _isLoadingOrganizations.value = true
        var organizations: List<Organization> = emptyList()
        billingRepository.listOrganizations(limit = 200)
            .onSuccess { response ->
                organizations = response
            }
            .onFailure { e ->
                _errorState.value = ErrorMessage("Failed to fetch organizations: ${e.message}")
                organizations = emptyList()
            }

        val sortedOrganizations = organizations.sortedBy { organization -> organization.name.lowercase() }
        val distanceFiltered = applyDistanceFilter(sortedOrganizations)
        _organizations.value = distanceFiltered
        organizationsLoaded = true
        _isLoadingOrganizations.value = false
        return distanceFiltered
    }

    private fun fieldDisplayLabel(field: Field): String {
        if (!field.name.isNullOrBlank()) {
            return field.name
        }
        return "Field ${field.fieldNumber}"
    }

    private fun applyDistanceFilter(organizations: List<Organization>): List<Organization> {
        val currentLocation = _currentLocation.value ?: return organizations
        val radiusMiles = _currentRadius.value
        if (radiusMiles <= 0) return organizations

        return organizations.filter { organization ->
            val orgLocation = organization.toLatLngOrNull() ?: return@filter false
            calcDistance(currentLocation, orgLocation) <= radiusMiles
        }
    }

    private fun Organization.toLatLngOrNull(): LatLng? {
        val coords = coordinates ?: return null
        if (coords.size < 2) return null
        val longitude = coords[0]
        val latitude = coords[1]
        if (latitude.isNaN() || longitude.isNaN()) return null
        return LatLng(latitude, longitude)
    }

    private class Cleanup(private val locationTracker: LocationTracker) : InstanceKeeper.Instance {
        override fun onDestroy() {
            locationTracker.stopTracking()
        }
    }

    companion object {
        const val CLEANUP_KEY = "Cleanup_Search"
    }
}
