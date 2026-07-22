@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.eventSearch.util.EventFilter
import kotlinx.coroutines.CancellationException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant

class NativeDiscoverBridgeTest {
    @Test
    fun givenPopulatedFilter_whenProjectedForSwift_thenAllValuesAreStableAndSorted() {
        val start = Instant.fromEpochSeconds(1_700_000_000)
        val end = Instant.fromEpochSeconds(1_800_000_000)
        val snapshot = EventFilter(
            price = 15.0 to 75.0,
            date = start to end,
            sportIds = setOf("volleyball", "basketball"),
            tagSlugs = setOf("tryouts", "camp"),
            divisionGenders = setOf("WOMENS", "COED"),
            skillDivisionTypeIds = setOf("advanced", "beginner"),
            ageDivisionTypeIds = setOf("adult", "youth"),
            divisionPriceMin = 20.0,
            divisionPriceMax = 60.0,
        ).toNativeDiscoverFilterSnapshot()

        assertTrue(snapshot.priceEnabled)
        assertEquals(15.0, snapshot.priceMin)
        assertEquals(75.0, snapshot.priceMax)
        assertEquals(start, snapshot.startDate)
        assertEquals(end, snapshot.endDate)
        assertEquals(listOf("basketball", "volleyball"), snapshot.sportIds)
        assertEquals(listOf("camp", "tryouts"), snapshot.tagSlugs)
        assertEquals(listOf("COED", "WOMENS"), snapshot.divisionGenders)
        assertEquals(listOf("advanced", "beginner"), snapshot.skillDivisionTypeIds)
        assertEquals(listOf("adult", "youth"), snapshot.ageDivisionTypeIds)
        assertTrue(snapshot.divisionPriceMinEnabled)
        assertEquals(20.0, snapshot.divisionPriceMin)
        assertTrue(snapshot.divisionPriceMaxEnabled)
        assertEquals(60.0, snapshot.divisionPriceMax)
    }

    @Test
    fun givenUnboundedFilter_whenProjectedForSwift_thenExplicitDefaultsReplaceNulls() {
        val start = Instant.fromEpochSeconds(1_700_000_000)
        val snapshot = EventFilter(date = start to null).toNativeDiscoverFilterSnapshot()

        assertFalse(snapshot.priceEnabled)
        assertEquals(0.0, snapshot.priceMin)
        assertEquals(200.0, snapshot.priceMax)
        assertEquals(start, snapshot.startDate)
        assertNull(snapshot.endDate)
        assertFalse(snapshot.divisionPriceMinEnabled)
        assertEquals(0.0, snapshot.divisionPriceMin)
        assertFalse(snapshot.divisionPriceMaxEnabled)
        assertEquals(0.0, snapshot.divisionPriceMax)
    }

    @Test
    fun givenSwiftFilterValues_whenNormalized_thenBlanksAreRemovedAndWhitespaceIsTrimmed() {
        assertEquals(
            setOf("basketball", "tryouts"),
            normalizedDiscoverFilterValues(
                listOf(" basketball ", "", "  ", "tryouts", "basketball"),
            ),
        )
    }

    @Test
    fun givenDebouncedSearchCancellation_whenEvaluatingFailure_thenItIsNotReportedToTheUser() {
        assertFalse(shouldReportDiscoverFailure(CancellationException("superseded query")))
        assertFalse(shouldReportDiscoverFailure(null))
        assertTrue(shouldReportDiscoverFailure(IllegalStateException("server unavailable")))
    }

    @Test
    fun givenSubmittedSearch_whenFilteringCurrentContent_thenEveryTokenCanMatchASeparateField() {
        val matching = Event(
            id = "matching",
            name = "Cascade Gresham",
            location = "Basketball Center",
        )
        val nonMatching = Event(
            id = "non-matching",
            name = "Downtown Volleyball",
            location = "Portland Gym",
        )

        val snapshot = buildNativeDiscoverSearchSnapshot(
            query = "  gReShAm   basketball ",
            events = listOf(matching, nonMatching),
            organizations = emptyList(),
            teams = emptyList(),
            rentals = emptyList(),
        )

        assertEquals(listOf("matching"), snapshot.events.map(Event::id))
    }

    @Test
    fun givenBlankSubmittedSearch_whenFilteringCurrentContent_thenAllItemsRemainVisible() {
        val events = listOf(
            Event(id = "one", name = "One"),
            Event(id = "two", name = "Two"),
        )

        val snapshot = buildNativeDiscoverSearchSnapshot(
            query = "  ",
            events = events,
            organizations = emptyList(),
            teams = emptyList(),
            rentals = emptyList(),
        )

        assertEquals(events, snapshot.events)
    }
}
