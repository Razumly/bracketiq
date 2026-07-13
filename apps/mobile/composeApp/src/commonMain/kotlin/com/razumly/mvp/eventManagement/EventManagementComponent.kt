package com.razumly.mvp.eventManagement

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.repositories.HostEventPage
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.presentation.INavigationHandler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

private const val HOST_EVENTS_PAGE_SIZE = 50

interface EventManagementComponent {
    val events: StateFlow<List<Event>>
    val onEventSelected: (event: Event) -> Unit
    val isLoadingMore: StateFlow<Boolean>
    val hasMoreEvents: StateFlow<Boolean>
    val onBack: () -> Unit
    val errorState: StateFlow<ErrorMessage?>
    val isLoading: StateFlow<Boolean>

    fun setLoadingHandler(handler: LoadingHandler)
    fun loadMoreEvents()
}

class DefaultEventManagementComponent internal constructor(
    componentContext: ComponentContext,
    private val loadHostEventsPage: suspend (
        hostId: String,
        limit: Int,
        offset: Int,
    ) -> Result<HostEventPage>,
    currentUserIds: Flow<String>,
    cachedEvents: Flow<Result<List<Event>>>,
    navigateToEvent: (String) -> Unit,
    override val onBack: () -> Unit,
) : ComponentContext by componentContext, EventManagementComponent {
    constructor(
        componentContext: ComponentContext,
        eventRepository: IEventRepository,
        userRepository: IUserRepository,
        navigationHandler: INavigationHandler,
    ) : this(
        componentContext = componentContext,
        loadHostEventsPage = eventRepository::getHostEventsPage,
        currentUserIds = userRepository.currentUser.map { result ->
            result.getOrNull()?.id?.trim().orEmpty()
        },
        cachedEvents = eventRepository.getCachedEventsFlow(),
        navigateToEvent = navigationHandler::navigateToEvent,
        onBack = navigationHandler::navigateBack,
    )

    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())
    private var requestGeneration = 0L
    private var activeHostId = ""
    private var nextOffset = 0
    private var loadedEventIds = emptyList<String>()
    private var cachedEventsById = emptyMap<String, Event>()

    override val onEventSelected: (Event) -> Unit = { event ->
        navigateToEvent(event.id)
    }

    private val _events = MutableStateFlow<List<Event>>(emptyList())
    override val events: StateFlow<List<Event>> = _events.asStateFlow()

    private val _isLoadingMore = MutableStateFlow(false)
    override val isLoadingMore: StateFlow<Boolean> = _isLoadingMore.asStateFlow()

    private val _hasMoreEvents = MutableStateFlow(false)
    override val hasMoreEvents: StateFlow<Boolean> = _hasMoreEvents.asStateFlow()

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState: StateFlow<ErrorMessage?> = _errorState.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    override val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private lateinit var loadingHandler: LoadingHandler

    override fun setLoadingHandler(handler: LoadingHandler) {
        loadingHandler = handler
    }

    init {
        scope.launch {
            cachedEvents.collect { result ->
                result.onSuccess { events ->
                    cachedEventsById = events.associateBy(Event::id)
                    renderLoadedEvents()
                }
            }
        }

        scope.launch {
            currentUserIds
                .map { userId -> userId.trim() }
                .distinctUntilChanged()
                .collectLatest { hostId ->
                    val generation = ++requestGeneration
                    activeHostId = hostId
                    nextOffset = 0
                    loadedEventIds = emptyList()
                    renderLoadedEvents()
                    _hasMoreEvents.value = false
                    _isLoadingMore.value = false
                    _errorState.value = null

                    if (hostId.isBlank()) {
                        _isLoading.value = false
                        return@collectLatest
                    }

                    _isLoading.value = true
                    loadHostEventsPage(
                        hostId,
                        HOST_EVENTS_PAGE_SIZE,
                        0,
                    ).onSuccess { page ->
                        if (isCurrentRequest(generation, hostId)) {
                            _errorState.value = null
                            applyPage(page = page, requestedOffset = 0, replace = true)
                        }
                    }.onFailure { error ->
                        if (isCurrentRequest(generation, hostId)) {
                            _errorState.value = ErrorMessage("Failed to load events: ${error.userMessage()}")
                        }
                    }
                    if (isCurrentRequest(generation, hostId)) {
                        _isLoading.value = false
                    }
                }
        }
    }

    override fun loadMoreEvents() {
        if (_isLoadingMore.value || !_hasMoreEvents.value || _isLoading.value) return

        val hostId = activeHostId
        if (hostId.isBlank()) return

        val generation = requestGeneration
        val requestedOffset = nextOffset
        _isLoadingMore.value = true

        scope.launch {
            loadHostEventsPage(
                hostId,
                HOST_EVENTS_PAGE_SIZE,
                requestedOffset,
            ).onSuccess { page ->
                if (isCurrentRequest(generation, hostId)) {
                    _errorState.value = null
                    applyPage(page = page, requestedOffset = requestedOffset, replace = false)
                }
            }.onFailure { error ->
                if (isCurrentRequest(generation, hostId)) {
                    _errorState.value = ErrorMessage("Failed to load more events: ${error.userMessage()}")
                }
            }
            if (isCurrentRequest(generation, hostId)) {
                _isLoadingMore.value = false
            }
        }
    }

    private fun applyPage(
        page: HostEventPage,
        requestedOffset: Int,
        replace: Boolean,
    ) {
        loadedEventIds = mergeEventIds(
            existing = if (replace) emptyList() else loadedEventIds,
            incoming = page.events.map(Event::id),
        )
        renderLoadedEvents()
        val madeProgress = page.nextOffset > requestedOffset
        nextOffset = if (madeProgress) page.nextOffset else requestedOffset
        _hasMoreEvents.value = page.hasMore && madeProgress
    }

    private fun isCurrentRequest(generation: Long, hostId: String): Boolean =
        generation == requestGeneration && hostId == activeHostId

    private fun renderLoadedEvents() {
        _events.value = loadedEventIds.mapNotNull { eventId ->
            cachedEventsById[eventId]?.takeIf { event -> event.hostId == activeHostId }
        }
    }
}

internal fun mergeEventIds(
    existing: List<String>,
    incoming: List<String>,
): List<String> {
    val eventIds = LinkedHashSet<String>(existing.size + incoming.size)
    eventIds.addAll(existing)
    eventIds.addAll(incoming)
    return eventIds.toList()
}
