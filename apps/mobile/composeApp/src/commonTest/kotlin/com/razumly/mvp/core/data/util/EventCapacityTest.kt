package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import kotlin.test.Test
import kotlin.test.assertEquals

class EventCapacityTest {

    @Test
    fun singleDivision_usesEventCapacity() {
        val event = Event(
            singleDivision = true,
            maxParticipants = 16,
            divisionDetails = listOf(
                DivisionDetail(
                    id = "evt_1__division__open",
                    maxParticipants = 8,
                ),
            ),
        )

        assertEquals(16, event.resolveParticipantCapacity())
    }

    @Test
    fun splitDivision_sumsDivisionCapacities() {
        val event = Event(
            singleDivision = false,
            maxParticipants = 12,
            divisionDetails = listOf(
                DivisionDetail(id = "evt_1__division__open", maxParticipants = 8),
                DivisionDetail(id = "evt_1__division__a", maxParticipants = 10),
            ),
        )

        assertEquals(18, event.resolveParticipantCapacity())
    }

    @Test
    fun splitDivision_fallsBackWhenDivisionCapacitiesMissing() {
        val event = Event(
            singleDivision = false,
            maxParticipants = 14,
            divisionDetails = listOf(
                DivisionDetail(id = "evt_1__division__open", maxParticipants = null),
                DivisionDetail(id = "evt_1__division__a", maxParticipants = 0),
            ),
        )

        assertEquals(14, event.resolveParticipantCapacity())
    }
}
