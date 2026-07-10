@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.instancekeeper.InstanceKeeper
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.analytics.AnalyticsEvent
import com.razumly.mvp.core.analytics.AnalyticsTracker
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.Facility
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.activeAffiliateRentalFacilities
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.ISportsRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.OrganizationDetailTab
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.calcDistance
import com.razumly.mvp.core.util.getBounds
import com.razumly.mvp.eventDetail.data.IMatchRepository
import com.razumly.mvp.eventSearch.util.EventFilter
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.LocationTracker
import dev.icerock.moko.permissions.DeniedAlwaysException
import dev.icerock.moko.permissions.DeniedException
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.time.ExperimentalTime

interface EventSearchComponent {
    val locationTracker: LocationTracker
    val currentRadius: StateFlow<Double>
    val errorState: StateFlow<ErrorMessage?>
    val isLoading: StateFlow<Boolean>
    val suggestedEvents: StateFlow<List<Event>>
    val suggestedOrganizations: StateFlow<List<Organization>>
    val suggestedTeams: StateFlow<List<Team>>
    val currentLocation: StateFlow<LatLng?>
    val selectedSearchLocationLabel: StateFlow<String?>
    val sports: StateFlow<List<Sport>>
    val eventTags: StateFlow<List<EventTag>>
    val organizationTags: StateFlow<List<EventTag>>
    val organizationFilter: StateFlow<EventFilter>
    val selectedOrganizationTagSlugs: StateFlow<Set<String>>
    val isLoadingMore: StateFlow<Boolean>
    val hasMoreEvents: StateFlow<Boolean>
    val filter: StateFlow<EventFilter>
    val organizations: StateFlow<List<Organization>>
    val allOrganizations: StateFlow<List<Organization>>
    val isLoadingOrganizations: StateFlow<Boolean>
    val hasMoreOrganizations: StateFlow<Boolean>
    val rentals: StateFlow<List<Organization>>
    val isLoadingRentals: StateFlow<Boolean>
    val hasMoreRentals: StateFlow<Boolean>
    val teams: StateFlow<List<Team>>
    val isLoadingTeams: StateFlow<Boolean>
    val hasMoreTeams: StateFlow<Boolean>
    val rentalFieldOptions: StateFlow<List<RentalFieldOption>>
    val isLoadingRentalFields: StateFlow<Boolean>
    val rentalBusyBlocks: StateFlow<List<RentalBusyBlock>>

    val events: StateFlow<List<Event>>
    val selectedEvent: StateFlow<Event?>

    fun setLoadingHandler(handler: LoadingHandler)
    fun loadMoreEvents()
    fun loadMoreOrganizations()
    fun loadMoreRentals()
    fun loadMoreTeams()
    fun selectRadius(radius: Double)
    fun onMapClick(event: Event? = null)
    fun viewEvent(event: Event)
    fun viewOrganization(organization: Organization, initialTab: OrganizationDetailTab = OrganizationDetailTab.OVERVIEW)
    fun viewTeam(team: Team)
    fun startEventCreate()
    fun suggestEvents(searchQuery: String)
    fun suggestOrganizations(searchQuery: String, rentalsOnly: Boolean = false)
    fun suggestTeams(searchQuery: String)
    fun updateFilter(update: EventFilter.() -> EventFilter)
    fun updateOrganizationFilter(update: EventFilter.() -> EventFilter)
    fun updateOrganizationTagSlugs(tagSlugs: Set<String>)
    fun refreshEvents(force: Boolean = false)
    fun refreshOrganizations(force: Boolean = false)
    fun refreshRentals(force: Boolean = false)
    fun refreshTeams(force: Boolean = false)
    fun searchThisArea(center: LatLng, radiusMiles: Double? = null)
    fun selectSearchLocation(label: String, center: LatLng)
    fun useCurrentLocationForSearch()
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
    private val teamRepository: ITeamRepository,
    private val sportsRepository: ISportsRepository,
    eventId: String?,
    override val locationTracker: LocationTracker,
    private val navigationHandler: INavigationHandler
) : ComponentContext by componentContext, EventSearchComponent {
    private val scopeExceptionHandler = CoroutineExceptionHandler { _, throwable ->
        when (throwable) {
            is DeniedAlwaysException -> handleLocationPermissionDenied(alwaysDenied = true)
            is DeniedException -> handleLocationPermissionDenied(alwaysDenied = false)
            is CancellationException -> Unit
            else -> Napier.e(
                message = "Unhandled exception in EventSearchComponent scope: ${throwable.message}",
                throwable = throwable,
            )
        }
    }
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob() + scopeExceptionHandler)
    private val rentalAvailabilityLoader = RentalAvailabilityLoader(
        eventRepository = eventRepository,
        matchRepository = matchRepository,
        fieldRepository = fieldRepository,
    )

    private val _currentRadius = MutableStateFlow(0.0)
    override val currentRadius: StateFlow<Double> = _currentRadius.asStateFlow()

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState: StateFlow<ErrorMessage?> = _errorState.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    override val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _currentLocation = MutableStateFlow<LatLng?>(null)
    override val currentLocation = _currentLocation.asStateFlow()
    private val _isLocationSearchEnabled = MutableStateFlow(true)
    private val _searchCenter = MutableStateFlow<LatLng?>(null)
    private val _mapSearchRadiusMiles = MutableStateFlow<Double?>(null)
    private val _selectedSearchLocationLabel = MutableStateFlow<String?>(null)
    override val selectedSearchLocationLabel: StateFlow<String?> = _selectedSearchLocationLabel.asStateFlow()

    private val _suggestedEvents = MutableStateFlow<List<Event>>(emptyList())
    override val suggestedEvents: StateFlow<List<Event>> = _suggestedEvents.asStateFlow()
    private val _suggestedOrganizations = MutableStateFlow<List<Organization>>(emptyList())
    override val suggestedOrganizations: StateFlow<List<Organization>> = _suggestedOrganizations.asStateFlow()
    private val _suggestedTeams = MutableStateFlow<List<Team>>(emptyList())
    override val suggestedTeams: StateFlow<List<Team>> = _suggestedTeams.asStateFlow()
    private val _sports = MutableStateFlow<List<Sport>>(emptyList())
    override val sports: StateFlow<List<Sport>> = _sports.asStateFlow()
    private val _eventTags = MutableStateFlow<List<EventTag>>(emptyList())
    override val eventTags: StateFlow<List<EventTag>> = _eventTags.asStateFlow()
    private val _organizationTags = MutableStateFlow<List<EventTag>>(emptyList())
    override val organizationTags: StateFlow<List<EventTag>> = _organizationTags.asStateFlow()
    private val _organizationFilter = MutableStateFlow(EventFilter())
    override val organizationFilter: StateFlow<EventFilter> = _organizationFilter.asStateFlow()
    private val _selectedOrganizationTagSlugs = MutableStateFlow<Set<String>>(emptySet())
    override val selectedOrganizationTagSlugs: StateFlow<Set<String>> = _selectedOrganizationTagSlugs.asStateFlow()

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
    private val _hasMoreOrganizations = MutableStateFlow(true)
    override val hasMoreOrganizations: StateFlow<Boolean> = _hasMoreOrganizations.asStateFlow()
    private val _rentals = MutableStateFlow<List<Organization>>(emptyList())
    override val rentals: StateFlow<List<Organization>> = _rentals.asStateFlow()
    private val _isLoadingRentals = MutableStateFlow(false)
    override val isLoadingRentals: StateFlow<Boolean> = _isLoadingRentals.asStateFlow()
    private val _hasMoreRentals = MutableStateFlow(true)
    override val hasMoreRentals: StateFlow<Boolean> = _hasMoreRentals.asStateFlow()
    private val _teams = MutableStateFlow<List<Team>>(emptyList())
    override val teams: StateFlow<List<Team>> = _teams.asStateFlow()
    private val _isLoadingTeams = MutableStateFlow(false)
    override val isLoadingTeams: StateFlow<Boolean> = _isLoadingTeams.asStateFlow()
    private val _hasMoreTeams = MutableStateFlow(true)
    override val hasMoreTeams: StateFlow<Boolean> = _hasMoreTeams.asStateFlow()
    private val _rentalFieldOptions = MutableStateFlow<List<RentalFieldOption>>(emptyList())
    override val rentalFieldOptions: StateFlow<List<RentalFieldOption>> = _rentalFieldOptions.asStateFlow()
    private val _isLoadingRentalFields = MutableStateFlow(false)
    override val isLoadingRentalFields: StateFlow<Boolean> = _isLoadingRentalFields.asStateFlow()
    private val _rentalBusyBlocks = MutableStateFlow<List<RentalBusyBlock>>(emptyList())
    override val rentalBusyBlocks: StateFlow<List<RentalBusyBlock>> = _rentalBusyBlocks.asStateFlow()
    private var organizationsLoaded = false
    private var rentalsLoaded = false
    private var teamsLoaded = false
    private var organizationOffset = 0
    private var rentalOffset = 0
    private var teamOffset = 0
    private var suggestEventsJob: Job? = null
    private var suggestOrganizationsJob: Job? = null
    private var suggestTeamsJob: Job? = null
    private var cachedEventsSyncJob: Job? = null
    private var isAwaitingInitialEventLocation = true
    private var eventOffset = 0
    private var organizationFieldIdsFromFieldsCache: Map<String, List<String>> = emptyMap()

    private lateinit var loadingHandler: LoadingHandler

    override fun setLoadingHandler(handler: LoadingHandler) {
        loadingHandler = handler
    }

    private val _selectedEvent = MutableStateFlow<Event?>(null)
    override val selectedEvent: StateFlow<Event?> = _selectedEvent.asStateFlow()

    init {
        eventRepository.resetCursor()

        if (eventId != null) {
            scope.launch {
                eventRepository.getEvent(eventId).onSuccess {
                    navigationHandler.navigateToEvent(it)
                }.onFailure { e ->
                    _errorState.value = ErrorMessage("Failed to fetch event: ${e.userMessage()}")
                }
            }
        }
        scope.launch {
            startTrackingLocationSafely()
        }

        instanceKeeper.put(CLEANUP_KEY, Cleanup(locationTracker))

        scope.launch {
            try {
                locationTracker.getLocationsFlow().collect { trackedLocation ->
                    _isLocationSearchEnabled.value = true
                    val previousLocation = _currentLocation.value
                    _currentLocation.value = trackedLocation

                    if (_searchCenter.value == null && (previousLocation == null ||
                            calcDistance(previousLocation, trackedLocation) > 50)
                    ) {
                        _isLocationSearchEnabled.value = true
                        refreshEvents(force = true)
                        refreshOrganizations(force = false)
                        refreshRentals(force = false)
                    }
                }
            } catch (_: DeniedAlwaysException) {
                handleLocationPermissionDenied(alwaysDenied = true)
            } catch (_: DeniedException) {
                handleLocationPermissionDenied(alwaysDenied = false)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (e: Exception) {
                Napier.w("Location updates unavailable: ${e.message}")
                handleLocationUnavailable()
            }
        }

        scope.launch {
            currentRadius.collect {
                refreshOrganizations(force = false)
                refreshRentals(force = false)
            }
        }

        observeCachedEvents()
        loadSports()
        loadEventTags()
        loadOrganizationTags()
        refreshEvents(
            force = true,
            showLoading = false,
            clearExisting = false,
            reportErrors = false,
        )
        refreshOrganizations(force = false)
        refreshRentals(force = false)
        refreshTeams(force = false)
    }

    override fun selectRadius(radius: Double) {
        val normalizedRadius = radius.coerceAtLeast(0.0)
        if (_currentRadius.value == normalizedRadius) return
        _currentRadius.value = normalizedRadius
        refreshEvents(force = true)
    }

    override fun onMapClick(event: Event?) {
        _selectedEvent.value = event
    }

    override fun viewEvent(event: Event) {
        AnalyticsTracker.capture(
            AnalyticsEvent.EventClicked,
            event.analyticsProperties("discover_events"),
        )
        navigationHandler.navigateToEvent(event)
    }

    override fun viewOrganization(organization: Organization, initialTab: OrganizationDetailTab) {
        navigationHandler.navigateToOrganization(organization.id, initialTab)
    }

    override fun viewTeam(team: Team) {
        val organizationId = team.organizationId?.trim()?.takeIf(String::isNotBlank)
        if (organizationId != null) {
            navigationHandler.navigateToOrganization(organizationId, OrganizationDetailTab.TEAMS)
        } else {
            navigationHandler.navigateToTeams()
        }
    }

    override fun startEventCreate() {
        navigationHandler.navigateToCreate()
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
            val userLocation = activeSearchLocation()
            eventRepository.searchEvents(
                searchQuery = normalizedQuery,
                userLocation = userLocation,
                limit = SEARCH_SUGGESTION_LIMIT,
                offset = 0,
            )
                .onSuccess { (events, _) ->
                    _suggestedEvents.value = events
                }.onFailure { e ->
                    _errorState.value = ErrorMessage("Failed to fetch events: ${e.userMessage()}")
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
            val organizationsResult = billingRepository.searchOrganizations(
                query = normalizedQuery,
                limit = SEARCH_SUGGESTION_LIMIT,
                includeAffiliateRentals = rentalsOnly,
            )
            if (organizationsResult.isFailure) {
                val e = organizationsResult.exceptionOrNull()
                _errorState.value = ErrorMessage("Failed to fetch organizations: ${e?.userMessage() ?: "Unknown error"}")
                return@launch
            }
            val organizations = organizationsResult.getOrNull().orEmpty()
            val organizationsWithResolvedFieldIds = if (rentalsOnly) {
                resolveOrganizationsWithFieldIds(organizations, forceFieldRefresh = false)
            } else {
                organizations
            }
            val baseList = if (rentalsOnly) {
                organizationsWithResolvedFieldIds.flatMap { organization -> organization.toDiscoverRentalEntries() }
            } else {
                organizationsWithResolvedFieldIds
            }
            _suggestedOrganizations.value = baseList.take(SEARCH_SUGGESTION_LIMIT)
        }
    }

    override fun suggestTeams(searchQuery: String) {
        val normalizedQuery = searchQuery.trim()
        if (normalizedQuery.length < SEARCH_MIN_QUERY_LENGTH) {
            suggestTeamsJob?.cancel()
            _suggestedTeams.value = emptyList()
            return
        }

        suggestTeamsJob?.cancel()
        suggestTeamsJob = scope.launch {
            withContext(Dispatchers.Default) {
                teamRepository.searchOpenRegistrationTeams(
                    query = normalizedQuery,
                    limit = SEARCH_SUGGESTION_LIMIT,
                )
            }
                .onSuccess { teams ->
                    _suggestedTeams.value = teams
                }
                .onFailure { e ->
                    _errorState.value = ErrorMessage("Failed to fetch teams: ${e.userMessage()}")
                }
        }
    }

    override fun loadMoreEvents() {
        loadMoreEvents(showLoading = true, reportErrors = true)
    }

    override fun loadMoreOrganizations() {
        scope.launch {
            loadMoreOrganizationsPage()
        }
    }

    override fun loadMoreRentals() {
        scope.launch {
            loadMoreRentalOrganizationsPage()
        }
    }

    override fun loadMoreTeams() {
        scope.launch {
            loadMoreTeamsPage()
        }
    }

    private fun loadMoreEvents(
        showLoading: Boolean,
        reportErrors: Boolean,
    ) {
        if (_isLoadingMore.value || !_hasMoreEvents.value || _isLoading.value) return

        scope.launch {
            if (showLoading) {
                _isLoadingMore.value = true
            }
            try {
                val activeFilter = _filter.value
                val currentLocation = activeSearchLocation()
                val searchRadiusMiles = activeSearchRadiusMiles()
                val includeDistanceFilter = currentLocation != null && searchRadiusMiles > 0.0
                val currentBounds = currentLocation
                    ?.takeIf { searchRadiusMiles > 0.0 }
                    ?.let { location ->
                        getBounds(searchRadiusMiles, location.latitude, location.longitude)
                    }
                    ?: UNRESTRICTED_EVENT_SEARCH_BOUNDS

                eventRepository.getEventsInBounds(
                    bounds = currentBounds,
                    dateFrom = activeFilter.date.first,
                    dateTo = activeFilter.date.second,
                    sports = selectedSportNames(activeFilter),
                    tags = activeFilter.tagSlugs.toList(),
                    limit = EVENTS_PAGE_SIZE,
                    offset = eventOffset,
                    includeDistanceFilter = includeDistanceFilter,
                )
                    .onSuccess { (eventsPage, hasMore) ->
                        loadOrganizationsForEvents(eventsPage)
                        eventOffset += eventsPage.size
                        _hasMoreEvents.value = hasMore
                        _rawEvents.value = mergeEvents(_rawEvents.value, eventsPage)
                        _events.value = applyEventFilter(_rawEvents.value, activeFilter)
                    }
                    .onFailure { e ->
                        if (reportErrors) {
                            _errorState.value = ErrorMessage("Failed to load more events: ${e.userMessage()}")
                        } else {
                            Napier.w("Failed to refresh discover events in background: ${e.message}")
                        }
                    }
            } finally {
                if (showLoading) {
                    _isLoadingMore.value = false
                }
            }
        }
    }

    override fun refreshEvents(force: Boolean) {
        refreshEvents(
            force = force,
            showLoading = true,
            clearExisting = true,
            reportErrors = true,
        )
    }

    private fun refreshEvents(
        force: Boolean,
        showLoading: Boolean,
        clearExisting: Boolean,
        reportErrors: Boolean,
    ) {
        if (!force && _isLoadingMore.value) return
        if (shouldWaitForLocationBeforeEventSearch()) {
            isAwaitingInitialEventLocation = true
            if (showLoading) {
                _isLoadingMore.value = true
            }
            return
        }
        if (isAwaitingInitialEventLocation) {
            isAwaitingInitialEventLocation = false
            if (showLoading) {
                _isLoadingMore.value = false
            }
        }
        _hasMoreEvents.value = true
        eventOffset = 0
        if (clearExisting) {
            _rawEvents.value = emptyList()
            _events.value = emptyList()
        }
        eventRepository.resetCursor()
        loadMoreEvents(
            showLoading = showLoading,
            reportErrors = reportErrors,
        )
    }

    override fun updateFilter(update: EventFilter.() -> EventFilter) {
        val previous = _filter.value
        val updated = previous.update()
        _filter.value = updated

        val dateRangeChanged = previous.date != updated.date
        val sportsChanged = previous.sportIds != updated.sportIds
        val tagsChanged = previous.tagSlugs != updated.tagSlugs
        if (dateRangeChanged || sportsChanged || tagsChanged) {
            refreshEvents(force = true)
        } else {
            _events.value = applyEventFilter(_rawEvents.value, updated)
        }
    }

    override fun updateOrganizationTagSlugs(tagSlugs: Set<String>) {
        val normalized = tagSlugs
            .map(String::trim)
            .filter(String::isNotBlank)
            .toSet()
        if (_selectedOrganizationTagSlugs.value == normalized) return
        updateOrganizationFilter { copy(tagSlugs = normalized) }
    }

    override fun updateOrganizationFilter(update: EventFilter.() -> EventFilter) {
        val previous = _organizationFilter.value
        val updated = previous.update()
        if (previous == updated) return

        _organizationFilter.value = updated
        _selectedOrganizationTagSlugs.value = updated.tagSlugs

        if (previous.tagSlugs != updated.tagSlugs) {
            organizationsLoaded = false
            scope.launch {
                loadOrganizations(force = true)
            }
        } else {
            val source = if (_allOrganizations.value.isNotEmpty()) {
                _allOrganizations.value
            } else {
                _organizations.value
            }
            _organizations.value = applyOrganizationFilters(source)
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

    override fun refreshTeams(force: Boolean) {
        scope.launch {
            loadTeams(force = force)
        }
    }

    override fun searchThisArea(center: LatLng, radiusMiles: Double?) {
        _searchCenter.value = center
        _mapSearchRadiusMiles.value = radiusMiles?.takeIf { it > 0.0 }
        _selectedSearchLocationLabel.value = "Map area"
        _isLocationSearchEnabled.value = true
        refreshEvents(force = true)
        refreshOrganizations(force = true)
        refreshRentals(force = true)
        refreshTeams(force = true)
    }

    override fun selectSearchLocation(label: String, center: LatLng) {
        _searchCenter.value = center
        _mapSearchRadiusMiles.value = null
        _selectedSearchLocationLabel.value = label.trim().takeIf(String::isNotBlank) ?: "Selected location"
        _isLocationSearchEnabled.value = true
        refreshEvents(force = true)
        refreshOrganizations(force = true)
        refreshRentals(force = true)
        refreshTeams(force = true)
    }

    override fun useCurrentLocationForSearch() {
        _searchCenter.value = null
        _mapSearchRadiusMiles.value = null
        _selectedSearchLocationLabel.value = null
        _isLocationSearchEnabled.value = true
        refreshEvents(force = true)
        refreshOrganizations(force = true)
        refreshRentals(force = true)
        refreshTeams(force = true)
    }

    override fun loadRentalFieldOptions(fieldIds: List<String>) {
        scope.launch {
            _isLoadingRentalFields.value = true
            _rentalFieldOptions.value = emptyList()
            rentalAvailabilityLoader.loadFieldOptions(fieldIds)
                .onSuccess { options ->
                    _rentalFieldOptions.value = options
                }
                .onFailure { e ->
                    _errorState.value = ErrorMessage("Failed to fetch rental field options: ${e.userMessage()}")
                }

            _isLoadingRentalFields.value = false
        }
    }

    override fun loadRentalBusyBlocks(organizationId: String, fieldIds: List<String>) {
        scope.launch {
            rentalAvailabilityLoader.loadBusyBlocks(organizationId = organizationId, fieldIds = fieldIds)
                .onSuccess { busyBlocks ->
                    _rentalBusyBlocks.value = busyBlocks
                }
                .onFailure { error ->
                    _rentalBusyBlocks.value = emptyList()
                    _errorState.value = ErrorMessage("Failed to load existing field events: ${error.userMessage()}")
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

    private fun loadSports() {
        scope.launch {
            sportsRepository.getSports()
                .onSuccess { sports ->
                    _sports.value = sports
                }
                .onFailure { e ->
                    _errorState.value = ErrorMessage("Failed to load sports: ${e.userMessage()}")
                }
        }
    }

    private fun loadEventTags() {
        scope.launch {
            eventRepository.getEventTags(filterOnly = true)
                .onSuccess { tags ->
                    _eventTags.value = tags
                }
                .onFailure { e ->
                    _errorState.value = ErrorMessage("Failed to load event tags: ${e.userMessage()}")
                }
        }
    }

    private fun loadOrganizationTags() {
        scope.launch {
            billingRepository.getOrganizationTags(filterOnly = true)
                .onSuccess { tags ->
                    _organizationTags.value = tags
                }
                .onFailure { e ->
                    _errorState.value = ErrorMessage("Failed to load organization tags: ${e.userMessage()}")
                }
        }
    }

    private fun selectedSportNames(filter: EventFilter): List<String> {
        if (filter.sportIds.isEmpty()) return emptyList()
        val sportsById = _sports.value.associateBy { sport -> sport.id }
        return filter.sportIds.mapNotNull { sportId ->
            sportsById[sportId]?.name?.trim()?.takeIf(String::isNotBlank)
                ?: sportId.trim().takeIf(String::isNotBlank)
        }
    }

    private fun mergeEvents(existing: List<Event>, incoming: List<Event>): List<Event> {
        if (incoming.isEmpty()) return existing
        val merged = LinkedHashMap<String, Event>(existing.size + incoming.size)
        existing.forEach { event -> merged[event.id] = event }
        incoming.forEach { event -> merged[event.id] = event }
        return merged.values.toList()
    }

    private fun mergeOrganizations(existing: List<Organization>, incoming: List<Organization>): List<Organization> {
        if (incoming.isEmpty()) return existing
        val merged = LinkedHashMap<String, Organization>(existing.size + incoming.size)
        existing.forEach { organization -> merged[organization.id] = organization }
        incoming.forEach { organization -> merged[organization.id] = organization }
        return merged.values.toList()
    }

    private fun mergeTeams(existing: List<Team>, incoming: List<Team>): List<Team> {
        if (incoming.isEmpty()) return existing
        val merged = LinkedHashMap<String, Team>(existing.size + incoming.size)
        existing.forEach { team -> merged[team.id] = team }
        incoming.forEach { team -> merged[team.id] = team }
        return merged.values.toList()
    }

    private suspend fun loadOrganizationsForEvents(events: List<Event>) {
        val loadedOrganizationIds = _allOrganizations.value
            .map { organization -> organization.id }
            .toSet()
        val organizationIds = events
            .mapNotNull { event -> event.organizationId?.trim()?.takeIf(String::isNotBlank) }
            .distinct()
            .filterNot { organizationId -> organizationId in loadedOrganizationIds }
        if (organizationIds.isEmpty()) return

        billingRepository.getOrganizationsByIds(organizationIds)
            .onSuccess { organizations ->
                if (organizations.isEmpty()) return@onSuccess
                val mergedById = LinkedHashMap<String, Organization>()
                _allOrganizations.value.forEach { organization -> mergedById[organization.id] = organization }
                organizations.forEach { organization -> mergedById[organization.id] = organization }
                val merged = mergedById.values.sortedBy { organization -> organization.name.lowercase() }
                _allOrganizations.value = merged
                _organizations.value = applyOrganizationFilters(merged)
            }
            .onFailure { error ->
                Napier.w("Failed to load event organizations for discover cards: ${error.message}")
            }
    }

    private fun observeCachedEvents() {
        if (cachedEventsSyncJob != null) return
        cachedEventsSyncJob = scope.launch {
            eventRepository.getCachedEventsFlow().collect { result ->
                result.onSuccess { cachedEvents ->
                    reconcileVisibleEventsWithCache(cachedEvents)
                }.onFailure { error ->
                    Napier.w("Failed to sync discover events from cache: ${error.message}")
                }
            }
        }
    }

    private fun reconcileVisibleEventsWithCache(cachedEvents: List<Event>) {
        val currentEvents = _rawEvents.value
        if (currentEvents.isEmpty()) {
            if (cachedEvents.isNotEmpty()) {
                _rawEvents.value = cachedEvents
                _events.value = applyEventFilter(cachedEvents, _filter.value)
            }
            return
        }

        val cachedById = cachedEvents.associateBy { it.id }
        val reconciledEvents = currentEvents.mapNotNull { current ->
            cachedById[current.id]
        }

        if (reconciledEvents == currentEvents) return

        _rawEvents.value = reconciledEvents
        _events.value = applyEventFilter(reconciledEvents, _filter.value)
        eventOffset = eventOffset.coerceAtMost(reconciledEvents.size)
    }

    private suspend fun loadRentalOrganizations(force: Boolean = false) {
        if (_isLoadingRentals.value) return
        if (rentalsLoaded && !force) return

        _isLoadingRentals.value = true
        rentalOffset = 0
        _hasMoreRentals.value = true
        val page = billingRepository.listOrganizationsPage(
            limit = DISCOVER_PAGE_SIZE,
            offset = 0,
            includeAffiliateRentals = true,
        )
            .onFailure { e ->
                _errorState.value = ErrorMessage("Failed to fetch rentals: ${e.userMessage()}")
            }
            .getOrNull()
        val organizations = page?.items.orEmpty()
        val rentals = resolveOrganizationsWithFieldIds(
            organizations = organizations,
            forceFieldRefresh = force,
        )
            .flatMap { organization -> organization.toDiscoverRentalEntries() }
            .sortedBy { organization -> organization.name.lowercase() }

        _rentals.value = rentals
        rentalOffset = page?.pagination?.nextOffset ?: organizations.size
        _hasMoreRentals.value = page?.pagination?.hasMore ?: false
        rentalsLoaded = true
        _isLoadingRentals.value = false
        Napier.d("Loaded ${_rentals.value.size} rental organizations", tag = "Discover")
    }

    private suspend fun loadMoreRentalOrganizationsPage() {
        if (_isLoadingRentals.value || !_hasMoreRentals.value) return

        _isLoadingRentals.value = true
        val page = billingRepository.listOrganizationsPage(
            limit = DISCOVER_PAGE_SIZE,
            offset = rentalOffset,
            includeAffiliateRentals = true,
        )
            .onFailure { e ->
                _errorState.value = ErrorMessage("Failed to fetch more rentals: ${e.userMessage()}")
            }
            .getOrNull()
        val organizations = page?.items.orEmpty()
        val rentals = resolveOrganizationsWithFieldIds(
            organizations = organizations,
            forceFieldRefresh = false,
        )
            .flatMap { organization -> organization.toDiscoverRentalEntries() }
        _rentals.value = mergeOrganizations(_rentals.value, rentals)
            .sortedBy { organization -> organization.name.lowercase() }
        rentalOffset = page?.pagination?.nextOffset ?: rentalOffset + organizations.size
        _hasMoreRentals.value = page?.pagination?.hasMore ?: false
        rentalsLoaded = true
        _isLoadingRentals.value = false
    }

    private suspend fun loadTeams(force: Boolean = false): List<Team> {
        if (_isLoadingTeams.value) return _teams.value
        if (teamsLoaded && !force) return _teams.value

        _isLoadingTeams.value = true
        teamOffset = 0
        _hasMoreTeams.value = true
        val page = withContext(Dispatchers.Default) {
            teamRepository.searchOpenRegistrationTeamsPage(limit = DISCOVER_PAGE_SIZE, offset = 0)
        }
            .onFailure { e ->
                _errorState.value = ErrorMessage("Failed to fetch teams: ${e.userMessage()}")
            }
            .getOrNull()
        val teams = page?.items.orEmpty()
            .sortedBy { team -> team.name.lowercase() }

        _teams.value = teams
        teamOffset = page?.pagination?.nextOffset ?: teams.size
        _hasMoreTeams.value = page?.pagination?.hasMore ?: false
        teamsLoaded = true
        _isLoadingTeams.value = false
        return teams
    }

    private suspend fun loadMoreTeamsPage() {
        if (_isLoadingTeams.value || !_hasMoreTeams.value) return

        _isLoadingTeams.value = true
        val page = withContext(Dispatchers.Default) {
            teamRepository.searchOpenRegistrationTeamsPage(limit = DISCOVER_PAGE_SIZE, offset = teamOffset)
        }
            .onFailure { e ->
                _errorState.value = ErrorMessage("Failed to fetch more teams: ${e.userMessage()}")
            }
            .getOrNull()
        val teams = page?.items.orEmpty()
        _teams.value = mergeTeams(_teams.value, teams)
            .sortedBy { team -> team.name.lowercase() }
        teamOffset = page?.pagination?.nextOffset ?: teamOffset + teams.size
        _hasMoreTeams.value = page?.pagination?.hasMore ?: false
        teamsLoaded = true
        _isLoadingTeams.value = false
    }

    private suspend fun loadOrganizations(force: Boolean = false): List<Organization> {
        if (_isLoadingOrganizations.value) return _organizations.value
        if (organizationsLoaded && !force) {
            val source = if (_allOrganizations.value.isNotEmpty()) {
                _allOrganizations.value
            } else {
                _organizations.value
            }
            val filtered = applyOrganizationFilters(source)
            _organizations.value = filtered
            return filtered
        }

        _isLoadingOrganizations.value = true
        organizationOffset = 0
        _hasMoreOrganizations.value = true
        val page = billingRepository.listOrganizationsPage(
            limit = DISCOVER_PAGE_SIZE,
            offset = 0,
            tagSlugs = _organizationFilter.value.tagSlugs,
        )
            .onFailure { e ->
                _errorState.value = ErrorMessage("Failed to fetch organizations: ${e.userMessage()}")
            }
            .getOrNull()
        val organizations = page?.items.orEmpty()

        val sortedOrganizations = organizations.sortedBy { organization -> organization.name.lowercase() }
        _allOrganizations.value = sortedOrganizations
        organizationFieldIdsFromFieldsCache = emptyMap()
        organizationOffset = page?.pagination?.nextOffset ?: organizations.size
        _hasMoreOrganizations.value = page?.pagination?.hasMore ?: false

        val filtered = applyOrganizationFilters(sortedOrganizations)
        _organizations.value = filtered
        organizationsLoaded = true
        _isLoadingOrganizations.value = false
        return filtered
    }

    private suspend fun loadMoreOrganizationsPage() {
        if (_isLoadingOrganizations.value || !_hasMoreOrganizations.value) return

        _isLoadingOrganizations.value = true
        val page = billingRepository.listOrganizationsPage(
            limit = DISCOVER_PAGE_SIZE,
            offset = organizationOffset,
            tagSlugs = _organizationFilter.value.tagSlugs,
        )
            .onFailure { e ->
                _errorState.value = ErrorMessage("Failed to fetch more organizations: ${e.userMessage()}")
            }
            .getOrNull()
        val organizations = page?.items.orEmpty()
        val merged = mergeOrganizations(_allOrganizations.value, organizations)
            .sortedBy { organization -> organization.name.lowercase() }
        _allOrganizations.value = merged
        organizationOffset = page?.pagination?.nextOffset ?: organizationOffset + organizations.size
        _hasMoreOrganizations.value = page?.pagination?.hasMore ?: false

        val filtered = applyOrganizationFilters(merged)
        _organizations.value = filtered
        organizationsLoaded = true
        _isLoadingOrganizations.value = false
    }

    private suspend fun resolveOrganizationsWithFieldIds(
        organizations: List<Organization>,
        forceFieldRefresh: Boolean,
    ): List<Organization> {
        val normalizedOrganizations = organizations.map { organization ->
            organization.copy(
                fieldIds = organization.fieldIds
                    .distinct()
                    .filter(String::isNotBlank)
            )
        }
        val missingFieldIds = normalizedOrganizations.any { organization -> organization.fieldIds.isEmpty() }
        if (!missingFieldIds && !forceFieldRefresh) {
            return normalizedOrganizations
        }

        val fieldIdsByOrganizationId = resolveFieldIdsByOrganization(force = forceFieldRefresh)
        return normalizedOrganizations.map { organization ->
            val resolvedFieldIds = if (organization.fieldIds.isNotEmpty()) {
                organization.fieldIds
            } else {
                fieldIdsByOrganizationId[organization.id].orEmpty()
            }
            organization.copy(fieldIds = resolvedFieldIds)
        }
    }

    private suspend fun resolveFieldIdsByOrganization(force: Boolean): Map<String, List<String>> {
        if (organizationFieldIdsFromFieldsCache.isNotEmpty() && !force) {
            return organizationFieldIdsFromFieldsCache
        }

        val mapFromFields = fieldRepository.listFields()
            .getOrElse { error ->
                Napier.w("Failed to load organization fields: ${error.message}")
                emptyList()
            }
            .filter { field -> !field.organizationId.isNullOrBlank() }
            .groupBy { field -> field.organizationId!! }
            .mapValues { (_, fields) ->
                fields.map { field -> field.id }
                    .distinct()
                    .filter(String::isNotBlank)
            }

        organizationFieldIdsFromFieldsCache = mapFromFields
        return mapFromFields
    }

    private fun applyOrganizationFilters(organizations: List<Organization>): List<Organization> {
        val filter = _organizationFilter.value
        val sportNames = selectedSportNames(filter)
            .map { sport -> sport.trim().lowercase() }
            .filter(String::isNotBlank)
            .toSet()
        val sportFiltered = if (sportNames.isEmpty() && filter.sportIds.isEmpty()) {
            organizations
        } else {
            organizations.filter { organization ->
                val organizationSports = organization.sports
                    .map { sport -> sport.trim().lowercase() }
                    .filter(String::isNotBlank)
                    .toSet()
                organizationSports.any { sport ->
                    sport in sportNames || sport in filter.sportIds
                }
            }
        }
        return applyDistanceFilter(sportFiltered)
    }

    private fun applyDistanceFilter(organizations: List<Organization>): List<Organization> {
        val currentLocation = activeSearchLocationOrNull() ?: return organizations
        val radiusMiles = activeSearchRadiusMiles()
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

    private fun activeSearchLocation(): LatLng? =
        activeSearchLocationOrNull()

    private fun activeSearchLocationOrNull(): LatLng? =
        if (_isLocationSearchEnabled.value) {
            _searchCenter.value ?: _currentLocation.value
        } else {
            _searchCenter.value
        }

    private fun activeSearchRadiusMiles(): Double =
        _mapSearchRadiusMiles.value ?: _currentRadius.value

    private fun shouldWaitForLocationBeforeEventSearch(): Boolean =
        _isLocationSearchEnabled.value &&
            _searchCenter.value == null &&
            _currentLocation.value == null

    private suspend fun startTrackingLocationSafely() {
        try {
            locationTracker.startTracking()
            _isLocationSearchEnabled.value = true
        } catch (_: DeniedAlwaysException) {
            handleLocationPermissionDenied(alwaysDenied = true)
        } catch (_: DeniedException) {
            handleLocationPermissionDenied(alwaysDenied = false)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            Napier.w("Location tracking disabled: ${e.message}")
            handleLocationUnavailable()
        }
    }

    private fun handleLocationUnavailable() {
        _searchCenter.value = null
        _mapSearchRadiusMiles.value = null
        _selectedSearchLocationLabel.value = null
        _isLocationSearchEnabled.value = false
        _currentLocation.value = null
        _errorState.value = ErrorMessage("Location is unavailable. Showing upcoming events without location filtering.")
        refreshEvents(force = true)
        refreshOrganizations(force = true)
        refreshRentals(force = true)
    }

    private fun handleLocationPermissionDenied(alwaysDenied: Boolean) {
        _searchCenter.value = null
        _mapSearchRadiusMiles.value = null
        _selectedSearchLocationLabel.value = null
        _isLocationSearchEnabled.value = false
        _currentLocation.value = null
        _errorState.value = ErrorMessage(
            if (alwaysDenied) {
                "Location permission is turned off. Showing upcoming events without location filtering."
            } else {
                "Location permission denied. Showing upcoming events without location filtering."
            }
        )
        refreshEvents(force = true)
        refreshOrganizations(force = true)
        refreshRentals(force = true)
    }

    private class Cleanup(private val locationTracker: LocationTracker) : InstanceKeeper.Instance {
        override fun onDestroy() {
            locationTracker.stopTracking()
        }
    }

    companion object {
        const val CLEANUP_KEY = "Cleanup_Search"
        private val UNRESTRICTED_EVENT_SEARCH_BOUNDS = Bounds(
            north = 0.0,
            east = 0.0,
            south = 0.0,
            west = 0.0,
            center = LatLng(0.0, 0.0),
            radiusMiles = 0.0,
        )
        private const val DISCOVER_PAGE_SIZE = 50
        private const val EVENTS_PAGE_SIZE = DISCOVER_PAGE_SIZE
        private const val SEARCH_MIN_QUERY_LENGTH = 2
        private const val SEARCH_SUGGESTION_LIMIT = 50
    }
}

private fun Organization.toDiscoverRentalEntries(): List<Organization> {
    val entries = mutableListOf<Organization>()
    if (fieldIds.isNotEmpty()) {
        entries += this
    }
    activeAffiliateRentalFacilities().forEach { facility ->
        entries += toAffiliateRentalEntry(facility)
    }
    return entries
}

private fun Event.analyticsProperties(source: String): Map<String, String> = buildMap {
    put("event_id", id)
    put("event_type", eventType.name)
    put("team_signup", teamSignup.toString())
    put("source", source)
    organizationId?.trim()?.takeIf(String::isNotBlank)?.let { put("organization_id", it) }
    sportId?.trim()?.takeIf(String::isNotBlank)?.let { put("sport_id", it) }
    if (affiliateUrl?.trim()?.isNotEmpty() == true) {
        put("is_affiliate_event", "true")
    }
}

private fun Organization.toAffiliateRentalEntry(facility: Facility): Organization {
    val facilityId = facility.resolvedId
        .takeIf(String::isNotBlank)
        ?: facility.name?.trim()?.takeIf(String::isNotBlank)
        ?: "facility"
    val facilityName = facility.name?.trim()?.takeIf(String::isNotBlank)
    val facilityLocation = facility.location?.trim()?.takeIf(String::isNotBlank)
    val facilityAddress = facility.address?.trim()?.takeIf(String::isNotBlank)
    val descriptionParts = listOfNotNull(
        name.trim().takeIf(String::isNotBlank),
        description?.trim()?.takeIf(String::isNotBlank),
    )
    return copy(
        id = "$id:affiliate-rental:$facilityId",
        name = facilityName ?: name,
        location = facilityLocation ?: location,
        address = facilityAddress ?: address,
        description = descriptionParts.joinToString(" - ").takeIf(String::isNotBlank),
        coordinates = facility.coordinates ?: coordinates,
        fieldIds = emptyList(),
        facilities = listOf(facility),
    )
}
