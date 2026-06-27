package com.razumly.mvp.eventSearch.tabs.events

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.presentation.composables.EventCard
import com.razumly.mvp.core.presentation.composables.EventCardPlaceholder
import com.razumly.mvp.core.presentation.guides.guideTarget

private const val INITIAL_EVENT_PLACEHOLDER_COUNT = 4

@Composable
fun EventList(
    events: List<Event>,
    organizationLogoIdsById: Map<String, String> = emptyMap(),
    firstElementPadding: PaddingValues,
    lastElementPadding: PaddingValues,
    lazyListState: LazyListState = rememberLazyListState(),
    isLoadingMore: Boolean = false,
    hasMoreEvents: Boolean = true,
    onLoadMore: () -> Unit,
    onMapClick: (Offset, Event) -> Unit,
    onCreateEventClick: (() -> Unit)? = null,
    firstItemGuideTargetId: String? = null,
    onEventClick: (Event) -> Unit,
) {
    var lastLoadRequestKey by remember { mutableStateOf<String?>(null) }
    val hasTrailingStatusItem = events.isNotEmpty() && (isLoadingMore || !hasMoreEvents)

    LaunchedEffect(lazyListState, events.size, hasMoreEvents, isLoadingMore) {
        snapshotFlow { lazyListState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1 }
            .collect { lastVisibleIndex ->
                val nearListEnd = events.isNotEmpty() && lastVisibleIndex >= events.lastIndex - 2
                val currentRequestKey = "${events.size}:${events.lastOrNull()?.id.orEmpty()}"
                val canRequestMore =
                    hasMoreEvents && !isLoadingMore && nearListEnd &&
                        lastLoadRequestKey != currentRequestKey

                if (canRequestMore) {
                    lastLoadRequestKey = currentRequestKey
                    onLoadMore()
                }
            }
    }

    LazyColumn(
        state = lazyListState,
    ) {
        if (events.isEmpty() && isLoadingMore) {
            items(INITIAL_EVENT_PLACEHOLDER_COUNT) { index ->
                val padding = when (index) {
                    0 -> firstElementPadding
                    INITIAL_EVENT_PLACEHOLDER_COUNT - 1 -> lastElementPadding
                    else -> PaddingValues()
                }

                Card(
                    modifier = Modifier
                        .padding(padding)
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .fillMaxWidth(),
                    elevation = CardDefaults.cardElevation(4.dp),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    EventCardPlaceholder(navPadding = PaddingValues(bottom = 16.dp))
                }
            }
        } else if (events.isEmpty() && onCreateEventClick != null) {
            item {
                Box(
                    modifier = Modifier
                        .fillParentMaxSize()
                        .padding(firstElementPadding)
                        .padding(lastElementPadding)
                        .padding(horizontal = 24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    EmptyEventsCallToAction(onClick = onCreateEventClick)
                }
            }
        } else {
            itemsIndexed(items = events, key = { _, item -> item.id }) { index, event ->
                val padding = when (index) {
                    0 -> firstElementPadding
                    events.size - 1 -> if (hasTrailingStatusItem) PaddingValues() else lastElementPadding
                    else -> PaddingValues()
                }

                Card(
                    modifier = Modifier
                        .padding(padding)
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .clickable { onEventClick(event) }
                        .fillMaxWidth()
                        .then(
                            if (index == 0 && firstItemGuideTargetId != null) {
                                Modifier.guideTarget(firstItemGuideTargetId)
                            } else {
                                Modifier
                            }
                        ),
                    elevation = CardDefaults.cardElevation(4.dp),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    EventCard(
                        event,
                        navPadding = PaddingValues(bottom = 16.dp),
                        showLoadingPlaceholder = true,
                        fallbackImageId = event.organizationId
                            ?.trim()
                            ?.takeIf(String::isNotBlank)
                            ?.let(organizationLogoIdsById::get),
                        onMapClick = { offset ->
                            onMapClick(offset, event)
                        },
                    )
                }
            }
        }

        if (isLoadingMore && events.isNotEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(lastElementPadding)
                        .padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
        }

        if (!hasMoreEvents && events.isNotEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(lastElementPadding)
                        .padding(
                            start = 16.dp,
                            top = 8.dp,
                            end = 16.dp,
                            bottom = 16.dp
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No more events to load",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyEventsCallToAction(
    onClick: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Text(
            text = "No upcoming events in your area. Be the first to create one.",
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
        FloatingActionButton(
            onClick = onClick,
            modifier = Modifier.size(112.dp),
            shape = MaterialTheme.shapes.extraLarge,
        ) {
            Icon(
                imageVector = Icons.Default.Add,
                contentDescription = "Create Event",
                modifier = Modifier.size(52.dp),
            )
        }
    }
}
