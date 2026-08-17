@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import com.razumly.mvp.core.data.dataTypes.RentalAvailabilityField
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.repositories.IFieldRepository
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlin.time.Duration.Companion.days
import kotlin.time.Instant

private const val RENTAL_AVAILABILITY_FETCH_PADDING_DAYS = 2

data class RentalAvailabilityWindow(
    val start: Instant,
    val end: Instant,
)

data class RentalAvailabilityViewSnapshot(
    val rangeStart: Instant,
    val rangeEnd: Instant,
    val fieldOptions: List<RentalFieldOption>,
    val busyBlocks: List<RentalBusyBlock>,
)

class RentalAvailabilityLoader(
    private val fieldRepository: IFieldRepository,
) {
    suspend fun loadAvailability(
        organizationId: String,
        rangeStart: Instant,
        rangeEnd: Instant,
    ): Result<RentalAvailabilityViewSnapshot> = fieldRepository.getRentalAvailability(
        organizationId = organizationId,
        rangeStart = rangeStart,
        rangeEnd = rangeEnd,
    ).mapCatching { snapshot ->
        RentalAvailabilityViewSnapshot(
            rangeStart = snapshot.rangeStart,
            rangeEnd = snapshot.rangeEnd,
            fieldOptions = snapshot.fields.map { field -> field.toFieldOption() },
            busyBlocks = snapshot.busyBlocks.map { block ->
                RentalBusyBlock(
                    eventId = "",
                    eventName = RENTAL_UNAVAILABLE_LABEL,
                    fieldId = block.fieldId,
                    start = block.start,
                    end = block.end,
                )
            },
        )
    }

    suspend fun loadFieldOptions(fieldIds: List<String>): Result<List<RentalFieldOption>> = runCatching {
        val normalizedFieldIds = normalizeIds(fieldIds)
        if (normalizedFieldIds.isEmpty()) {
            return@runCatching emptyList()
        }

        val fields = fieldRepository.getFields(normalizedFieldIds).getOrThrow()
            .sortedBy { field -> field.displayLabel().lowercase() }
        if (fields.isEmpty()) {
            return@runCatching emptyList()
        }

        val slotIds = fields
            .flatMap { field -> field.rentalSlotIds }
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
        val linkedSlotById = if (slotIds.isEmpty()) {
            emptyMap()
        } else {
            fieldRepository.getTimeSlots(slotIds).getOrThrow()
                .associateBy(TimeSlot::id)
        }

        val fieldsNeedingFallback = fields
            .filter { field ->
                field.rentalSlotIds.none { slotId -> linkedSlotById.containsKey(slotId.trim()) }
            }
            .map { field -> field.id }
        val fallbackSlotsByFieldId = if (fieldsNeedingFallback.isEmpty()) {
            emptyMap()
        } else {
            fieldRepository.getTimeSlotsForFields(fieldsNeedingFallback).getOrThrow()
                .groupByScheduledFieldId()
        }

        fields.map { field ->
            val linkedSlots = field.rentalSlotIds.mapNotNull { slotId -> linkedSlotById[slotId.trim()] }
            val fallbackSlots = if (linkedSlots.isEmpty()) {
                fallbackSlotsByFieldId[field.id].orEmpty()
            } else {
                emptyList()
            }
            RentalFieldOption(
                field = field,
                rentalSlots = (linkedSlots + fallbackSlots)
                    .distinctBy(TimeSlot::id)
                    .sortedBy { slot -> slot.startTimeMinutes ?: Int.MAX_VALUE },
            )
        }
    }

    private fun normalizeIds(ids: List<String>): List<String> = ids
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()

    private fun List<TimeSlot>.groupByScheduledFieldId(): Map<String, List<TimeSlot>> {
        val grouped = mutableMapOf<String, MutableList<TimeSlot>>()
        for (slot in this) {
            slot.normalizedScheduledFieldIds().forEach { fieldId ->
                grouped.getOrPut(fieldId) { mutableListOf() }.add(slot)
            }
        }
        return grouped
    }
}

internal fun rentalAvailabilityWindowForDate(
    date: LocalDate,
    timeZone: TimeZone,
): RentalAvailabilityWindow {
    val monday = LocalDate.fromEpochDays(date.toEpochDays() - date.dayOfWeek.toRentalDayIndex())
    val nextMonday = LocalDate.fromEpochDays(monday.toEpochDays() + 7)
    return RentalAvailabilityWindow(
        start = monday.toInstantAtMinutes(0, timeZone),
        end = nextMonday.toInstantAtMinutes(0, timeZone),
    )
}

/**
 * Conflict snapshots are absolute-time ranges, but each field is rendered in
 * its own local timezone. Pad the logical week so fields far east or west of
 * the first field cannot lose their local Monday/Sunday edge conflicts.
 */
internal fun rentalAvailabilityFetchWindowForDate(
    date: LocalDate,
    timeZone: TimeZone,
): RentalAvailabilityWindow {
    val logicalWeek = rentalAvailabilityWindowForDate(date, timeZone)
    return RentalAvailabilityWindow(
        start = logicalWeek.start - RENTAL_AVAILABILITY_FETCH_PADDING_DAYS.days,
        end = logicalWeek.end + RENTAL_AVAILABILITY_FETCH_PADDING_DAYS.days,
    )
}

private fun RentalAvailabilityField.toFieldOption(): RentalFieldOption = RentalFieldOption(
    field = field,
    rentalSlots = rentalSlots,
)
