package com.razumly.mvp.core.data.dataTypes

import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
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
    fun given_expired_slot_when_saving_then_rejects_but_keeps_reads_valid() {
        val historical = slot()
        val resolved = historical.resolveOneTimeInterval()
        assertFailsWith<OneTimeTimeSlotValidationException> { historical.assertFutureOneTimeEnd(resolved.end) }
        historical.assertFutureOneTimeEnd(Instant.parse("2026-08-17T13:30:00Z"))
        assertEquals(Instant.parse("2026-08-17T14:00:00Z"), historical.resolveOneTimeInterval().end)
    }

    @Test
    fun given_one_time_overnight_slot_when_resolved_then_ends_on_next_date() {
        val resolved = slot(startMinutes = 22 * 60, endMinutes = 2 * 60).resolveOneTimeInterval()
        assertEquals(Instant.parse("2026-08-18T02:00:00Z"), resolved.start)
        assertEquals(Instant.parse("2026-08-18T06:00:00Z"), resolved.end)
    }

    @Test
    fun given_equal_clock_times_when_resolved_then_spans_one_local_day() {
        val resolved = slot(endMinutes = 9 * 60).resolveOneTimeInterval()
        assertEquals(Instant.parse("2026-08-18T13:00:00Z"), resolved.end)
    }

    @Test
    fun given_multiple_local_days_when_resolved_then_rejects_without_clipping() {
        assertFailsWith<OneTimeTimeSlotValidationException> {
            slot().copy(endDate = Instant.parse("2026-08-19T14:00:00Z")).resolveOneTimeInterval()
        }
    }

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
    fun given_repeating_overnight_slot_when_resolved_then_matches_site_canonical_fixture() {
        val resolved = slot(
            startMinutes = 22 * 60,
            endMinutes = 2 * 60,
        ).copy(
            dayOfWeek = 5,
            daysOfWeek = listOf(5),
            startDate = Instant.parse("2026-02-01T05:00:00Z"),
            endDate = Instant.parse("2026-03-31T04:00:00Z"),
            repeating = true,
        ).resolveRepeatingOccurrence(LocalDate(2026, 2, 28))

        assertEquals(LocalDate(2026, 2, 28), resolved.occurrenceDate)
        assertEquals(LocalDate(2026, 3, 1), resolved.endDate)
        assertEquals(Instant.parse("2026-03-01T03:00:00Z"), resolved.start)
        assertEquals(Instant.parse("2026-03-01T07:00:00Z"), resolved.end)
        assertEquals(240, resolved.durationMinutes)
        assertEquals("Sunday", resolved.nextWeekday)
    }

    @Test
    fun given_overnight_slot_crossing_dst_when_resolved_then_preserves_elapsed_duration() {
        val resolved = slot(
            startMinutes = 23 * 60,
            endMinutes = 4 * 60,
        ).copy(
            dayOfWeek = 5,
            daysOfWeek = listOf(5),
            startDate = Instant.parse("2026-03-01T05:00:00Z"),
            endDate = Instant.parse("2026-03-31T04:00:00Z"),
            repeating = true,
        ).resolveRepeatingOccurrence(LocalDate(2026, 3, 7))

        assertEquals(Instant.parse("2026-03-08T04:00:00Z"), resolved.start)
        assertEquals(Instant.parse("2026-03-08T08:00:00Z"), resolved.end)
        assertEquals(240, resolved.durationMinutes)
    }

    @Test
    fun given_repeating_slot_in_dst_gap_when_resolved_then_rejects_local_time() {
        val error = assertFailsWith<RepeatingTimeSlotValidationException> {
            slot(
                startMinutes = 2 * 60 + 30,
                endMinutes = 4 * 60,
            ).copy(
                dayOfWeek = 6,
                daysOfWeek = listOf(6),
                startDate = Instant.parse("2026-03-08T05:00:00Z"),
                endDate = Instant.parse("2026-03-09T04:00:00Z"),
                repeating = true,
            ).resolveRepeatingOccurrence(LocalDate(2026, 3, 8))
        }

        assertTrue(error.message.orEmpty().contains("does not exist"))
        assertTrue(error.message.orEmpty().contains("2026-03-08"))
    }

    @Test
    fun given_repeating_slot_in_dst_fold_when_resolved_then_rejects_ambiguous_time() {
        val error = assertFailsWith<RepeatingTimeSlotValidationException> {
            slot(
                startMinutes = 1 * 60 + 30,
                endMinutes = 3 * 60,
            ).copy(
                dayOfWeek = 6,
                daysOfWeek = listOf(6),
                startDate = Instant.parse("2026-11-01T04:00:00Z"),
                endDate = Instant.parse("2026-11-02T05:00:00Z"),
                repeating = true,
            ).resolveRepeatingOccurrence(LocalDate(2026, 11, 1))
        }

        assertTrue(error.message.orEmpty().contains("ambiguous"))
        assertTrue(error.message.orEmpty().contains("2026-11-01"))
    }

    @Test
    fun given_repeating_slot_with_final_date_when_enumerating_wide_window_then_skips_out_of_bounds_dates() {
        val occurrences = slot(
            startMinutes = 9 * 60,
            endMinutes = 10 * 60,
        ).copy(
            dayOfWeek = 0,
            daysOfWeek = listOf(0),
            startDate = Instant.parse("2026-08-17T04:00:00Z"),
            endDate = Instant.parse("2026-08-18T04:00:00Z"),
            repeating = true,
        ).enumerateRepeatingTimeSlotOccurrences(
            windowStart = Instant.parse("2026-08-17T00:00:00Z"),
            windowEnd = Instant.parse("2026-08-25T00:00:00Z"),
        )

        assertEquals(1, occurrences.size)
        assertEquals(LocalDate(2026, 8, 17), occurrences.single().occurrenceDate)
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
    fun given_duration_over_one_local_day_by_seconds_when_resolved_then_rejects() {
        assertFailsWith<OneTimeTimeSlotValidationException> {
            slot(startMinutes = 9 * 60, endMinutes = 9 * 60).copy(
                startDate = Instant.parse("2026-08-17T13:00:17Z"),
                endDate = Instant.parse("2026-08-18T13:00:43Z"),
            ).resolveOneTimeInterval()
        }
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
