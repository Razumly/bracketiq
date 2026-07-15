@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.core.presentation.composables

import com.razumly.mvp.eventSearch.util.EventFilter
import kotlinx.datetime.TimeZone
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.days
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

class SearchBoxFilterStateTest {
    private val now = Instant.parse("2026-07-13T19:30:00Z")
    private val utc = TimeZone.UTC

    @Test
    fun defaultStartDateDoesNotMakeFilterActive() {
        val filter = EventFilter(date = now to null)

        assertFalse(isFilterActive(filter = filter, now = now, timeZone = utc))
    }

    @Test
    fun changedStartDateMakesFilterActiveWithoutAnEndDate() {
        val filter = EventFilter(date = now + 1.days to null)

        assertTrue(isFilterActive(filter = filter, now = now, timeZone = utc))
    }

    @Test
    fun normalizedSameDayStartMakesFilterActiveAfterRecreation() {
        val filter = EventFilter(date = Instant.parse("2026-07-13T00:00:00Z") to null)

        assertTrue(isFilterActive(filter = filter, now = now, timeZone = utc))
    }

    @Test
    fun selectingStartAfterEndClampsEndForward() {
        val start = Instant.parse("2026-07-10T00:00:00Z")
        val end = Instant.parse("2026-07-20T00:00:00Z")
        val selectedStart = Instant.parse("2026-07-25T00:00:00Z")

        val expectedEnd = Instant.parse("2026-07-25T23:59:59.999999999Z")

        assertEquals(selectedStart to expectedEnd, updateFilterStartDate(start to end, selectedStart, utc))
    }

    @Test
    fun selectingEndBeforeStartClampsStartBackward() {
        val start = Instant.parse("2026-07-10T00:00:00Z")
        val end = Instant.parse("2026-07-20T00:00:00Z")
        val selectedEnd = Instant.parse("2026-07-05T00:00:00Z")

        val inclusiveEnd = normalizeFilterEndDate(selectedEnd, utc)

        assertEquals(selectedEnd to inclusiveEnd, updateFilterEndDate(start to end, inclusiveEnd, utc))
    }

    @Test
    fun inOrderBoundsRemainUnchanged() {
        val start = Instant.parse("2026-07-10T00:00:00Z")
        val end = Instant.parse("2026-07-20T23:59:59.999999999Z")
        val selectedStart = Instant.parse("2026-07-15T00:00:00Z")
        val selectedEnd = Instant.parse("2026-07-18T23:59:59.999999999Z")

        assertEquals(selectedStart to end, updateFilterStartDate(start to end, selectedStart, utc))
        assertEquals(start to selectedEnd, updateFilterEndDate(start to end, selectedEnd, utc))
        assertEquals(start to null, updateFilterEndDate(start to end, null, utc))
    }

    @Test
    fun inclusiveEndDateUsesNextLocalMidnightAcrossDst() {
        val losAngeles = TimeZone.of("America/Los_Angeles")
        val selected = Instant.parse("2026-03-08T18:00:00Z")

        assertEquals(
            Instant.parse("2026-03-09T06:59:59.999999999Z"),
            normalizeFilterEndDate(selected, losAngeles),
        )
    }

    @Test
    fun validPriceInputProducesAppliedRange() {
        val validation = validatePriceRangeInput("12.50", "40")

        assertTrue(validation.isValid)
        assertEquals(12.5 to 40.0, validation.range)
        assertNull(validation.errorMessage)
    }

    @Test
    fun emptyPriceInputIsInvalid() {
        val validation = validatePriceRangeInput("", "40")

        assertFalse(validation.isValid)
        assertNull(validation.range)
        assertEquals("Enter both a minimum and maximum price.", validation.errorMessage)
    }

    @Test
    fun invertedPriceInputIsInvalid() {
        val validation = validatePriceRangeInput("50", "40")

        assertFalse(validation.isValid)
        assertNull(validation.range)
        assertEquals("Minimum price cannot exceed maximum price.", validation.errorMessage)
    }
}
