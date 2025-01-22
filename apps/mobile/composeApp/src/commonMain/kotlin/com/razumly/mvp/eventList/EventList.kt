package com.razumly.mvp.eventList

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.presentation.backGroundGradient1
import com.razumly.mvp.core.presentation.backGroundGradient2
import com.razumly.mvp.eventList.components.EventCard

@Composable
fun EventList(
    component: EventListComponent,
    events: List<EventAbs>,
    firstElementPadding:PaddingValues,
    modifier: Modifier = Modifier,
) {
    val backgroundStops = arrayOf(
        0.0f to backGroundGradient1,
        1f to backGroundGradient2
    )
    LazyColumn(
        modifier = modifier
            .background(
                Brush.horizontalGradient(colorStops = backgroundStops)
            )
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





