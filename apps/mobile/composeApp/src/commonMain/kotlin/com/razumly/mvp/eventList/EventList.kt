package com.razumly.mvp.eventList

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.eventList.components.EventCard

@Composable
fun EventList(
    component: EventListComponent,
    events: List<EventAbs>,
    firstElementPadding:PaddingValues,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier
    ) {
        itemsIndexed(items = events) { index, event ->
            run {
                if (index == 0) {
                    EventCard(
                        event = event,
                        onFavoriteClick = {},
                        modifier = Modifier
                            .clickable { component.selectEvent(event) }
                            .padding(firstElementPadding)
                    )
                } else {
                    EventCard(
                        event = event,
                        onFavoriteClick = {},
                        modifier = Modifier.clickable { component.selectEvent(event) }
                    )
                }
            }
        }
    }
}





