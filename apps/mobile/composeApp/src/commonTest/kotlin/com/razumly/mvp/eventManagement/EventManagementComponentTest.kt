package com.razumly.mvp.eventManagement

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.repositories.HostEventPage
import com.razumly.mvp.eventCreate.MainDispatcherTest
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
class EventManagementComponentTest : MainDispatcherTest() {
    @Test
    fun initial_load_failure_remains_actionable_until_retry_succeeds() = runTest(testDispatcher) {
        val loader = QueuedHostEventPageLoader(
            pages = ArrayDeque(
                listOf(
                    CompletableDeferred<Result<HostEventPage>>(
                        Result.failure(IllegalStateException("offline")),
                    ),
                    CompletableDeferred(
                        Result.success(
                            HostEventPage(
                                events = listOf(hostEvent("event-after-retry")),
                                nextOffset = 1,
                                hasMore = false,
                            ),
                        ),
                    ),
                ),
            ),
        )
        val component = eventManagementComponent(loader)
        advance()

        assertTrue(component.events.value.isEmpty())
        assertFalse(component.isLoading.value)
        assertEquals("Failed to load events: offline", component.errorState.value?.message)

        component.retryLoadingEvents()
        component.retryLoadingEvents()
        advance()

        assertEquals(listOf(0, 0), loader.requests.map(HostPageRequest::offset))
        assertEquals(listOf("event-after-retry"), component.events.value.map(Event::id))
        assertNull(component.errorState.value)
        assertFalse(component.isLoading.value)
    }

    @Test
    fun host_events_follow_server_offsets_dedupe_rows_and_expose_load_more_state() =
        runTest(testDispatcher) {
            val firstPage = CompletableDeferred<Result<HostEventPage>>()
            val secondPage = CompletableDeferred<Result<HostEventPage>>()
            val loader = QueuedHostEventPageLoader(
                pages = ArrayDeque(listOf(firstPage, secondPage)),
                cacheEvent = { event -> event.copy(name = "Room ${event.name}") },
            )
            val component = eventManagementComponent(loader)

            advance()

            assertTrue(component.isLoading.value)
            assertFalse(component.isLoadingMore.value)
            assertEquals(listOf(HostPageRequest("host-1", 50, 0)), loader.requests)

            firstPage.complete(
                Result.success(
                    HostEventPage(
                        events = (0 until 50).map { index -> hostEvent("event-$index") },
                        nextOffset = 50,
                        hasMore = true,
                    ),
                ),
            )
            advance()

            assertFalse(component.isLoading.value)
            assertTrue(component.hasMoreEvents.value)
            assertEquals(50, component.events.value.size)

            component.loadMoreEvents()
            component.loadMoreEvents()
            advance()

            assertTrue(component.isLoadingMore.value)
            assertEquals(
                listOf(
                    HostPageRequest("host-1", 50, 0),
                    HostPageRequest("host-1", 50, 50),
                ),
                loader.requests,
            )

            secondPage.complete(
                Result.success(
                    HostEventPage(
                        events = listOf(
                            hostEvent("event-49", name = "Updated event 49"),
                            hostEvent("event-50"),
                        ),
                        nextOffset = 52,
                        hasMore = false,
                    ),
                ),
            )
            advance()

            assertFalse(component.isLoadingMore.value)
            assertFalse(component.hasMoreEvents.value)
            assertEquals(51, component.events.value.size)
            assertEquals("Room Updated event 49", component.events.value[49].name)
            assertEquals("event-50", component.events.value.last().id)
        }

    @Test
    fun failed_load_more_keeps_rows_and_retries_the_same_server_offset() = runTest(testDispatcher) {
        val loader = QueuedHostEventPageLoader(
            ArrayDeque(
                listOf(
                    CompletableDeferred(
                        Result.success(
                            HostEventPage(
                                events = listOf(hostEvent("event-1")),
                                nextOffset = 1,
                                hasMore = true,
                            ),
                        ),
                    ),
                    CompletableDeferred<Result<HostEventPage>>(
                        Result.failure(IllegalStateException("offline")),
                    ),
                    CompletableDeferred(
                        Result.success(
                            HostEventPage(
                                events = listOf(hostEvent("event-2")),
                                nextOffset = 2,
                                hasMore = false,
                            ),
                        ),
                    ),
                ),
            ),
        )
        val component = eventManagementComponent(loader)
        advance()

        component.loadMoreEvents()
        advance()

        assertEquals(listOf("event-1"), component.events.value.map(Event::id))
        assertTrue(component.hasMoreEvents.value)
        assertFalse(component.isLoadingMore.value)
        assertEquals("Failed to load more events: offline", component.errorState.value?.message)

        component.loadMoreEvents()
        advance()

        assertEquals(listOf("event-1", "event-2"), component.events.value.map(Event::id))
        assertFalse(component.hasMoreEvents.value)
        assertNull(component.errorState.value)
        assertEquals(listOf(0, 1, 1), loader.requests.map(HostPageRequest::offset))
    }

    private fun eventManagementComponent(
        loader: QueuedHostEventPageLoader,
    ): DefaultEventManagementComponent = DefaultEventManagementComponent(
        componentContext = activeComponentContext(),
        loadHostEventsPage = loader::load,
        currentUserIds = flowOf("host-1"),
        cachedEvents = loader.cachedEvents,
        navigateToEvent = {},
        onBack = {},
        onCreateEvent = {},
    )
}

private data class HostPageRequest(
    val hostId: String,
    val limit: Int,
    val offset: Int,
)

private class QueuedHostEventPageLoader(
    private val pages: ArrayDeque<CompletableDeferred<Result<HostEventPage>>>,
    private val cacheEvent: (Event) -> Event = { event -> event },
) {
    val requests = mutableListOf<HostPageRequest>()
    val cachedEvents = MutableStateFlow<Result<List<Event>>>(Result.success(emptyList()))

    suspend fun load(hostId: String, limit: Int, offset: Int): Result<HostEventPage> {
        requests += HostPageRequest(hostId, limit, offset)
        return pages.removeFirst().await().also { result ->
            result.onSuccess { page ->
                val eventsById = LinkedHashMap<String, Event>()
                cachedEvents.value.getOrNull().orEmpty().forEach { event ->
                    eventsById[event.id] = event
                }
                page.events.map(cacheEvent).forEach { event -> eventsById[event.id] = event }
                cachedEvents.value = Result.success(eventsById.values.toList())
            }
        }
    }
}

private fun activeComponentContext(): DefaultComponentContext {
    val lifecycle = LifecycleRegistry().apply {
        onCreate()
        onStart()
        onResume()
    }
    return DefaultComponentContext(
        lifecycle = lifecycle,
        backHandler = BackDispatcher(),
    )
}

private fun hostEvent(
    id: String,
    name: String = id,
): Event = Event(
    id = id,
    name = name,
    hostId = "host-1",
    coordinates = listOf(-122.0, 45.0),
    start = Instant.parse("2026-07-13T12:00:00Z"),
    end = Instant.parse("2026-07-13T13:00:00Z"),
    maxParticipants = 16,
    userIds = emptyList(),
    teamIds = emptyList(),
)
