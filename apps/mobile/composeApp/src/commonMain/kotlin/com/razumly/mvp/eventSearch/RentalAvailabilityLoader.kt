@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.util.toTimeZoneOrUtc
import com.razumly.mvp.eventDetail.data.IMatchRepository
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Duration.Companion.days
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant

class RentalAvailabilityLoader(
    private val eventRepository: IEventRepository,
    private val matchRepository: IMatchRepository,
    private val fieldRepository: IFieldRepository,
) {
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
            .map { slotId -> slotId.trim() }
            .filter(String::isNotBlank)
            .distinct()
        val linkedSlotById = if (slotIds.isEmpty()) {
            emptyMap()
        } else {
            fieldRepository.getTimeSlots(slotIds).getOrThrow()
                .associateBy { slot -> slot.id }
        }

        val fieldsNeedingFallback = fields
            .filter { field ->
                val linkedSlots = field.rentalSlotIds.mapNotNull { slotId ->
                    linkedSlotById[slotId.trim()]
                }
                linkedSlots.isEmpty()
            }
            .map { field -> field.id }
        val fallbackSlotsByFieldId = if (fieldsNeedingFallback.isEmpty()) {
            emptyMap()
        } else {
            fieldRepository.getTimeSlotsForFields(fieldsNeedingFallback).getOrThrow()
                .groupByScheduledFieldId()
        }

        fields.map { field ->
            val linkedSlots = field.rentalSlotIds.mapNotNull { slotId ->
                linkedSlotById[slotId.trim()]
            }
            val fallbackSlots = if (linkedSlots.isEmpty()) {
                fallbackSlotsByFieldId[field.id].orEmpty()
            } else {
                emptyList()
            }
            RentalFieldOption(
                field = field,
                rentalSlots = (linkedSlots + fallbackSlots)
                    .distinctBy { slot -> slot.id }
                    .sortedBy { slot -> slot.startTimeMinutes ?: Int.MAX_VALUE },
            )
        }
    }

    suspend fun loadBusyBlocks(
        organizationId: String,
        fieldIds: List<String>,
    ): Result<List<RentalBusyBlock>> = runCatching {
        val normalizedOrganizationId = organizationId.trim()
        val normalizedFieldIds = normalizeIds(fieldIds)
        if (normalizedOrganizationId.isEmpty() || normalizedFieldIds.isEmpty()) {
            return@runCatching emptyList()
        }

        val selectedFieldSet = normalizedFieldIds.toSet()
        val events = eventRepository.getEventsByOrganization(normalizedOrganizationId, limit = 300).getOrThrow()

        val matchBackedEventIds = mutableSetOf<String>()
        val slotBackedEvents = mutableListOf<Event>()
        val directBlocks = mutableListOf<RentalBusyBlock>()

        events.forEach { event ->
            val eventFieldIds = normalizeIds(event.fieldIds)
            when (event.eventType) {
                EventType.EVENT, EventType.WEEKLY_EVENT -> {
                    eventFieldIds.intersect(selectedFieldSet).forEach { fieldId ->
                        directBlocks.add(
                            RentalBusyBlock(
                                eventId = event.id,
                                eventName = RENTAL_UNAVAILABLE_LABEL,
                                fieldId = fieldId,
                                start = event.start,
                                end = event.end,
                            )
                        )
                    }
                }

                EventType.TRYOUT -> {
                    if (eventFieldIds.isNotEmpty() && eventFieldIds.intersect(selectedFieldSet).isEmpty()) {
                        return@forEach
                    }
                    if (event.timeSlotIds.any { slotId -> slotId.isNotBlank() }) {
                        slotBackedEvents.add(event)
                    } else {
                        eventFieldIds.intersect(selectedFieldSet).forEach { fieldId ->
                            directBlocks.add(
                                RentalBusyBlock(
                                    eventId = event.id,
                                    eventName = RENTAL_UNAVAILABLE_LABEL,
                                    fieldId = fieldId,
                                    start = event.start,
                                    end = event.end,
                                )
                            )
                        }
                    }
                }

                EventType.LEAGUE, EventType.TOURNAMENT -> {
                    if (eventFieldIds.isNotEmpty() && eventFieldIds.intersect(selectedFieldSet).isEmpty()) {
                        return@forEach
                    }
                    matchBackedEventIds.add(event.id)
                    if (event.timeSlotIds.any { slotId -> slotId.isNotBlank() }) {
                        slotBackedEvents.add(event)
                    }
                }
            }
        }

        val matchBlocks = if (matchBackedEventIds.isEmpty()) {
            emptyList()
        } else {
            matchRepository.getMatchesByEventIds(
                eventIds = matchBackedEventIds.toList(),
                fieldIds = normalizedFieldIds,
            ).getOrThrow()
                .mapNotNull { match ->
                    val fieldId = match.fieldId?.trim()
                    val matchStart = match.start ?: return@mapNotNull null
                    val matchEnd = match.end
                    if (fieldId.isNullOrBlank()) return@mapNotNull null
                    if (!selectedFieldSet.contains(fieldId)) return@mapNotNull null
                    if (matchEnd == null || matchEnd <= matchStart) return@mapNotNull null

                    RentalBusyBlock(
                        eventId = match.eventId,
                        eventName = RENTAL_UNAVAILABLE_LABEL,
                        fieldId = fieldId,
                        start = matchStart,
                        end = matchEnd,
                    )
                }
        }

        val slotBlocks = buildSlotBackedBusyBlocks(
            events = slotBackedEvents,
            selectedFieldIds = selectedFieldSet,
        )

        (directBlocks + slotBlocks + matchBlocks)
            .filter { block -> block.end > block.start }
            .distinctBy { block ->
                "${block.eventId}:${block.fieldId}:${block.start.toEpochMilliseconds()}:${block.end.toEpochMilliseconds()}"
            }
    }

    private fun normalizeIds(ids: List<String>): List<String> = ids
        .map { id -> id.trim() }
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

    private suspend fun buildSlotBackedBusyBlocks(
        events: List<Event>,
        selectedFieldIds: Set<String>,
    ): List<RentalBusyBlock> {
        if (events.isEmpty()) {
            return emptyList()
        }
        val slotIds = events
            .flatMap { event -> event.timeSlotIds }
            .map { slotId -> slotId.trim() }
            .filter(String::isNotBlank)
            .distinct()
        if (slotIds.isEmpty()) {
            return emptyList()
        }

        val slotsById = fieldRepository.getTimeSlots(slotIds).getOrThrow()
            .associateBy { slot -> slot.id }

        return events.flatMap { event ->
            val eventSlots = event.timeSlotIds.mapNotNull { slotId ->
                slotsById[slotId.trim()]
            }
            eventSlots.flatMap { slot ->
                slot.toRentalBusyBlocks(
                    event = event,
                    selectedFieldIds = selectedFieldIds,
                )
            }
        }
    }

    private fun TimeSlot.toRentalBusyBlocks(
        event: Event,
        selectedFieldIds: Set<String>,
    ): List<RentalBusyBlock> {
        val fieldIds = normalizedScheduledFieldIds()
            .filter { fieldId -> selectedFieldIds.contains(fieldId) }
        if (fieldIds.isEmpty()) {
            return emptyList()
        }

        return if (repeating) {
            toRepeatingRentalBusyBlocks(event, fieldIds)
        } else {
            toSingleRentalBusyBlocks(event, fieldIds)
        }
    }

    private fun TimeSlot.toSingleRentalBusyBlocks(
        event: Event,
        fieldIds: List<String>,
    ): List<RentalBusyBlock> {
        val start = startDate
        val end = endDate ?: inferEndFromMinutes(start) ?: return emptyList()
        if (end <= start) {
            return emptyList()
        }
        return fieldIds.map { fieldId ->
            RentalBusyBlock(
                eventId = event.id,
                eventName = RENTAL_UNAVAILABLE_LABEL,
                fieldId = fieldId,
                start = start,
                end = end,
            )
        }
    }

    private fun TimeSlot.toRepeatingRentalBusyBlocks(
        event: Event,
        fieldIds: List<String>,
    ): List<RentalBusyBlock> {
        val fallbackTimeZone = event.timeZone.toTimeZoneOrUtc(TimeZone.UTC)
        val slotTimeZone = timeZone.toTimeZoneOrUtc(fallbackTimeZone)
        val startMinutes = startTimeMinutes ?: startDate.toLocalDateTime(slotTimeZone).let { local ->
            local.hour * 60 + local.minute
        }
        val endMinutes = endTimeMinutes ?: endDate?.toLocalDateTime(slotTimeZone)?.let { local ->
            local.hour * 60 + local.minute
        } ?: return emptyList()
        if (endMinutes <= startMinutes) {
            return emptyList()
        }

        val days = normalizedScheduleDays(slotTimeZone)
        if (days.isEmpty()) {
            return emptyList()
        }

        val windowStart = maxInstant(startDate, event.start)
        val eventWindowEnd = if (event.noFixedEndDateTime || event.end <= event.start) {
            event.start + (SLOT_BLOCK_LOOKAHEAD_WEEKS * DAYS_PER_WEEK).days
        } else {
            event.end
        }
        val windowEnd = minInstant(endDate ?: eventWindowEnd, eventWindowEnd)
        if (windowEnd <= windowStart) {
            return emptyList()
        }

        val blocks = mutableListOf<RentalBusyBlock>()
        var cursor = windowStart.toLocalDateTime(slotTimeZone).date
        val finalDate = windowEnd.toLocalDateTime(slotTimeZone).date

        while (cursor.toEpochDays() <= finalDate.toEpochDays()) {
            if (days.contains(cursor.dayOfWeek.toRentalDayIndex())) {
                val occurrenceStart = cursor.toInstantAtMinutes(startMinutes, slotTimeZone)
                val occurrenceEnd = cursor.toInstantAtMinutes(endMinutes, slotTimeZone)
                if (occurrenceEnd > occurrenceStart && occurrenceStart < windowEnd && occurrenceEnd > windowStart) {
                    val clippedStart = maxInstant(occurrenceStart, windowStart)
                    val clippedEnd = minInstant(occurrenceEnd, windowEnd)
                    fieldIds.forEach { fieldId ->
                        blocks.add(
                            RentalBusyBlock(
                                eventId = event.id,
                                eventName = RENTAL_UNAVAILABLE_LABEL,
                                fieldId = fieldId,
                                start = clippedStart,
                                end = clippedEnd,
                            )
                        )
                    }
                }
            }
            cursor = LocalDate.fromEpochDays(cursor.toEpochDays() + 1)
        }

        return blocks
    }

    private fun TimeSlot.inferEndFromMinutes(start: Instant): Instant? {
        val startMinutes = startTimeMinutes ?: return null
        val endMinutes = endTimeMinutes ?: return null
        if (endMinutes <= startMinutes) {
            return null
        }
        return start + (endMinutes - startMinutes).minutes
    }

    private fun TimeSlot.normalizedScheduleDays(timeZone: TimeZone): List<Int> {
        if (!daysOfWeek.isNullOrEmpty()) {
            return normalizedDaysOfWeek()
        }
        return toMondayBasedDayIndex(timeZone)?.let(::listOf)
            ?: normalizedDaysOfWeek()
    }

    private fun maxInstant(first: Instant, second: Instant): Instant =
        if (first >= second) first else second

    private fun minInstant(first: Instant, second: Instant): Instant =
        if (first <= second) first else second

    private companion object {
        const val SLOT_BLOCK_LOOKAHEAD_WEEKS = 52
        const val DAYS_PER_WEEK = 7
    }
}
