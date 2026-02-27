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
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlin.time.ExperimentalTime

interface EventSearchComponent {
    val locationTracker: LocationTracker
    val currentRadius: StateFlow<Double>
    val errorState: StateFlow<ErrorMessage?>
    val isLoading: StateFlow<Boolean>
    val suggestedEvents: StateFlow<List<Event>>
    val suggestedOrganizations: StateFlow<List<Organization>>
    val currentLocation: StateFlow<LatLng?>
    val isLoadingMore: StateFlow<Boolean>
    val hasMoreEvents: StateFlow<Boolean>
    val filter: StateFlow<EventFilter>
    val organizations: StateFlow<List<Organization>>
    val allOrganizations: StateFlow<List<Organization>>
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
    fun suggestOrganizations(searchQuery: String, rentalsOnly: Boolean = false)
    fun updateFilter(update: EventFilter.() -> EventFilter)
    fun refreshEvents(force: Boolean = false)
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

    private val _currentLocation = MutableStateFlow<LatLng?>(null)
    override val currentLocation = _currentLocation.asStateFlow()

    private val _suggestedEvents = MutableStateFlow<List<Event>>(emptyList())
    override val suggestedEvents: StateFlow<List<Event>> = _suggestedEvents.asStateFlow()
    private val _suggestedOrganizations = MutableStateFlow<List<Organization>>(emptyList())
    override val suggestedOrganizations: StateFlow<List<Organization>> = _suggestedOrganizations.asStateFlow()

    private val _isLoadingMore = MutableStateFlow(false)
    override val isLoadingMore: StateFlow<Boolean> = _isLoadingMore.asStateFlow()

    private val _hasMoreEvents = MutableStateFlow(true)
    override val hasMoreEvents: StateFlow<Boolean> = _hasMoreEvents.asStateFlow()

    private val _filter = MutableStateFlow(EventFilter())
    override val filter = _filter.asStateFlow()
    private val _rawEvents = MutableStateFlow<List<Event>>(emptyList())
    private val _events = MutableStateFlow<List<Event>>(emptyList())
    override val events: StateFlow<List<Event>> = _events.asStateFlow()
    private val _organizations = MutableStateFlow<List<Organization>>(emptyList())
    override val organizations: StateFlow<List<Organization>> = _organizations.asStateFlow()
    private val _allOrganizations = MutableStateFlow<List<Organization>>(emptyList())
    override val allOrganizations: StateFlow<List<Organization>> = _allOrganizations.asStateFlow()
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
    private var suggestEventsJob: Job? = null
    private var suggestOrganizationsJob: Job? = null
    private var eventOffset = 0

    private lateinit var loadingHandler: LoadingHandler

    override fun setLoadingHandler(handler: LoadingHandler) {
        loadingHandler = handler
    }

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
            runCatching {
                locationTracker.startTracking()
            }.onFailure { error ->
                Napier.w("Location tracking disabled: ${error.message}")
            }
        }

        instanceKeeper.put(CLEANUP_KEY, Cleanup(locationTracker))

        scope.launch {
            try {
                locationTracker.getLocationsFlow().collect { trackedLocation ->
                    val previousLocation = _currentLocation.value
                    _currentLocation.value = trackedLocation

                    if (previousLocation == null ||
                        calcDistance(previousLocation, trackedLocation) > 50
                    ) {
                        refreshOrganizations(force = true)
                        refreshRentals(force = true)
                    }
                }
            } catch (e: Exception) {
                Napier.w("Location updates unavailable: ${e.message}")
            }
        }

        scope.launch {
            currentRadius.collect {
                refreshOrganizations(force = true)
                refreshRentals(force = true)
            }
        }

        refreshEvents(force = true)
        refreshOrganizations(force = true)
        refreshRentals(force = true)
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
        val normalizedQuery = searchQuery.trim()
        if (normalizedQuery.length < SEARCH_MIN_QUERY_LENGTH) {
            suggestEventsJob?.cancel()
            _suggestedEvents.value = emptyList()
            return
        }

        suggestEventsJob?.cancel()
        suggestEventsJob = scope.launch {
            val userLocation = _currentLocation.value ?: FALLBACK_SEARCH_LOCATION
            eventRepository.searchEvents(
                searchQuery = normalizedQuery,
                userLocation = userLocation,
                limit = SEARCH_SUGGESTION_LIMIT,
                offset = 0,
            )
                .onSuccess { (events, _) ->
                    _suggestedEvents.value = events
                }.onFailure { e ->
                    _errorState.value = ErrorMessage("Failed to fetch events: ${e.message}")
                }
        }
    }

    override fun suggestOrganizations(searchQuery: String, rentalsOnly: Boolean) {
        val normalizedQuery = searchQuery.trim()
        if (normalizedQuery.length < SEARCH_MIN_QUERY_LENGTH) {
            suggestOrganizationsJob?.cancel()
            _suggestedOrganizations.value = emptyList()
            return
        }

        suggestOrganizationsJob?.cancel()
        suggestOrganizationsJob = scope.launch {
            val requestLimit = if (rentalsOnly) {
                SEARCH_SUGGESTION_LIMIT * 3
            } else {
                SEARCH_SUGGESTION_LIMIT
            }

            billingRepository.searchOrganizations(
                query = normalizedQuery,
                limit = requestLimit,
            ).onSuccess { organizations ->
                val baseList = if (rentalsOnly) {
                    organizations.filter { organization -> organization.fieldIds.isNotEmpty() }
                } else {
                    organizations
                }
                _suggestedOrganizations.value = baseList.take(SEARCH_SUGGESTION_LIMIT)
            }.onFailure { e ->
                _errorState.value = ErrorMessage("Failed to fetch organizations: ${e.message}")
            }
        }
    }

    override fun loadMoreEvents() {
        if (_isLoadingMore.value || !_hasMoreEvents.value || _isLoading.value) return

        scope.launch {
            _isLoadingMore.value = true
            try {
                val activeFilter = _filter.value
                val currentLocation = _currentLocation.value ?: FALLBACK_SEARCH_LOCATION
                val currentBounds =
                    getBounds(_currentRadius.value, currentLocation.latitude, currentLocation.longitude)

                eventRepository.getEventsInBounds(
                    bounds = currentBounds,
                    dateFrom = activeFilter.date.first,
                    dateTo = activeFilter.date.second,
                    limit = EVENTS_PAGE_SIZE,
                    offset = eventOffset,
                    includeDistanceFilter = false,
                )
                    .onSuccess { (eventsPage, hasMore) ->
                        eventOffset += eventsPage.size
                        _hasMoreEvents.value = hasMore
                        _rawEvents.value = mergeEvents(_rawEvents.value, eventsPage)
                        _events.value = applyEventFilter(_rawEvents.value, activeFilter)
                    }
                    .onFailure { e ->
                        _errorState.value = ErrorMessage("Failed to load more events: ${e.message}")
                    }
            } finally {
                _isLoadingMore.value = false
            }
        }
    }

    override fun refreshEvents(force: Boolean) {
        if (!force && _isLoadingMore.value) return
        _hasMoreEvents.value = true
        eventOffset = 0
        _rawEvents.value = emptyList()
        _events.value = emptyList()
        eventRepository.resetCursor()
        loadMoreEvents()
    }

    override fun updateFilter(update: EventFilter.() -> EventFilter) {
        val previous = _filter.value
        val updated = previous.update()
        _filter.value = updated

        val dateRangeChanged = previous.date != updated.date
        if (dateRangeChanged) {
            refreshEvents(force = true)
        } else {
            _events.value = applyEventFilter(_rawEvents.value, updated)
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
                                            val matchStart = match.start ?: return@mapNotNull null
                                            val matchEnd = match.end
                                            if (fieldId.isNullOrBlank()) return@mapNotNull null
                                            if (!selectedFieldSet.contains(fieldId)) return@mapNotNull null
                                            if (matchEnd == null || matchEnd <= matchStart) return@mapNotNull null

                                            RentalBusyBlock(
                                                eventId = event.id,
                                                eventName = event.name.ifBlank { "Reserved match" },
                                                fieldId = fieldId,
                                                start = matchStart,
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

    private fun applyEventFilter(source: List<Event>, filter: EventFilter): List<Event> {
        return source.filter { event -> filter.filter(event) }
    }

    private fun mergeEvents(existing: List<Event>, incoming: List<Event>): List<Event> {
        if (incoming.isEmpty()) return existing
        val merged = LinkedHashMap<String, Event>(existing.size + incoming.size)
        existing.forEach { event -> merged[event.id] = event }
        incoming.forEach { event -> merged[event.id] = event }
        return merged.values.toList()
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
        billingRepository.listOrganizations(limit = 1000)
            .onSuccess { response ->
                organizations = response
            }
            .onFailure { e ->
                _errorState.value = ErrorMessage("Failed to fetch organizations: ${e.message}")
                organizations = emptyList()
            }

        val sortedOrganizations = organizations.sortedBy { organization -> organization.name.lowercase() }
        _allOrganizations.value = sortedOrganizations

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
        private val FALLBACK_SEARCH_LOCATION = LatLng(0.0, 0.0)
        private const val EVENTS_PAGE_SIZE = 50
        private const val SEARCH_MIN_QUERY_LENGTH = 2
        private const val SEARCH_SUGGESTION_LIMIT = 50
    }
}
