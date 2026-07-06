package com.razumly.mvp.core.data.dataTypes

import kotlin.test.Test
import kotlin.test.assertEquals

class EventAffiliatePricingTest {
    @Test
    fun displayPriceRangeLabel_usesDivisionPricesForAffiliateEvents() {
        val event = Event(
            id = "affiliate-event-1",
            affiliateUrl = "https://example.com/register",
            singleDivision = false,
            priceCents = 169500,
            divisions = listOf("open", "over_65"),
            divisionDetails = listOf(
                DivisionDetail(id = "open", key = "open", name = "Open", price = 229500),
                DivisionDetail(id = "over_65", key = "over_65", name = "Over 65", price = 169500),
            ),
        )

        assertEquals("$1695.00 - $2295.00", event.displayPriceRangeLabel())
    }

    @Test
    fun displayPriceRangeLabel_usesEventPriceForAffiliateEventsWithoutDivisions() {
        val event = Event(
            id = "affiliate-event-2",
            affiliateUrl = "https://example.com/register",
            priceCents = 53000,
        )

        assertEquals("$530.00", event.displayPriceRangeLabel())
    }

    @Test
    fun displayPriceRangeLabel_reportsMissingAffiliatePriceWhenNoNumericPriceExists() {
        val event = Event(
            id = "affiliate-event-3",
            affiliateUrl = "https://example.com/register",
            priceCents = 0,
        )

        assertEquals("Price not specified", event.displayPriceRangeLabel())
    }

    @Test
    fun displayPriceRangeLabel_usesEventPriceForAffiliateEventsWhenDivisionPricesAreMissing() {
        val event = Event(
            id = "affiliate-event-4",
            affiliateUrl = "https://example.com/register",
            priceCents = 7500,
            divisions = listOf("open"),
            divisionDetails = listOf(
                DivisionDetail(id = "open", key = "open", name = "Open"),
            ),
        )

        assertEquals("$75.00", event.displayPriceRangeLabel())
    }

    @Test
    fun displayPriceRangeLabel_keepsExplicitFreeAffiliateDivisionPrice() {
        val event = Event(
            id = "affiliate-event-5",
            affiliateUrl = "https://example.com/register",
            priceCents = 0,
            divisions = listOf("new_player"),
            divisionDetails = listOf(
                DivisionDetail(id = "new_player", key = "new_player", name = "New Player", price = 0),
            ),
        )

        assertEquals("Free", event.displayPriceRangeLabel())
    }
}
