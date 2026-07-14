package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class EventDetailMapPresentationTest {
    @Test
    fun toSelectedEventLocationPlace_mapsEditableLocation() {
        val place = Event(
            location = "Main Gym",
            address = "123 Main St",
            coordinates = listOf(-122.6, 45.5),
        ).toSelectedEventLocationPlace()

        assertEquals("Main Gym", place?.name)
        assertEquals(listOf(-122.6, 45.5), place?.coordinates)
        assertEquals("123 Main St", place?.address)
    }

    @Test
    fun toSelectedEventLocationPlace_requiresNamedCoordinates() {
        assertNull(Event(location = "", coordinates = listOf(-122.6, 45.5)).toSelectedEventLocationPlace())
        assertNull(Event(location = "Main Gym", coordinates = listOf(0.0, 0.0)).toSelectedEventLocationPlace())
    }
}
