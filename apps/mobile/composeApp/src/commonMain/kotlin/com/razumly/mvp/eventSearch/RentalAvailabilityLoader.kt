package com.razumly.mvp.eventSearch

import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.eventDetail.data.IMatchRepository

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
            .sortedBy { field -> field.name?.lowercase() ?: "" }
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
        val matchBackedEventNames = mutableMapOf<String, String>()
        val directBlocks = mutableListOf<RentalBusyBlock>()

        events.forEach { event ->
            val eventFieldIds = normalizeIds(event.fieldIds)
            when (event.eventType) {
                EventType.EVENT, EventType.WEEKLY_EVENT -> {
                    eventFieldIds.intersect(selectedFieldSet).forEach { fieldId ->
                        directBlocks.add(
                            RentalBusyBlock(
                                eventId = event.id,
                                eventName = event.name.ifBlank { "Reserved event" },
                                fieldId = fieldId,
                                start = event.start,
                                end = event.end,
                            )
                        )
                    }
                }

                EventType.LEAGUE, EventType.TOURNAMENT -> {
                    if (eventFieldIds.isNotEmpty() && eventFieldIds.intersect(selectedFieldSet).isEmpty()) {
                        return@forEach
                    }
                    matchBackedEventIds.add(event.id)
                    matchBackedEventNames[event.id] = event.name.ifBlank { "Reserved match" }
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
                        eventName = matchBackedEventNames[match.eventId] ?: "Reserved match",
                        fieldId = fieldId,
                        start = matchStart,
                        end = matchEnd,
                    )
                }
        }

        (directBlocks + matchBlocks)
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
}
