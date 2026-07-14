package com.razumly.mvp.eventManagement

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Button
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.PlatformBackButton
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventSearch.tabs.events.EventList

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventManagementScreen(component: EventManagementComponent) {
    val events by component.events.collectAsState()
    val offsetNavPadding =
        PaddingValues(bottom = LocalNavBarPadding.current.calculateBottomPadding().plus(32.dp))
    val lazyListState = rememberLazyListState()
    val isLoading by component.isLoading.collectAsState()
    val isLoadingMore by component.isLoadingMore.collectAsState()
    val hasMoreEvents by component.hasMoreEvents.collectAsState()
    val loadError by component.errorState.collectAsState()

    val popupHandler = LocalPopupHandler.current
    val loadingHandler = LocalLoadingHandler.current

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
    }

    LaunchedEffect(Unit) {
        component.errorState.collect { error ->
            if (error != null) {
                popupHandler.showPopup(error)
            }
        }
    }

    Scaffold(topBar = {
        CenterAlignedTopAppBar(title = { Text("Event Management") },
            navigationIcon = { PlatformBackButton(onBack = component.onBack, arrow = true) },
            scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()
        )
    }) { paddingValues ->
        val firstElementPadding = PaddingValues(top = paddingValues.calculateTopPadding())
        when {
            isLoading && events.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .padding(paddingValues)
                        .fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }

            events.isEmpty() && loadError != null -> {
                EventManagementLoadErrorState(
                    message = loadError?.message.orEmpty(),
                    modifier = Modifier.padding(paddingValues),
                    onRetry = component::retryLoadingEvents,
                )
            }

            events.isEmpty() -> {
                EventManagementEmptyState(
                    modifier = Modifier.padding(paddingValues),
                    onCreateEvent = component.onCreateEvent,
                )
            }

            else -> EventList(
                events = events,
                firstElementPadding = firstElementPadding,
                lastElementPadding = offsetNavPadding,
                lazyListState = lazyListState,
                onMapClick = { _, _ -> },
                isLoadingMore = isLoadingMore,
                hasMoreEvents = hasMoreEvents,
                onLoadMore = { component.loadMoreEvents() }
            ) { event ->
                component.onEventSelected(event)
            }
        }
    }
}

@Composable
internal fun EventManagementLoadErrorState(
    message: String,
    modifier: Modifier = Modifier,
    onRetry: () -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Unable to load events", style = MaterialTheme.typography.titleLarge)
        Text(
            text = message,
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = onRetry,
        ) {
            Text("Try again")
        }
    }
}

@Composable
internal fun EventManagementEmptyState(
    modifier: Modifier = Modifier,
    onCreateEvent: () -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("No events to manage yet", style = MaterialTheme.typography.titleLarge)
        Text(
            text = "Create your first event, then return here to manage its schedule and participants.",
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = onCreateEvent,
        ) {
            Text("Create an event")
        }
    }
}
