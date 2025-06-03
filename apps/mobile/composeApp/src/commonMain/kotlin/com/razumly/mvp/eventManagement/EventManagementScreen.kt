package com.razumly.mvp.eventManagement

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.PlatformBackButton
import com.razumly.mvp.eventSearch.EventList
import com.razumly.mvp.home.LocalNavBarPadding

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventManagementScreen(component: EventManagementComponent) {
    val events by component.events.collectAsState()
    val offsetNavPadding =
        PaddingValues(bottom = LocalNavBarPadding.current.calculateBottomPadding().plus(32.dp))
    val lazyListState = rememberLazyListState()

    Scaffold(topBar = {
        CenterAlignedTopAppBar(title = { Text("Event Management") },
            navigationIcon = { PlatformBackButton(onBack = component.onBack) },
            scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()
        )
    }) { paddingValues ->
        val firstElementPadding = PaddingValues(top = paddingValues.calculateTopPadding())
        EventList(events = events,
            firstElementPadding = firstElementPadding,
            lastElementPadding = offsetNavPadding,
            lazyListState = lazyListState,
            onMapClick = { _, _ -> }) { event ->
            component.onEventSelected(event)
        }
    }
}