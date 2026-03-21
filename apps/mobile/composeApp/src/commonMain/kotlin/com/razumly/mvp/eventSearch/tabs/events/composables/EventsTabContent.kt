package com.razumly.mvp.eventSearch.tabs.events.composables

import androidx.compose.runtime.Composable
import androidx.compose.ui.geometry.Offset
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyListState
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.eventSearch.tabs.events.EventList

@Composable
fun EventsTabContent(
    events: List<Event>,
    firstElementPadding: PaddingValues,
    lastElementPadding: PaddingValues,
    lazyListState: LazyListState,
    isLoadingMore: Boolean,
    hasMoreEvents: Boolean,
    onLoadMore: () -> Unit,
    onMapClick: (Offset, Event) -> Unit,
    onEventClick: (Event) -> Unit,
) {
    EventList(
        events = events,
        firstElementPadding = firstElementPadding,
        lastElementPadding = lastElementPadding,
        lazyListState = lazyListState,
        isLoadingMore = isLoadingMore,
        hasMoreEvents = hasMoreEvents,
        onLoadMore = onLoadMore,
        onMapClick = onMapClick,
        onEventClick = onEventClick,
    )
}
