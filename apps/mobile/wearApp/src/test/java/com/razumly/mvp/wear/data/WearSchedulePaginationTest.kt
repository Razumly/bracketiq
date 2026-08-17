package com.razumly.mvp.wear.data

import kotlinx.coroutines.runBlocking
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class WearSchedulePaginationTest {
    private val windowFrom = Instant.parse("2026-07-01T00:00:00Z")
    private val windowTo = Instant.parse("2026-07-31T00:00:00Z")

    @Test
    fun givenCursorPages_whenLoaded_thenRequestsAndMergesTheCompleteSchedule() = runBlocking {
        val requestedPaths = mutableListOf<String>()
        val pages = ArrayDeque(
            listOf(
                WearScheduleResponseDto(
                    events = listOf(WearEventDto(id = "event_1")),
                    teams = listOf(WearTeamDto(id = "team_1", name = "Original")),
                    pagination = WearSchedulePaginationDto(
                        limit = 200,
                        hasMore = true,
                        nextCursor = "page two/+",
                        isComplete = false,
                        windowFrom = windowFrom.toString(),
                        windowTo = windowTo.toString(),
                    ),
                ),
                WearScheduleResponseDto(
                    events = listOf(WearEventDto(id = "event_2")),
                    teams = listOf(WearTeamDto(id = "team_1", name = "Updated")),
                    pagination = WearSchedulePaginationDto(
                        limit = 200,
                        hasMore = false,
                        isComplete = true,
                        windowFrom = windowFrom.toString(),
                        windowTo = windowTo.toString(),
                    ),
                ),
            ),
        )

        val result = loadCompleteWearSchedule(
            windowFrom = windowFrom,
            windowTo = windowTo,
            loadPage = { path ->
                requestedPaths += path
                pages.removeFirst()
            },
        )

        assertEquals(
            listOf(
                "api/profile/schedule?from=2026-07-01T00%3A00%3A00Z&to=2026-07-31T00%3A00%3A00Z&limit=200",
                "api/profile/schedule?from=2026-07-01T00%3A00%3A00Z&to=2026-07-31T00%3A00%3A00Z&limit=200&cursor=page+two%2F%2B",
            ),
            requestedPaths,
        )
        assertEquals(listOf("event_1", "event_2"), result.events.mapNotNull(WearEventDto::resolvedId))
        assertEquals("Updated", result.teams.single().name)
        assertEquals(true, result.pagination?.isComplete)
    }

    @Test
    fun givenContinuationWithoutPaginationMetadata_whenLoaded_thenFailsClosed() = runBlocking {
        var requestCount = 0

        val failure = runCatching {
            loadCompleteWearSchedule(
                windowFrom = windowFrom,
                windowTo = windowTo,
                loadPage = {
                    requestCount += 1
                    if (requestCount == 1) {
                        WearScheduleResponseDto(
                            pagination = WearSchedulePaginationDto(
                                hasMore = true,
                                nextCursor = "cursor_2",
                                isComplete = false,
                            ),
                        )
                    } else {
                        WearScheduleResponseDto(events = listOf(WearEventDto(id = "event_1")))
                    }
                },
            )
        }.exceptionOrNull()

        val typedFailure = assertIs<IllegalStateException>(failure)
        assertEquals(
            "Wear schedule response dropped pagination metadata during continuation.",
            typedFailure.message,
        )
    }

    @Test
    fun givenAProgressingButUnfinishedCursorStream_whenThePageLimitIsReached_thenFailsClosed() = runBlocking {
        var requestCount = 0

        val failure = runCatching {
            loadCompleteWearSchedule(
                windowFrom = windowFrom,
                windowTo = windowTo,
                loadPage = {
                    requestCount += 1
                    WearScheduleResponseDto(
                        pagination = WearSchedulePaginationDto(
                            hasMore = true,
                            nextCursor = "cursor_${requestCount + 1}",
                            isComplete = false,
                        ),
                    )
                },
                maxPages = 2,
            )
        }.exceptionOrNull()

        val typedFailure = assertIs<IllegalStateException>(failure)
        assertEquals("Wear schedule endpoint exceeded the safe pagination limit.", typedFailure.message)
        assertEquals(2, requestCount)
    }
}
