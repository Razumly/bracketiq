package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.RepeatingTimeSlotValidationException
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.isRentalBacked
import com.razumly.mvp.core.data.dataTypes.enumerateRepeatingTimeSlotOccurrences
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.dataTypes.resolveOneTimeInterval
import com.razumly.mvp.core.data.dataTypes.validateRepeatingTimeSlotOccurrences
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Duration.Companion.days
import kotlin.time.Instant

internal data class GeneratedEndDateCopy(
    val label: String,
    val description: String,
)

internal fun generatedEndDateCopy(eventType: EventType): GeneratedEndDateCopy =
    if (eventType == EventType.WEEKLY_EVENT) {
        GeneratedEndDateCopy(
            label = "No Planned End",
            description = "Continue generating weekly occurrences without a planned end date.",
        )
    } else {
        GeneratedEndDateCopy(
            label = "Set End From Schedule",
            description = "Use an open scheduling window. The generated match schedule sets the event end date.",
        )
    }

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
    val lockCandidateSlots = timeSlots.filterNot { slot -> slot.isRentalBacked() }
    if (lockCandidateSlots.isEmpty()) {
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
    val slotFieldIds = lockCandidateSlots
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
    isAutomatedScheduling: Boolean,
): Boolean {
    return !scheduleTimeLocked &&
        isNewEvent &&
        (
            eventType == EventType.WEEKLY_EVENT ||
                (
                    slotEditorEnabled &&
                        isAutomatedScheduling &&
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
    isAutomatedScheduling: Boolean = true,
): Boolean {
    return !scheduleTimeLocked &&
        (
            eventType == EventType.WEEKLY_EVENT ||
                (
                    isAutomatedScheduling &&
                        (
                            eventType == EventType.LEAGUE ||
                                eventType == EventType.TOURNAMENT
                            )
                    )
            )
}

internal fun requiresFixedEndRangeValidation(
    event: Event,
    scheduleTimeLocked: Boolean,
): Boolean {
    val usesGeneratedEnd = event.isAutomatedScheduling && event.noFixedEndDateTime
    return !scheduleTimeLocked &&
        !usesGeneratedEnd &&
        (
            event.eventType == EventType.LEAGUE ||
                event.eventType == EventType.TOURNAMENT ||
                event.eventType == EventType.WEEKLY_EVENT ||
                event.eventType == EventType.TRYOUT
            )
}

private const val REPEATING_CONFLICT_HORIZON_DAYS = 370

private data class ConflictWindow(
    val start: Instant,
    val end: Instant?,
)

private data class ConflictInterval(
    val start: Instant,
    val end: Instant,
)

private fun TimeSlot.resolveConflictWindow(): ConflictWindow? {
    if (!repeating) {
        return runCatching {
            resolveOneTimeInterval().let { resolved ->
                ConflictWindow(resolved.start, resolved.end)
            }
        }.getOrNull()
    }

    val zone = runCatching {
        TimeZone.of(timeZone.trim().takeIf(String::isNotBlank) ?: "UTC")
    }.getOrNull() ?: return null
    val startLocalDate = startDate.toLocalDateTime(zone).date
    val configuredEndDate = endDate?.toLocalDateTime(zone)?.date
    if (configuredEndDate != null && configuredEndDate < startLocalDate) {
        throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" is invalid: the end date is before the start date.",
        )
    }
    val windowStart = startLocalDate.atStartOfDayIn(zone)
    val windowEnd = configuredEndDate
        ?.plus(DatePeriod(days = 1))
        ?.atStartOfDayIn(zone)
    return ConflictWindow(windowStart, windowEnd)
}

private fun timeSlotsOverlap(first: TimeSlot, second: TimeSlot): Boolean {
    val firstWindow = first.resolveConflictWindow() ?: return false
    val secondWindow = second.resolveConflictWindow() ?: return false
    val overlapStart = if (firstWindow.start > secondWindow.start) firstWindow.start else secondWindow.start
    val overlapEnd = listOfNotNull(firstWindow.end, secondWindow.end)
        .minOrNull()
        ?: (overlapStart + REPEATING_CONFLICT_HORIZON_DAYS.days)
    if (overlapEnd <= overlapStart) {
        return false
    }

    val firstIntervals = if (first.repeating) {
        first.enumerateRepeatingTimeSlotOccurrences(overlapStart, overlapEnd)
            .map { occurrence -> ConflictInterval(occurrence.start, occurrence.end) }
    } else {
        listOf(
            ConflictInterval(
                start = firstWindow.start,
                end = requireNotNull(firstWindow.end),
            ),
        )
    }
    val secondIntervals = if (second.repeating) {
        second.enumerateRepeatingTimeSlotOccurrences(overlapStart, overlapEnd)
            .map { occurrence -> ConflictInterval(occurrence.start, occurrence.end) }
    } else {
        listOf(
            ConflictInterval(
                start = secondWindow.start,
                end = requireNotNull(secondWindow.end),
            ),
        )
    }
    return firstIntervals.any { firstInterval ->
        secondIntervals.any { secondInterval ->
            firstInterval.start < secondInterval.end && secondInterval.start < firstInterval.end
        }
    }
}

internal fun computeLeagueSlotErrors(
    slots: List<TimeSlot>,
    singleDivision: Boolean,
    selectedDivisionIds: List<String>,
    splitByDivision: Boolean = false,
): Map<Int, String> {
    if (slots.isEmpty()) return emptyMap()

    val errors = mutableMapOf<Int, String>()
    val normalizedSelectedDivisions = selectedDivisionIds.normalizeDivisionIdentifiers()
    val selectedDivisionSet = normalizedSelectedDivisions.toSet()
    val assignedDivisionIds = mutableSetOf<String>()
    slots.forEachIndexed { index, slot ->
        val fieldIds = slot.normalizedScheduledFieldIds()
        val fieldIdSet = fieldIds.toSet()

        val days = slot.normalizedDaysOfWeek()
        val slotDivisionIds = slot.normalizedDivisionIds().normalizeDivisionIdentifiers()
        val slotDivisionSet = slotDivisionIds.toSet()
        val start = slot.startTimeMinutes
        val end = slot.endTimeMinutes

        if (!slot.repeating) {
            val slotStart = slot.startDate
            val slotEnd = slot.endDate
            val requiredMissing = when {
                fieldIds.isEmpty() -> "Select at least one resource."
                slotEnd == null -> "Select start and end date/time."
                slotEnd <= slotStart -> "Timeslot must end after it starts."
                else -> null
            }
            if (requiredMissing != null) {
                errors[index] = requiredMissing
                return@forEachIndexed
            }

            if (selectedDivisionSet.isNotEmpty()) {
                if (splitByDivision) {
                    val validSlotDivisions = slotDivisionIds.filter(selectedDivisionSet::contains)
                    if (validSlotDivisions.isEmpty()) {
                        errors[index] = "Each timeslot needs at least one division."
                        return@forEachIndexed
                    }
                    assignedDivisionIds += validSlotDivisions
                } else if (slotDivisionSet != selectedDivisionSet) {
                    errors[index] = if (singleDivision) {
                        "Single division requires every timeslot to include all selected divisions."
                    } else {
                        "Every timeslot must include all selected divisions when split divisions is off."
                    }
                    return@forEachIndexed
                }
            }
            val hasOverlap = try {
                slots.withIndex().any { (otherIndex, other) ->
                    if (otherIndex == index) return@any false
                    val otherFieldSet = other.normalizedScheduledFieldIds().toSet()
                    if (otherFieldSet.isEmpty() || otherFieldSet.intersect(fieldIdSet).isEmpty()) return@any false
                    timeSlotsOverlap(slot, other)
                }
            } catch (error: RepeatingTimeSlotValidationException) {
                errors[index] = error.message ?: "Repeating timeslot cannot be resolved."
                return@forEachIndexed
            }

            if (hasOverlap) {
                errors[index] = "Overlaps with another timeslot for one or more selected resources."
            }
            return@forEachIndexed
        }

        val requiredMissing = when {
            fieldIds.isEmpty() -> "Select at least one resource."
            days.isEmpty() -> "Select at least one day."
            start == null -> "Select a start time."
            end == null -> "Select an end time."
            start !in 0 until (24 * 60) -> "Select a valid start time."
            end !in 0..(24 * 60) -> "Select a valid end time."
            else -> null
        }
        if (requiredMissing != null) {
            errors[index] = requiredMissing
            return@forEachIndexed
        }

        try {
            slot.validateRepeatingTimeSlotOccurrences()
        } catch (error: RepeatingTimeSlotValidationException) {
            errors[index] = error.message ?: "Repeating timeslot cannot be resolved."
            return@forEachIndexed
        }

        if (selectedDivisionSet.isNotEmpty()) {
            if (splitByDivision) {
                val validSlotDivisions = slotDivisionIds.filter(selectedDivisionSet::contains)
                if (validSlotDivisions.isEmpty()) {
                    errors[index] = "Each timeslot needs at least one division."
                    return@forEachIndexed
                }
                assignedDivisionIds += validSlotDivisions
            } else if (slotDivisionSet != selectedDivisionSet) {
                errors[index] = if (singleDivision) {
                    "Single division requires every timeslot to include all selected divisions."
                } else {
                    "Every timeslot must include all selected divisions when split divisions is off."
                }
                return@forEachIndexed
            }
        }

        val hasOverlap = try {
            slots.withIndex().any { (otherIndex, other) ->
                if (otherIndex == index) return@any false
                val otherFieldSet = other.normalizedScheduledFieldIds().toSet()
                if (otherFieldSet.isEmpty() || otherFieldSet.intersect(fieldIdSet).isEmpty()) return@any false
                timeSlotsOverlap(slot, other)
            }
        } catch (error: RepeatingTimeSlotValidationException) {
            errors[index] = error.message ?: "Repeating timeslot cannot be resolved."
            return@forEachIndexed
        }

        if (hasOverlap) {
            errors[index] = "Overlaps with another timeslot for one or more selected resources."
        }
    }
    if (splitByDivision && selectedDivisionSet.isNotEmpty()) {
        val missingDivisionIds = selectedDivisionSet - assignedDivisionIds
        if (missingDivisionIds.isNotEmpty()) {
            val targetIndex = slots.indices.firstOrNull { index -> !errors.containsKey(index) }
            if (targetIndex != null) {
                errors[targetIndex] = "Each division must be assigned to at least one timeslot."
            }
        }
    }
    return errors
}

internal fun resolveEffectiveLeagueSlotDivisionIds(
    singleDivision: Boolean,
    selectedDivisionIds: List<String>,
    slotDivisionIds: List<String>,
): List<String> {
    val normalizedSelectedDivisions = selectedDivisionIds.normalizeDivisionIdentifiers()
    if (singleDivision) {
        return normalizedSelectedDivisions
    }
    val selectedDivisionSet = normalizedSelectedDivisions.toSet()
    return slotDivisionIds
        .normalizeDivisionIdentifiers()
        .filter(selectedDivisionSet::contains)
        .ifEmpty { normalizedSelectedDivisions }
}
