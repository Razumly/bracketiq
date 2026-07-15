package com.razumly.mvp.core.presentation.composables

import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.coroutines.Continuation
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class BillingAddressAutocompleteTest {
    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun givenManualEdit_whenOldResolutionCompletes_thenStaleAddressIsIgnored() = runTest {
        val pending = mutableMapOf<String, Continuation<Result<BillingAddressDraft>>>()
        val resolved = mutableListOf<BillingAddressDraft>()
        var finishedCount = 0
        val coordinator = BillingAddressResolutionCoordinator(
            scope = this,
            resolveAddress = { placeId ->
                suspendCoroutine { continuation -> pending[placeId] = continuation }
            },
        )

        coordinator.resolve(
            placeId = "old-place",
            onResolved = resolved::add,
            onFailure = { error -> throw error },
            onFinished = { finishedCount += 1 },
        )
        runCurrent()

        coordinator.invalidate()
        pending.getValue("old-place").resume(Result.success(address(line1 = "Old address")))
        runCurrent()

        assertTrue(resolved.isEmpty())
        assertEquals(0, finishedCount)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun givenNewerSelection_whenResponsesCompleteOutOfOrder_thenOnlyLatestAddressIsApplied() = runTest {
        val pending = mutableMapOf<String, Continuation<Result<BillingAddressDraft>>>()
        val resolved = mutableListOf<BillingAddressDraft>()
        var finishedCount = 0
        val coordinator = BillingAddressResolutionCoordinator(
            scope = this,
            resolveAddress = { placeId ->
                suspendCoroutine { continuation -> pending[placeId] = continuation }
            },
        )

        listOf("old-place", "new-place").forEach { placeId ->
            coordinator.resolve(
                placeId = placeId,
                onResolved = resolved::add,
                onFailure = { error -> throw error },
                onFinished = { finishedCount += 1 },
            )
            runCurrent()
        }

        pending.getValue("new-place").resume(Result.success(address(line1 = "New address")))
        runCurrent()
        pending.getValue("old-place").resume(Result.success(address(line1 = "Old address")))
        runCurrent()

        assertEquals(listOf("New address"), resolved.map(BillingAddressDraft::line1))
        assertEquals(1, finishedCount)
    }

    @Test
    fun givenRestrictedKeyHeaders_whenFindingSuggestions_thenSendsGooglePlacesIdentityHeaders() = runTest {
        var packageHeader: String? = null
        var certHeader: String? = null
        val client = HttpClient(
            MockEngine { request ->
                packageHeader = request.headers["X-Android-Package"]
                certHeader = request.headers["X-Android-Cert"]
                respond(
                    content = """
                        {
                          "suggestions": [
                            {
                              "placePrediction": {
                                "placeId": "place_123",
                                "text": { "text": "1600 Amphitheatre Parkway, Mountain View, CA" },
                                "structuredFormat": {
                                  "mainText": { "text": "1600 Amphitheatre Parkway" },
                                  "secondaryText": { "text": "Mountain View, CA" }
                                }
                              }
                            }
                          ]
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            },
        ) {
            install(ContentNegotiation) {
                json(jsonMVP)
            }
        }
        val provider = GooglePlacesBillingAddressProvider(
            httpClient = client,
            apiKey = "test-key",
            requestHeaders = mapOf(
                "X-Android-Package" to "com.razumly.mvp",
                "X-Android-Cert" to "ABC123",
            ),
        )

        val result = provider.findSuggestions("1600 Amphitheatre").getOrThrow()

        assertEquals("com.razumly.mvp", packageHeader)
        assertEquals("ABC123", certHeader)
        assertEquals(1, result.size)
        assertEquals("1600 Amphitheatre Parkway", result.single().primaryText)
        assertNotNull(result.single().placeId)
    }

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

    private fun address(line1: String): BillingAddressDraft = BillingAddressDraft(
        line1 = line1,
        city = "Portland",
        state = "OR",
        postalCode = "97205",
        countryCode = "US",
    )
}
