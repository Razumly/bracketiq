package com.razumly.mvp.eventSearch.tabs.events

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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil3.SingletonImageLoader
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import coil3.size.Scale
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.presentation.composables.EventCard
import com.razumly.mvp.core.presentation.composables.EventCardPlaceholder
import com.razumly.mvp.core.presentation.composables.resolveEventCardImageSource
import com.razumly.mvp.core.presentation.guides.guideTarget
import com.razumly.mvp.core.util.Platform
import com.razumly.mvp.eventSearch.composables.EmptyDiscoverListItem
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest

private const val INITIAL_EVENT_PLACEHOLDER_COUNT = 4
private const val EVENT_CLICK_SCROLL_SETTLE_DELAY_MILLIS = 150L
private const val DEBUG_DISCOVER_EVENT_COUNT = 15

private val DEBUG_DISCOVER_LIVE_IMAGE_URLS = listOf(
    "https://bracket-iq.com/api/files/3cf49622-060d-4db6-bde3-793a3f6a28fc/preview?w=1280&h=720",
    "https://bracket-iq.com/api/files/affiliate_org_recs_pickleball_logo_square_117ac1289760/preview?w=1280&h=720",
    "https://bracket-iq.com/api/files/affiliate_file_503_baseball_logo/preview?w=1280&h=720",
    "https://bracket-iq.com/api/files/affiliate_file_rose_city_volleyball_logo/preview?w=1280&h=720",
    "https://bracket-iq.com/api/files/affiliate_org_eastside_timbers_logo_square_91792ed46a45/preview?w=1280&h=720",
    "https://bracket-iq.com/api/files/affiliate_file_bomber_fastpitch_logo/preview?w=1280&h=720",
    "https://bracket-iq.com/api/files/affiliate_file_ceva_region_logo/preview?w=1280&h=720",
    "https://bracket-iq.com/api/files/affiliate_file_athena_ajax_volleyball_logo/preview?w=1280&h=720",
    "https://bracket-iq.com/api/files/affiliate_org_oregon_youth_soccer_logo_square_24d62d5d0fd9/preview?w=1280&h=720",
    "https://bracket-iq.com/api/files/affiliate_org_soccer_chance_academy_logo_square_6ea685bba667/preview?w=1280&h=720",
    "https://bracket-iq.com/api/files/affiliate_file_marucci_elite_texas_houston_logo/preview?w=1280&h=720",
    "https://bracket-iq.com/api/files/affiliate_file_navajo_girls_fastpitch_softball_logo/preview?w=1280&h=720",
    "https://bracket-iq.com/api/files/affiliate_file_metro_tennis_group_logo/preview?w=1280&h=720",
    "https://bracket-iq.com/api/files/affiliate_file_vbli_logo/preview?w=1280&h=720",
)

private data class DiscoverEventListItem(
    val key: String,
    val event: Event,
    val sourceEvent: Event,
    val imageUrlOverride: String?,
)

@Composable
fun EventList(
    events: List<Event>,
    organizationLogoIdsById: Map<String, String> = emptyMap(),
    publishedBadgeEventIds: Set<String> = emptySet(),
    firstElementPadding: PaddingValues,
    lastElementPadding: PaddingValues,
    lazyListState: LazyListState = rememberLazyListState(),
    isLoadingMore: Boolean = false,
    hasMoreEvents: Boolean = true,
    showPagingStatus: Boolean = true,
    emptyMessage: String = "No events found.",
    onLoadMore: () -> Unit,
    onMapClick: (Offset, Event) -> Unit,
    onCreateEventClick: (() -> Unit)? = null,
    firstItemGuideTargetId: String? = null,
    onEventClick: (Event) -> Unit,
) {
    var lastLoadRequestKey by remember { mutableStateOf<String?>(null) }
    var suppressEventClicksAfterScroll by remember { mutableStateOf(false) }
    val hasTrailingStatusItem = events.isNotEmpty() && showPagingStatus && (isLoadingMore || !hasMoreEvents)
    val eventListItems = remember(events, hasMoreEvents, isLoadingMore) {
        val realItems = events.map { event ->
            DiscoverEventListItem(
                key = event.id,
                event = event,
                sourceEvent = event,
                imageUrlOverride = null,
            )
        }
        val shouldAddDebugEvents = Platform.isDebugBuild &&
            !Platform.isIOS &&
            events.isNotEmpty() &&
            events.size < DEBUG_DISCOVER_EVENT_COUNT &&
            !hasMoreEvents &&
            !isLoadingMore

        if (!shouldAddDebugEvents) {
            realItems
        } else {
            buildList {
                addAll(realItems)
                repeat(DEBUG_DISCOVER_EVENT_COUNT - events.size) { placeholderIndex ->
                    val sourceEvent = events[placeholderIndex % events.size]
                    val cardNumber = events.size + placeholderIndex + 1
                    val debugEvent = sourceEvent.copy(
                        id = "${sourceEvent.id}-discover-debug-$cardNumber",
                        name = "Discover blur test card $cardNumber",
                    )
                    add(
                        DiscoverEventListItem(
                            key = debugEvent.id,
                            event = debugEvent,
                            sourceEvent = sourceEvent,
                            imageUrlOverride = DEBUG_DISCOVER_LIVE_IMAGE_URLS[
                                placeholderIndex % DEBUG_DISCOVER_LIVE_IMAGE_URLS.size
                            ],
                        )
                    )
                }
            }
        }
    }
    val eventImagePreloadUrls = remember(eventListItems, organizationLogoIdsById) {
        buildSet {
            eventListItems.forEach { item ->
                val fallbackImageId = item.event.organizationId
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                    ?.let(organizationLogoIdsById::get)
                val source = resolveEventCardImageSource(
                    eventName = item.event.name,
                    eventImageId = item.event.imageId,
                    organizationLogoId = fallbackImageId,
                )
                add(item.imageUrlOverride?.trim()?.takeIf(String::isNotBlank) ?: source.imageUrl)
            }
        }
    }
    val platformContext = LocalPlatformContext.current
    val density = LocalDensity.current
    val windowWidthPx = LocalWindowInfo.current.containerSize.width
    val eventCardImageSizePx = remember(windowWidthPx, density) {
        val horizontalPaddingPx = with(density) { 32.dp.roundToPx() }
        (windowWidthPx - horizontalPaddingPx).coerceAtLeast(1)
    }

    LaunchedEffect(platformContext, eventImagePreloadUrls, eventCardImageSizePx) {
        val imageLoader = SingletonImageLoader.get(platformContext)
        eventImagePreloadUrls.chunked(4).forEach { batch ->
            coroutineScope {
                batch.map { imageUrl ->
                    async {
                        imageLoader.execute(
                            ImageRequest.Builder(platformContext)
                                .data(imageUrl)
                                .size(eventCardImageSizePx)
                                .scale(Scale.FILL)
                                .build(),
                        )
                    }
                }.awaitAll()
            }
        }
    }

    LaunchedEffect(lazyListState) {
        snapshotFlow { lazyListState.isScrollInProgress }
            .collectLatest { isScrolling ->
                if (isScrolling) {
                    suppressEventClicksAfterScroll = true
                } else {
                    delay(EVENT_CLICK_SCROLL_SETTLE_DELAY_MILLIS)
                    suppressEventClicksAfterScroll = false
                }
            }
    }

    LaunchedEffect(lazyListState, events.size, hasMoreEvents, isLoadingMore, showPagingStatus) {
        snapshotFlow { lazyListState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1 }
            .collect { lastVisibleIndex ->
                val nearListEnd = events.isNotEmpty() && lastVisibleIndex >= events.lastIndex - 2
                val currentRequestKey = "${events.size}:${events.lastOrNull()?.id.orEmpty()}"
                val canRequestMore =
                    showPagingStatus && hasMoreEvents && !isLoadingMore && nearListEnd &&
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
                    elevation = CardDefaults.cardElevation(0.dp),
                    shape = RoundedCornerShape(16.dp),
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
        } else if (events.isEmpty()) {
            item {
                EmptyDiscoverListItem(
                    message = emptyMessage,
                    modifier = Modifier
                        .padding(firstElementPadding)
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        } else {
            itemsIndexed(items = eventListItems, key = { _, item -> item.key }) { index, item ->
                val event = item.event
                val padding = when (index) {
                    0 -> firstElementPadding
                    eventListItems.size - 1 -> if (hasTrailingStatusItem) PaddingValues() else lastElementPadding
                    else -> PaddingValues()
                }

                Card(
                    modifier = Modifier
                        .padding(padding)
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .fillMaxWidth()
                        .then(
                            if (index == 0 && firstItemGuideTargetId != null) {
                                Modifier.guideTarget(firstItemGuideTargetId)
                            } else {
                                Modifier
                            }
                        ),
                    elevation = CardDefaults.cardElevation(0.dp),
                    shape = RoundedCornerShape(16.dp),
                ) {
                    EventCard(
                        event,
                        navPadding = PaddingValues(),
                        showLoadingPlaceholder = true,
                        fallbackImageId = event.organizationId
                            ?.trim()
                            ?.takeIf(String::isNotBlank)
                            ?.let(organizationLogoIdsById::get),
                        imageUrlOverride = item.imageUrlOverride,
                        showPublishedLifecycleBadge = item.sourceEvent.id in publishedBadgeEventIds,
                        onClick = {
                            if (!suppressEventClicksAfterScroll) {
                                onEventClick(item.sourceEvent)
                            }
                        },
                        onMapClick = { offset ->
                            onMapClick(offset, item.sourceEvent)
                        },
                    )
                }
            }
        }

        if (showPagingStatus && isLoadingMore && events.isNotEmpty()) {
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

        if (showPagingStatus && !hasMoreEvents && events.isNotEmpty()) {
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
