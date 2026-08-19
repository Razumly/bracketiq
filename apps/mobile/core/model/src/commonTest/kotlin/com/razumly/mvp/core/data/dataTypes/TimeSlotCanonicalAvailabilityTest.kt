package com.razumly.mvp.core.data.dataTypes

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
class TimeSlotCanonicalAvailabilityTest {
    private fun slot(
        id: String = "slot-1",
        startMinutes: Int = 9 * 60,
        endMinutes: Int = 10 * 60,
        resourceIds: List<String> = listOf("resource-1"),
        divisionIds: List<String> = listOf("division-1"),
    ) = TimeSlot(
        id = id,
        dayOfWeek = null,
        startDate = Instant.parse("2026-08-17T04:00:00Z"),
        endDate = Instant.parse("2026-08-17T04:00:00Z"),
        startTimeMinutes = startMinutes,
        endTimeMinutes = endMinutes,
        timeZone = "America/New_York",
        repeating = false,
        scheduledFieldId = resourceIds.firstOrNull(),
        scheduledFieldIds = resourceIds,
        divisions = divisionIds,
        price = null,
    )

    @Test
    fun given_one_time_slot_when_resolved_then_returns_exact_local_interval() {
        val resolved = slot().resolveOneTimeInterval()

        assertEquals("2026-08-17", resolved.localDate)
        assertEquals(Instant.parse("2026-08-17T13:00:00Z"), resolved.start)
        assertEquals(Instant.parse("2026-08-17T14:00:00Z"), resolved.end)
        assertEquals(listOf("resource-1"), resolved.resourceIds)
        assertEquals(listOf("division-1"), resolved.divisionIds)
    }

    @Test
    fun given_repeating_overnight_slot_when_checked_then_reports_next_day() {
        assertTrue(
            slot(startMinutes = 23 * 60, endMinutes = 60).copy(repeating = true).hasOvernightWindow(),
        )
        assertFalse(
            slot(startMinutes = 9 * 60, endMinutes = 10 * 60).copy(repeating = true).hasOvernightWindow(),
        )
        assertFalse(
            slot(startMinutes = 23 * 60, endMinutes = 60).hasOvernightWindow(),
        )
    }

    @Test
    fun given_explicit_instants_when_resolved_then_preserves_seconds() {
        val resolved = slot().copy(
            startDate = Instant.parse("2026-08-17T13:00:17Z"),
            endDate = Instant.parse("2026-08-17T14:00:43Z"),
        ).resolveOneTimeInterval()

        assertEquals(Instant.parse("2026-08-17T13:00:17Z"), resolved.start)
        assertEquals(Instant.parse("2026-08-17T14:00:43Z"), resolved.end)
    }

    @Test
    fun given_adjacent_slots_when_resources_differ_then_ignores_overlap() {
        assertNull(
            findOneTimeTimeSlotConflict(
                slots = listOf(slot(), slot("adjacent", 10 * 60, 11 * 60)),
                eligibleResourceIds = listOf("resource-1"),
                eligibleDivisionIds = listOf("division-1"),
            ),
        )
        assertNull(
            findOneTimeTimeSlotConflict(
                slots = listOf(slot(), slot("other-resource", resourceIds = listOf("resource-2"))),
                eligibleResourceIds = listOf("resource-1", "resource-2"),
                eligibleDivisionIds = listOf("division-1"),
            ),
        )
        val divisionConflict = findOneTimeTimeSlotConflict(
            slots = listOf(slot(), slot("other-division", divisionIds = listOf("division-2"))),
            eligibleResourceIds = listOf("resource-1"),
            eligibleDivisionIds = listOf("division-1", "division-2"),
        )
        assertNotNull(divisionConflict)
        assertNull(divisionConflict.divisionId)
        assertEquals(listOf("division-1"), divisionConflict.firstDivisionScope)
        assertEquals(listOf("division-2"), divisionConflict.secondDivisionScope)
    }

    @Test
    fun given_overlapping_slots_when_resources_match_then_reports_precise_conflict() {
        val error = assertFailsWith<OneTimeTimeSlotValidationException> {
            validateOneTimeTimeSlots(
                slots = listOf(slot(), slot("slot-2", 9 * 60 + 30, 10 * 60 + 30)),
                eventStart = Instant.parse("2026-08-17T12:00:00Z"),
                eventEnd = Instant.parse("2026-08-17T16:00:00Z"),
                eligibleResourceIds = listOf("resource-1"),
                eligibleDivisionIds = listOf("division-1"),
            )
        }

        assertTrue(error.message.orEmpty().contains("Resource \"resource-1\""))
        assertTrue(error.message.orEmpty().contains("2026-08-17 09:00–10:00"))
        assertTrue(error.message.orEmpty().contains("2026-08-17 09:30–10:30"))
    }

    @Test
    fun given_slot_outside_event_bounds_when_validated_then_rejects_without_clipping() {
        val error = assertFailsWith<OneTimeTimeSlotValidationException> {
            validateOneTimeTimeSlots(
                slots = listOf(slot()),
                eventStart = Instant.parse("2026-08-17T13:30:00Z"),
                eventEnd = Instant.parse("2026-08-17T15:00:00Z"),
                eligibleResourceIds = listOf("resource-1"),
                eligibleDivisionIds = listOf("division-1"),
            )
        }

        assertTrue(error.message.orEmpty().contains("rejected rather than clipped"))
    }
}
