package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.toLocalDateTime
import kotlin.test.assertEquals
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant

class EventDetailsScheduleLockingTest {

    @Test
    fun rental_lock_always_locks_schedule_editing() {
        val locked = isScheduleEditingLocked(
            event = Event(organizationId = "org-1"),
            timeSlots = emptyList(),
            fields = emptyList(),
            rentalTimeLocked = true,
        )

        assertTrue(locked)
    }

    @Test
    fun slot_field_from_different_organization_locks_schedule_editing() {
        val event = Event(organizationId = "org-1")
        val slot = buildSlot(fieldId = "field-1")
        val fields = listOf(
            Field(
                id = "field-1",
                fieldNumber = 1,
                organizationId = "org-2",
            ),
        )

        val locked = isScheduleEditingLocked(
            event = event,
            timeSlots = listOf(slot),
            fields = fields,
            rentalTimeLocked = false,
        )

        assertTrue(locked)
    }

    @Test
    fun matching_event_and_field_organization_keeps_schedule_editable() {
        val event = Event(organizationId = "org-1")
        val slot = buildSlot(fieldId = "field-1")
        val fields = listOf(
            Field(
                id = "field-1",
                fieldNumber = 1,
                organizationId = "org-1",
            ),
        )

        val locked = isScheduleEditingLocked(
            event = event,
            timeSlots = listOf(slot),
            fields = fields,
            rentalTimeLocked = false,
        )

        assertFalse(locked)
    }

    @Test
    fun user_owned_event_with_facility_field_locks_schedule_editing() {
        val event = Event(organizationId = null)
        val slot = buildSlot(fieldId = "field-1")
        val fields = listOf(
            Field(
                id = "field-1",
                fieldNumber = 1,
                organizationId = "org-facility",
            ),
        )

        val locked = isScheduleEditingLocked(
            event = event,
            timeSlots = listOf(slot),
            fields = fields,
            rentalTimeLocked = false,
        )

        assertTrue(locked)
    }

    @Test
    fun unmapped_slot_fields_lock_organization_events() {
        val event = Event(organizationId = "org-1")
        val slot = buildSlot(fieldId = "unknown-field")
        val fields = emptyList<Field>()

        val locked = isScheduleEditingLocked(
            event = event,
            timeSlots = listOf(slot),
            fields = fields,
            rentalTimeLocked = false,
        )

        assertTrue(locked)
    }

    @Test
    fun unmapped_slot_fields_do_not_force_lock_for_user_owned_events() {
        val event = Event(organizationId = null)
        val slot = buildSlot(fieldId = "unknown-field")
        val fields = emptyList<Field>()

        val locked = isScheduleEditingLocked(
            event = event,
            timeSlots = listOf(slot),
            fields = fields,
            rentalTimeLocked = false,
        )

        assertFalse(locked)
    }

    @Test
    fun schedule_input_validation_is_skipped_when_schedule_is_locked() {
        val shouldValidate = requiresScheduleInputValidation(
            eventType = EventType.TOURNAMENT,
            isNewEvent = true,
            scheduleTimeLocked = true,
        )

        assertFalse(shouldValidate)
    }

    @Test
    fun schedule_input_validation_is_skipped_when_slot_editor_is_hidden() {
        val shouldValidate = requiresScheduleInputValidation(
            eventType = EventType.LEAGUE,
            isNewEvent = true,
            scheduleTimeLocked = false,
            slotEditorEnabled = false,
        )

        assertFalse(shouldValidate)
    }

    @Test
    fun field_count_validation_is_skipped_when_schedule_is_locked() {
        val shouldValidate = requiresFieldCountValidation(
            eventType = EventType.LEAGUE,
            scheduleTimeLocked = true,
        )

        assertFalse(shouldValidate)
    }

    @Test
    fun fixed_end_validation_is_skipped_when_schedule_is_locked() {
        val shouldValidate = requiresFixedEndRangeValidation(
            event = Event(
                eventType = EventType.WEEKLY_EVENT,
                noFixedEndDateTime = false,
            ),
            scheduleTimeLocked = true,
        )

        assertFalse(shouldValidate)
    }

    @Test
    fun editable_repeating_slot_uses_event_start_and_open_end_when_no_fixed_scheduling_is_enabled() {
        val eventStart = instant(1_700_000_000_000)
        val eventEnd = instant(1_700_086_400_000)
        val event = Event(
            eventType = EventType.LEAGUE,
            start = eventStart,
            end = eventEnd,
            noFixedEndDateTime = true,
        )
        val slot = buildSlot(
            fieldId = "field-1",
        ).copy(
            repeating = true,
            startDate = eventStart,
            endDate = eventEnd,
        )

        val normalized = normalizeEditableLeagueTimeSlotForEvent(event, slot)

        assertEquals(Instant.DISTANT_PAST, normalized.startDate)
        assertNull(normalized.endDate)
    }

    @Test
    fun recurring_slot_payload_uses_updated_event_start_and_boolean_for_open_ended_scheduling() {
        val originalStart = instant(1_700_000_000_000)
        val updatedStart = instant(1_701_209_600_000)
        val displayedEnd = instant(1_701_296_000_000)
        val event = Event(
            eventType = EventType.LEAGUE,
            start = updatedStart,
            end = displayedEnd,
            noFixedEndDateTime = true,
        )
        val slot = buildSlot(
            fieldId = "field-1",
        ).copy(
            repeating = true,
            startDate = originalStart,
            endDate = displayedEnd,
        )

        val bounds = resolveRecurringSlotDateBoundsForEventDraft(
            slot = slot,
            event = event,
            originalEventStart = originalStart,
        )

        assertEquals(updatedStart, bounds.startDate)
        assertNull(bounds.endDate)
    }

    @Test
    fun recurring_slot_payload_uses_event_end_date_when_fixed_end_scheduling_is_enabled() {
        val eventStart = instant(1_700_000_000_000)
        val eventEnd = instant(1_700_086_400_000)
        val event = Event(
            eventType = EventType.TOURNAMENT,
            start = eventStart,
            end = eventEnd,
            noFixedEndDateTime = false,
        )
        val slot = buildSlot(
            fieldId = "field-1",
        ).copy(
            repeating = true,
            startDate = Instant.DISTANT_PAST,
            endDate = null,
        )
        val timezone = TimeZone.currentSystemDefault()
        val expectedEndDate = eventEnd.toLocalDateTime(timezone).date.atStartOfDayIn(timezone)

        val bounds = resolveRecurringSlotDateBoundsForEventDraft(
            slot = slot,
            event = event,
            originalEventStart = eventStart,
        )

        assertEquals(eventStart, bounds.startDate)
        assertEquals(expectedEndDate, bounds.endDate)
    }

    private fun buildSlot(fieldId: String): TimeSlot {
        return TimeSlot(
            id = "slot-1",
            dayOfWeek = 1,
            daysOfWeek = listOf(1),
            divisions = listOf("open"),
            startTimeMinutes = 600,
            endTimeMinutes = 660,
            startDate = instant(1_700_000_000_000),
            repeating = false,
            endDate = instant(1_700_003_600_000),
            scheduledFieldId = fieldId,
            scheduledFieldIds = listOf(fieldId),
            price = null,
        )
    }

    private fun instant(epochMillis: Long): Instant = Instant.fromEpochMilliseconds(epochMillis)
}
