package com.razumly.mvp.core.data.dataTypes

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EventCoordinatesTest {
    @Test
    fun usableLatitudeLongitude_acceptsValidStoredLongitudeLatitudePairs() {
        val event = Event(coordinates = listOf(-122.6784, 45.5152))

        assertEquals(45.5152 to -122.6784, event.usableLatitudeLongitude())
        assertTrue(event.hasUsableCoordinates())
    }

    @Test
    fun usableLatitudeLongitude_rejectsPlaceholderCoordinates() {
        val event = Event(coordinates = listOf(0.0, 0.0))

        assertNull(event.usableLatitudeLongitude())
        assertFalse(event.hasUsableCoordinates())
    }

    @Test
    fun usableLatitudeLongitude_rejectsOutOfRangeCoordinates() {
        val event = Event(coordinates = listOf(-181.0, 45.0))

        assertNull(event.usableLatitudeLongitude())
        assertFalse(event.hasUsableCoordinates())
    }
}
