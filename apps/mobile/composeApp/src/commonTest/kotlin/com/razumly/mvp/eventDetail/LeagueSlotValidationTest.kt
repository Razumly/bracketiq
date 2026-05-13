package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.TimeSlot
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Instant

class LeagueSlotValidationTest {
    @Test
    fun non_repeating_slot_requires_start_and_end_datetime() {
        val slot = buildSlot(
            id = "slot-1",
            repeating = false,
            startDate = instant(1_700_000_000_000),
            endDate = null,
            scheduledFieldId = "field-1",
        )

        val errors = computeLeagueSlotErrors(
            slots = listOf(slot),
            singleDivision = false,
            selectedDivisionIds = emptyList(),
        )

        assertEquals("Select start and end date/time.", errors[0])
    }

    @Test
    fun non_repeating_slots_report_overlap_when_datetime_ranges_conflict_on_same_field() {
        val first = buildSlot(
            id = "slot-1",
            repeating = false,
            startDate = instant(1_700_000_000_000),
            endDate = instant(1_700_001_800_000),
            scheduledFieldId = "field-1",
        )
        val second = buildSlot(
            id = "slot-2",
            repeating = false,
            startDate = instant(1_700_000_900_000),
            endDate = instant(1_700_002_700_000),
            scheduledFieldId = "field-1",
        )

        val errors = computeLeagueSlotErrors(
            slots = listOf(first, second),
            singleDivision = false,
            selectedDivisionIds = emptyList(),
        )

        assertEquals("Overlaps with another timeslot for one or more selected fields.", errors[0])
        assertEquals("Overlaps with another timeslot for one or more selected fields.", errors[1])
    }

    @Test
    fun repeating_and_non_repeating_slots_do_not_overlap_each_other() {
        val repeatingSlot = buildSlot(
            id = "slot-repeating",
            repeating = true,
            dayOfWeek = 1,
            daysOfWeek = listOf(1),
            startTimeMinutes = 600,
            endTimeMinutes = 660,
            startDate = instant(1_700_000_000_000),
            endDate = instant(1_700_086_400_000),
            scheduledFieldId = "field-1",
        )
        val oneTimeSlot = buildSlot(
            id = "slot-once",
            repeating = false,
            startDate = instant(1_700_000_000_000),
            endDate = instant(1_700_001_800_000),
            scheduledFieldId = "field-1",
        )

        val errors = computeLeagueSlotErrors(
            slots = listOf(repeatingSlot, oneTimeSlot),
            singleDivision = false,
            selectedDivisionIds = emptyList(),
        )

        assertEquals(emptyMap(), errors)
    }

    @Test
    fun repeating_slot_requires_end_time() {
        val slot = buildSlot(
            id = "slot-open-ended",
            repeating = true,
            dayOfWeek = 2,
            daysOfWeek = listOf(2),
            startTimeMinutes = 540,
            endTimeMinutes = null,
            scheduledFieldId = "field-1",
        )

        val errors = computeLeagueSlotErrors(
            slots = listOf(slot),
            singleDivision = false,
            selectedDivisionIds = emptyList(),
        )

        assertEquals("Select an end time.", errors[0])
    }

    @Test
    fun non_split_slots_must_include_all_selected_divisions() {
        val slot = buildSlot(
            id = "slot-1",
            repeating = true,
            divisions = listOf("division-a"),
        )

        val errors = computeLeagueSlotErrors(
            slots = listOf(slot),
            singleDivision = false,
            selectedDivisionIds = listOf("division-a", "division-b"),
            splitByDivision = false,
        )

        assertEquals("Every timeslot must include all selected divisions when split divisions is off.", errors[0])
    }

    @Test
    fun split_slots_require_each_timeslot_to_have_at_least_one_division() {
        val slot = buildSlot(
            id = "slot-1",
            repeating = true,
            divisions = emptyList(),
        )

        val errors = computeLeagueSlotErrors(
            slots = listOf(slot),
            singleDivision = false,
            selectedDivisionIds = listOf("division-a"),
            splitByDivision = true,
        )

        assertEquals("Each timeslot needs at least one division.", errors[0])
    }

    @Test
    fun split_slots_require_every_division_on_at_least_one_timeslot() {
        val first = buildSlot(
            id = "slot-1",
            repeating = true,
            divisions = listOf("division-a"),
        )
        val second = buildSlot(
            id = "slot-2",
            repeating = true,
            dayOfWeek = 2,
            daysOfWeek = listOf(2),
            divisions = listOf("division-a"),
        )

        val errors = computeLeagueSlotErrors(
            slots = listOf(first, second),
            singleDivision = false,
            selectedDivisionIds = listOf("division-a", "division-b"),
            splitByDivision = true,
        )

        assertEquals("Each division must be assigned to at least one timeslot.", errors[0])
    }

    @Test
    fun multi_division_slot_payload_preserves_selected_slot_divisions() {
        val divisions = resolveEffectiveLeagueSlotDivisionIds(
            singleDivision = false,
            selectedDivisionIds = listOf("division_a", "division_b"),
            slotDivisionIds = listOf("division_b"),
        )

        assertEquals(listOf("division_b"), divisions)
    }

    @Test
    fun single_division_slot_payload_uses_all_event_divisions() {
        val divisions = resolveEffectiveLeagueSlotDivisionIds(
            singleDivision = true,
            selectedDivisionIds = listOf("division_a", "division_b"),
            slotDivisionIds = listOf("division_b"),
        )

        assertEquals(listOf("division_a", "division_b"), divisions)
    }

    private fun buildSlot(
        id: String,
        repeating: Boolean,
        dayOfWeek: Int? = 1,
        daysOfWeek: List<Int> = listOfNotNull(dayOfWeek),
        startTimeMinutes: Int? = 600,
        endTimeMinutes: Int? = 660,
        startDate: Instant = instant(1_700_000_000_000),
        endDate: Instant? = instant(1_700_086_400_000),
        scheduledFieldId: String? = "field-1",
        divisions: List<String> = listOf("open"),
    ): TimeSlot {
        return TimeSlot(
            id = id,
            dayOfWeek = dayOfWeek,
            daysOfWeek = daysOfWeek,
            divisions = divisions,
            startTimeMinutes = startTimeMinutes,
            endTimeMinutes = endTimeMinutes,
            startDate = startDate,
            repeating = repeating,
            endDate = endDate,
            scheduledFieldId = scheduledFieldId,
            scheduledFieldIds = listOfNotNull(scheduledFieldId),
            price = null,
        )
    }

    private fun instant(epochMillis: Long): Instant = Instant.fromEpochMilliseconds(epochMillis)
}
