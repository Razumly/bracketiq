package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import kotlin.test.Test
import kotlin.test.assertEquals

class EventCapacityTest {

    @Test
    fun singleDivision_usesDivisionCapacity() {
        val event = Event(
            singleDivision = true,
            maxParticipants = 16,
            divisions = listOf("evt_1__division__open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "evt_1__division__open",
                    maxParticipants = 8,
                ),
            ),
        )

        assertEquals(8, event.resolveParticipantCapacity())
    }

    @Test
    fun splitDivision_sumsDivisionCapacities() {
        val event = Event(
            singleDivision = false,
            maxParticipants = 12,
            divisions = listOf("evt_1__division__open", "evt_1__division__a"),
            divisionDetails = listOf(
                DivisionDetail(id = "evt_1__division__open", maxParticipants = 8),
                DivisionDetail(id = "evt_1__division__a", maxParticipants = 10),
            ),
        )

        assertEquals(18, event.resolveParticipantCapacity())
    }

    @Test
    fun splitLeaguePlayoffs_excludesPlayoffDivisionCapacities() {
        val event = Event(
            id = "evt_1",
            singleDivision = false,
            maxParticipants = 8,
            divisions = listOf("evt_1__division__open", "evt_1__division__a"),
            divisionDetails = listOf(
                DivisionDetail(id = "evt_1__division__open", name = "Open", maxParticipants = 8),
                DivisionDetail(id = "evt_1__division__a", name = "A", maxParticipants = 8),
                DivisionDetail(
                    id = "evt_1__division__playoff_1",
                    name = "Upper Division",
                    kind = "PLAYOFF",
                    maxParticipants = 8,
                ),
                DivisionDetail(
                    id = "evt_1__division__playoff_2",
                    name = "Lower Division",
                    kind = "PLAYOFF",
                    maxParticipants = 8,
                ),
            ),
        )

        assertEquals(16, event.resolveParticipantCapacity())
    }

    @Test
    fun splitDivision_returnsZeroWhenDivisionCapacitiesMissing() {
        val event = Event(
            singleDivision = false,
            maxParticipants = 14,
            divisions = listOf("evt_1__division__open", "evt_1__division__a"),
            divisionDetails = listOf(
                DivisionDetail(id = "evt_1__division__open", maxParticipants = null),
                DivisionDetail(id = "evt_1__division__a", maxParticipants = 0),
            ),
        )

        assertEquals(0, event.resolveParticipantCapacity())
    }
}
