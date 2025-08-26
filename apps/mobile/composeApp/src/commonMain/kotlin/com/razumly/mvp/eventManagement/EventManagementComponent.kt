package com.razumly.mvp.eventManagement

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.repositories.IEventAbsRepository
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.presentation.INavigationHandler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

interface EventManagementComponent {
    val events: StateFlow<List<EventAbs>>
    val onEventSelected: (event: EventAbs) -> Unit
    val isLoadingMore: StateFlow<Boolean>
    val hasMoreEvents: StateFlow<Boolean>
    val onBack: () -> Unit
    val errorState: StateFlow<ErrorMessage?>
    val isLoading: StateFlow<Boolean>

    fun setLoadingHandler(handler: LoadingHandler)
    fun loadMoreEvents()
}

class DefaultEventManagementComponent(
    componentContext: ComponentContext,
    private val eventAbsRepository: IEventAbsRepository,
    navigationHandler: INavigationHandler
) : ComponentContext by componentContext, EventManagementComponent {
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    override val onEventSelected = navigationHandler::navigateToEvent
    override val onBack = navigationHandler::navigateBack

    override val events: StateFlow<List<EventAbs>> = eventAbsRepository.getUsersEventsFlow().map { result ->
        result.getOrElse {
            _errorState.value = ErrorMessage("Failed to load events: ${it.message}")
            emptyList()
        }
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _isLoadingMore = MutableStateFlow(false)
    override val isLoadingMore: StateFlow<Boolean> = _isLoadingMore.asStateFlow()

    private val _hasMoreEvents = MutableStateFlow(true)
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
            _isLoadingMore.value = true
            eventAbsRepository.getUsersEvents().onSuccess {
                _hasMoreEvents.value = it.second
            }.onFailure {
                _errorState.value = ErrorMessage("Failed to load more events: ${it.message}")
            }
            _isLoadingMore.value = false
        }
    }

    override fun loadMoreEvents() {
        if (_isLoadingMore.value || !_hasMoreEvents.value || _isLoading.value) return

        scope.launch {
            _isLoadingMore.value = true

            eventAbsRepository.getUsersEvents()
                .onSuccess { (_, hasMore) ->
                    _hasMoreEvents.value = hasMore
                }
                .onFailure { e ->
                    _errorState.value = ErrorMessage("Failed to load more events: ${e.message}")
                }
            _isLoadingMore.value = false
        }
    }
}