package com.razumly.mvp.core.presentation.composables

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BillingAddressAutocompleteTest {
    @Test
    fun givenGooglePlaceDetails_whenConverted_thenBuildsCompleteUsBillingAddress() {
        val details = GooglePlaceDetails(
            id = "place_123",
            formattedAddress = "1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA",
            addressComponents = listOf(
                component("1600", "1600", "street_number"),
                component("Amphitheatre Parkway", "Amphitheatre Pkwy", "route"),
                component("Mountain View", "Mountain View", "locality"),
                component("California", "CA", "administrative_area_level_1"),
                component("94043", "94043", "postal_code"),
                component("United States", "US", "country"),
            ),
        )

        val draft = details.toBillingAddressDraft().normalized()

        assertEquals("1600 Amphitheatre Parkway", draft.line1)
        assertEquals("Mountain View", draft.city)
        assertEquals("CA", draft.state)
        assertEquals("94043", draft.postalCode)
        assertEquals("US", draft.countryCode)
        assertTrue(draft.isCompleteForUsTax())
    }

    @Test
    fun givenPostalSuffix_whenConverted_thenBuildsZipPlusFour() {
        val details = GooglePlaceDetails(
            formattedAddress = "2130 N Q St, Washougal, WA 98671-1234, USA",
            addressComponents = listOf(
                component("2130", "2130", "street_number"),
                component("North Q Street", "N Q St", "route"),
                component("Washougal", "Washougal", "locality"),
                component("Washington", "WA", "administrative_area_level_1"),
                component("98671", "98671", "postal_code"),
                component("1234", "1234", "postal_code_suffix"),
                component("United States", "US", "country"),
            ),
        )

        val draft = details.toBillingAddressDraft().normalized()

        assertEquals("98671-1234", draft.postalCode)
        assertTrue(draft.isCompleteForUsTax())
    }

    @Test
    fun givenMissingStreetComponents_whenConverted_thenUsesFormattedAddressFirstLine() {
        val details = GooglePlaceDetails(
            formattedAddress = "500 Market St, San Francisco, CA 94105, USA",
            addressComponents = listOf(
                component("San Francisco", "San Francisco", "locality"),
                component("California", "CA", "administrative_area_level_1"),
                component("94105", "94105", "postal_code"),
                component("United States", "US", "country"),
            ),
        )

        val draft = details.toBillingAddressDraft().normalized()

        assertEquals("500 Market St", draft.line1)
        assertEquals("San Francisco", draft.city)
        assertEquals("CA", draft.state)
        assertEquals("94105", draft.postalCode)
        assertEquals("US", draft.countryCode)
    }

    private fun component(
        longText: String,
        shortText: String,
        vararg types: String,
    ): GoogleAddressComponent = GoogleAddressComponent(
        longText = longText,
        shortText = shortText,
        types = types.toList(),
    )
}

