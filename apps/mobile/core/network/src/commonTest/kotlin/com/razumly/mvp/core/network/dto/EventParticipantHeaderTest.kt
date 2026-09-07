package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Event
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class EventParticipantHeaderTest {
    @Test
    fun givenPartialParticipantHeader_whenMerged_thenKeepsSportSizeAndOtherEventDetails() {
        val event = Event(id = "event", name = "River Cup", hostId = "host", sportIds = listOf("volleyball"),
            teamSizeLimit = 8, maxParticipants = 16, description = "Bring your Team.", location = "River City")
        val updated = EventApiDto(id = "event", name = "River City Cup", maxParticipants = 20, state = "PUBLISHED")
            .mergeParticipantHeader(event)
        assertEquals("River City Cup", updated.name)
        assertEquals(20, updated.maxParticipants)
        assertEquals("PUBLISHED", updated.state)
        assertEquals(listOf("volleyball"), updated.sportIds)
        assertEquals(8, updated.teamSizeLimit)
        assertEquals(event.description, updated.description)
        assertEquals(event.location, updated.location)
    }

    @Test
    fun givenClearedHeaderValues_whenMerged_thenRemovesOldPaymentAndOrganizationData() {
        val event = Event(id = "event", name = "River Cup", hostId = "host",
            organizationId = "old-club", manualPaymentInstructions = "Pay at the old desk",
            archivedAt = "2035-01-01T00:00:00Z")
        val updated = EventApiDto(id = "event", name = "River Cup").mergeParticipantHeader(event)
        assertNull(updated.organizationId)
        assertNull(updated.manualPaymentInstructions)
        assertNull(updated.archivedAt)
    }

    @Test
    fun givenDifferentEvent_whenMerged_thenRejectsTheSnapshot() {
        assertFailsWith<IllegalArgumentException> {
            EventApiDto(id = "other").mergeParticipantHeader(Event(id = "event"))
        }
    }
}
