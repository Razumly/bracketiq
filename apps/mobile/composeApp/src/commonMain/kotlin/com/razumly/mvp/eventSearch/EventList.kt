package com.razumly.mvp.eventSearch

import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.presentation.composables.EventDetails

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun EventList(
    component: SearchEventListComponent,
    events: List<EventAbs>,
    firstElementPadding: PaddingValues,
    lastElementPadding: PaddingValues,
    lazyListState: LazyListState = rememberLazyListState(),
    onMapClick: (Offset) -> Unit
) {
    LazyColumn(
        state = lazyListState,
    ) {
        itemsIndexed(items = events, key = { _, item -> item.id }) { index, event ->
            val padding = when (index) {
                0 -> {
                    firstElementPadding
                }

                events.size - 1 -> {
                    lastElementPadding
                }

                else -> {
                    PaddingValues()
                }
            }

            var isExpanded by remember { mutableStateOf(false) }
            Card(
                modifier = Modifier.padding(padding).padding(horizontal = 16.dp, vertical = 8.dp)
                    .clickable(onClick = {
                        isExpanded = !isExpanded
                        component.viewEvent(event)
                    }).fillMaxWidth(),
                elevation = CardDefaults.cardElevation(4.dp),
                shape = RoundedCornerShape(12.dp),
            ) {
                EventDetails(event,
                    isExpanded,
                    {},
                    Modifier.padding(8.dp),
                    onMapClick = { offset ->
                        onMapClick(offset)
                        component.onMapClick(event)
                    },
                ) {
                }
            }
        }
    }
}