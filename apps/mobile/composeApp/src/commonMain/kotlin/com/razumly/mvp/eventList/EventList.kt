package com.razumly.mvp.eventList

import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.eventList.components.EventCard

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun SharedTransitionScope.EventList(
    component: EventListComponent,
    events: List<EventAbs>,
    firstElementPadding: PaddingValues,
    lastElementPadding: PaddingValues,
    lazyListState: LazyListState = rememberLazyListState(),
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier,
        state = lazyListState,
    ) {
        itemsIndexed(items = events) { index, event ->
            run {
                when (index) {
                    0 -> {
                        EventCard(
                            event = event,
                            onFavoriteClick = {},
                            modifier = Modifier
                                .clickable { component.selectEvent(event) }
                                .padding(firstElementPadding),
                        )
                    }
                    events.size-1 -> {
                        EventCard(
                            event = event,
                            onFavoriteClick = {},
                            modifier = Modifier
                                .clickable { component.selectEvent(event) }
                                .padding(lastElementPadding),
                        )
                    }
                    else -> {
                        EventCard(
                            event = event,
                            onFavoriteClick = {},
                            modifier = Modifier
                                .clickable { component.selectEvent(event) },
                        )
                    }
                }
            }
        }
    }
}





