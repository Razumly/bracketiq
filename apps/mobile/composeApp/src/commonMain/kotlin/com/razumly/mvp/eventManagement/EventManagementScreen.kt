package com.razumly.mvp.eventManagement

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.PlatformBackButton
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventSearch.EventList

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventManagementScreen(component: EventManagementComponent) {
    val events by component.events.collectAsState()
    val offsetNavPadding =
        PaddingValues(bottom = LocalNavBarPadding.current.calculateBottomPadding().plus(32.dp))
    val lazyListState = rememberLazyListState()
    val isLoadingMore by component.isLoadingMore.collectAsState()
    val hasMoreEvents by component.hasMoreEvents.collectAsState()

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
        EventList(
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