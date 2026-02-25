@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventSearch.util

import com.razumly.mvp.core.data.dataTypes.Event
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.days
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

class EventFilterTest {
    private val now = Instant.parse("2026-02-25T00:00:00Z")

    @Test
    fun givenPastEvent_whenIncludePastEventsDisabled_thenFilterReturnsFalse() {
        val filter = EventFilter(date = now to null)
        val event = eventAt(now - 1.days)

        assertFalse(filter.filter(event))
    }

    @Test
    fun givenPastEvent_whenIncludePastEventsEnabled_thenFilterReturnsTrue() {
        val filter = EventFilter(date = now to null)
        val event = eventAt(now - 1.days)

        assertTrue(filter.filter(event, includePastEvents = true))
    }

    @Test
    fun givenEndDate_whenEventStartsAfterEnd_thenFilterReturnsFalse() {
        val filter = EventFilter(date = now to now + 1.days)
        val event = eventAt(now + 2.days)

        assertFalse(filter.filter(event, includePastEvents = true))
    }

    private fun eventAt(start: Instant): Event = Event(
        name = "Test League",
        start = start,
        end = start,
        state = "PUBLISHED",
    )
}
