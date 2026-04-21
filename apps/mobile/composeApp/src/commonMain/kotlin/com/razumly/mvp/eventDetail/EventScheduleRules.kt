package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
internal fun isScheduleEditingLocked(
    event: Event,
    timeSlots: List<TimeSlot>,
    fields: List<Field>,
    rentalTimeLocked: Boolean,
): Boolean {
    if (rentalTimeLocked) {
        return true
    }
    if (timeSlots.isEmpty()) {
        return false
    }
    val eventOrganizationId = event.organizationId?.trim().orEmpty()
    val fieldOrganizationById = fields
        .asSequence()
        .mapNotNull { field ->
            val fieldId = field.id.trim().takeIf(String::isNotEmpty) ?: return@mapNotNull null
            fieldId to field.organizationId?.trim().orEmpty()
        }
        .toMap()
    val slotFieldIds = timeSlots
        .asSequence()
        .flatMap { slot -> slot.normalizedScheduledFieldIds().asSequence() }
        .distinct()
        .toList()
    if (eventOrganizationId.isNotEmpty()) {
        val hasUnknownFieldOwnership = slotFieldIds.any { fieldId ->
            fieldOrganizationById[fieldId].isNullOrBlank()
        }
        if (hasUnknownFieldOwnership) {
            return true
        }
    }
    return slotFieldIds
        .asSequence()
        .any { fieldId ->
            val fieldOrganizationId = fieldOrganizationById[fieldId].orEmpty()
            fieldOrganizationId.isNotEmpty() && fieldOrganizationId != eventOrganizationId
        }
}

internal fun requiresScheduleInputValidation(
    eventType: EventType,
    isNewEvent: Boolean,
    scheduleTimeLocked: Boolean,
    slotEditorEnabled: Boolean = true,
): Boolean {
    return !scheduleTimeLocked &&
        isNewEvent &&
        (
            eventType == EventType.WEEKLY_EVENT ||
                (
                    slotEditorEnabled &&
                        (
                            eventType == EventType.LEAGUE ||
                                eventType == EventType.TOURNAMENT
                            )
                    )
            )
}

internal fun requiresFieldCountValidation(
    eventType: EventType,
    scheduleTimeLocked: Boolean,
): Boolean {
    return !scheduleTimeLocked &&
        (
            eventType == EventType.LEAGUE ||
                eventType == EventType.TOURNAMENT ||
                eventType == EventType.WEEKLY_EVENT
            )
}

internal fun requiresFixedEndRangeValidation(
    event: Event,
    scheduleTimeLocked: Boolean,
): Boolean {
    return !scheduleTimeLocked &&
        !event.noFixedEndDateTime &&
        (
            event.eventType == EventType.LEAGUE ||
                event.eventType == EventType.TOURNAMENT ||
                event.eventType == EventType.WEEKLY_EVENT
            )
}

internal fun computeLeagueSlotErrors(
    slots: List<TimeSlot>,
    singleDivision: Boolean,
    selectedDivisionIds: List<String>,
): Map<Int, String> {
    if (slots.isEmpty()) return emptyMap()

    val errors = mutableMapOf<Int, String>()
    val normalizedSelectedDivisions = selectedDivisionIds.normalizeDivisionIdentifiers()
    val selectedDivisionSet = normalizedSelectedDivisions.toSet()
    slots.forEachIndexed { index, slot ->
        val fieldIds = slot.normalizedScheduledFieldIds()
        val fieldIdSet = fieldIds.toSet()
        val days = slot.normalizedDaysOfWeek()
        val daySet = days.toSet()
        val slotDivisionIds = slot.normalizedDivisionIds().normalizeDivisionIdentifiers()
        val slotDivisionSet = slotDivisionIds.toSet()
        val start = slot.startTimeMinutes
        val end = slot.endTimeMinutes

        if (!slot.repeating) {
            val slotStart = slot.startDate
            val slotEnd = slot.endDate
            val requiredMissing = when {
                fieldIds.isEmpty() -> "Select at least one field."
                slotEnd == null -> "Select start and end date/time."
                slotEnd <= slotStart -> "Timeslot must end after it starts."
                else -> null
            }
            if (requiredMissing != null) {
                errors[index] = requiredMissing
                return@forEachIndexed
            }

            if (singleDivision && selectedDivisionSet.isNotEmpty() && slotDivisionSet != selectedDivisionSet) {
                errors[index] = "Single division requires every timeslot to include all selected divisions."
                return@forEachIndexed
            }
            val nonRepeatingEnd = slotEnd ?: return@forEachIndexed

            val hasOverlap = slots.withIndex().any { (otherIndex, other) ->
                if (otherIndex == index || other.repeating) return@any false
                val otherFieldSet = other.normalizedScheduledFieldIds().toSet()
                if (otherFieldSet.isEmpty() || otherFieldSet.intersect(fieldIdSet).isEmpty()) return@any false

                val otherStart = other.startDate
                val otherEnd = other.endDate ?: return@any false
                if (otherEnd <= otherStart) return@any false
                slotStart < otherEnd && otherStart < nonRepeatingEnd
            }

            if (hasOverlap) {
                errors[index] = "Overlaps with another timeslot for one or more selected fields."
            }
            return@forEachIndexed
        }

        val requiredMissing = when {
            fieldIds.isEmpty() -> "Select at least one field."
            days.isEmpty() -> "Select at least one day."
            start == null -> "Select a start time."
            end == null -> "Select an end time."
            end <= start -> "Timeslot must end after it starts."
            else -> null
        }
        if (requiredMissing != null) {
            errors[index] = requiredMissing
            return@forEachIndexed
        }

        if (singleDivision && selectedDivisionSet.isNotEmpty() && slotDivisionSet != selectedDivisionSet) {
            errors[index] = "Single division requires every timeslot to include all selected divisions."
            return@forEachIndexed
        }

        val hasOverlap = slots.withIndex().any { (otherIndex, other) ->
            if (otherIndex == index) return@any false
            if (!other.repeating) return@any false
            val otherFieldSet = other.normalizedScheduledFieldIds().toSet()
            if (otherFieldSet.isEmpty() || otherFieldSet.intersect(fieldIdSet).isEmpty()) return@any false
            val otherDays = other.normalizedDaysOfWeek()
            if (otherDays.isEmpty() || otherDays.none(daySet::contains)) return@any false

            val otherStart = other.startTimeMinutes
            val otherEnd = other.endTimeMinutes
            if (otherStart == null || otherEnd == null || otherEnd <= otherStart) return@any false
            val currentEnd = end ?: return@any false
            slotsOverlap(start!!, currentEnd, otherStart, otherEnd)
        }

        if (hasOverlap) {
            errors[index] = "Overlaps with another timeslot for one or more selected fields."
        }
    }
    return errors
}

private fun slotsOverlap(startA: Int, endA: Int, startB: Int, endB: Int): Boolean {
    return maxOf(startA, startB) < minOf(endA, endB)
}
