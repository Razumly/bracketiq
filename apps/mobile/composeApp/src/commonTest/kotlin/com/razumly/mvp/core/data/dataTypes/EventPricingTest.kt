package com.razumly.mvp.core.data.dataTypes

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventPricingTest {
    @Test
    fun resolvedDivisionPriceCents_fallsBackToEventPrice_whenNoDivisionPriceExists() {
        val event = Event(
            id = "event-1",
            priceCents = 5000,
        )

        assertEquals(5000, event.resolvedDivisionPriceCents())
        assertEquals("$50.00", event.divisionPriceRangeLabel())
        assertTrue(event.hasAnyPaidDivision())
    }

    @Test
    fun divisionPriceRange_usesExplicitDivisionPrices_forMultiDivisionEvents() {
        val event = Event(
            id = "event-2",
            singleDivision = false,
            priceCents = 0,
            divisions = listOf("division_a", "division_b"),
            divisionDetails = listOf(
                DivisionDetail(id = "division_a", key = "division_a", name = "Division A", price = 3500),
                DivisionDetail(id = "division_b", key = "division_b", name = "Division B", price = 5000),
            ),
        )

        assertEquals(
            EventPriceRange(minPriceCents = 3500, maxPriceCents = 5000),
            event.divisionPriceRange(),
        )
        assertEquals("$35.00 - $50.00", event.divisionPriceRangeLabel())
        assertTrue(event.hasAnyPaidDivision())
    }

    @Test
    fun resolvedDivisionPriceCents_usesSingleDivisionDetailPrice_whenPresent() {
        val event = Event(
            id = "event-3",
            singleDivision = true,
            priceCents = 5000,
            divisions = listOf("division_a"),
            divisionDetails = listOf(
                DivisionDetail(id = "division_a", key = "division_a", name = "Division A", price = 6500),
            ),
        )

        assertEquals(6500, event.resolvedDivisionPriceCents())
        assertEquals("$65.00", event.divisionPriceRangeLabel())
    }

    @Test
    fun divisionPriceRange_doesNotFallBackToEventPrice_whenDivisionPriceMissing() {
        val event = Event(
            id = "event-4",
            singleDivision = false,
            priceCents = 5000,
            divisions = listOf("division_a", "division_b"),
            divisionDetails = listOf(
                DivisionDetail(id = "division_a", key = "division_a", name = "Division A", price = 0),
                DivisionDetail(id = "division_b", key = "division_b", name = "Division B"),
            ),
        )

        assertEquals(
            EventPriceRange(minPriceCents = 0, maxPriceCents = 0, hasMissingPrices = true),
            event.divisionPriceRange(),
        )
        assertEquals("Free", event.divisionPriceRangeLabel())
        assertFalse(event.hasAnyPaidDivision())
    }

    @Test
    fun hasAnyPaidDivision_returnsFalse_whenEveryDivisionIsFree() {
        val event = Event(
            id = "event-5",
            singleDivision = false,
            priceCents = 0,
            divisions = listOf("division_a"),
            divisionDetails = listOf(
                DivisionDetail(id = "division_a", key = "division_a", name = "Division A", price = 0),
            ),
        )

        assertFalse(event.hasAnyPaidDivision())
        assertEquals("Free", event.divisionPriceRangeLabel())
    }
}
