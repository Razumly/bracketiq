package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.core.util.resolvedTimeZone
import com.razumly.mvp.core.util.toTimeZoneOrUtc
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Clock
import kotlin.time.Instant

internal data class PreparedEventForUpdate(
    val event: Event,
    val fields: List<Field>? = null,
    val timeSlots: List<TimeSlot>? = null,
    val leagueScoringConfig: LeagueScoringConfigDTO? = null,
)

internal data class EventEditPayloadInput(
    val editedEvent: Event,
    val editableFields: List<Field>,
    val editableLeagueTimeSlots: List<TimeSlot>,
    val selectedRentalFields: List<Field>,
    val leagueScoringConfig: LeagueScoringConfigDTO,
    val originalEventStart: Instant,
    val normalizeSlotResourceSelection: (TimeSlot, Set<String>) -> TimeSlot = { slot, _ -> slot },
    val idFactory: () -> String = ::newId,
)

internal data class EventEditPayloadResult(
    val prepared: PreparedEventForUpdate,
    val editableFields: List<Field>? = null,
)

private data class FieldDraftResult(
    val drafts: List<Field>,
    val allFields: List<Field>,
)

internal object EventEditPayloadBuilder {
    fun prepareForUpdate(input: EventEditPayloadInput): EventEditPayloadResult {
        val eventDraft = input.editedEvent
        val hasRentalBackedSlots = input.editableLeagueTimeSlots.any { slot -> slot.isRentalBacked() }
        val selectedRentalFieldIds = (
            input.selectedRentalFields.map { field -> field.id.trim() } +
                input.editableLeagueTimeSlots
                    .filter { slot -> slot.isRentalBacked() }
                    .flatMap { slot -> slot.normalizedScheduledFieldIds() }
            )
            .filter(String::isNotBlank)
            .distinct()
        val selectedRentalFieldIdSet = selectedRentalFieldIds.toSet()
        val shouldPersistFields = eventDraft.shouldPersistManagedFieldsOrSlots(hasRentalBackedSlots)
        val fieldDraftResult = if (shouldPersistFields) {
            buildFieldDrafts(
                event = eventDraft,
                editableFields = input.editableFields,
                excludedFieldIds = selectedRentalFieldIdSet,
                idFactory = input.idFactory,
            )
        } else {
            null
        }
        val preparedFields = fieldDraftResult?.drafts
        val preparedEventWithFields = if (preparedFields != null) {
            eventDraft.copy(fieldIds = selectedRentalFieldIds + preparedFields.map { field -> field.id })
        } else {
            eventDraft
        }
        val preparedLeagueScoringConfig = if (eventDraft.eventType == EventType.LEAGUE) {
            input.leagueScoringConfig
        } else {
            null
        }
        val shouldPersistTimeSlots = eventDraft.shouldPersistManagedFieldsOrSlots(hasRentalBackedSlots)
        if (!shouldPersistTimeSlots) {
            return EventEditPayloadResult(
                prepared = PreparedEventForUpdate(
                    event = preparedEventWithFields,
                    fields = preparedFields,
                    timeSlots = null,
                    leagueScoringConfig = preparedLeagueScoringConfig,
                ),
                editableFields = fieldDraftResult?.allFields,
            )
        }

        val preparedTimeSlots = buildLeagueSlotDrafts(
            event = preparedEventWithFields,
            originalEventStart = input.originalEventStart,
            editableLeagueTimeSlots = input.editableLeagueTimeSlots,
            normalizeSlotResourceSelection = input.normalizeSlotResourceSelection,
            idFactory = input.idFactory,
        )
        val preparedEvent = preparedEventWithFields.copy(timeSlotIds = preparedTimeSlots.map { slot -> slot.id })
        return EventEditPayloadResult(
            prepared = PreparedEventForUpdate(
                event = preparedEvent,
                fields = preparedFields,
                timeSlots = preparedTimeSlots,
                leagueScoringConfig = preparedLeagueScoringConfig,
            ),
            editableFields = fieldDraftResult?.allFields,
        )
    }

    fun buildLeagueSlotDrafts(
        event: Event,
        originalEventStart: Instant,
        editableLeagueTimeSlots: List<TimeSlot>,
        normalizeSlotResourceSelection: (TimeSlot, Set<String>) -> TimeSlot = { slot, _ -> slot },
        idFactory: () -> String = ::newId,
    ): List<TimeSlot> {
        val selectedDivisionIds = event.divisions
            .normalizeDivisionIdentifiers()
            .ifEmpty { listOf(DEFAULT_DIVISION) }
        val validFieldIds = event.fieldIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .toSet()

        return editableLeagueTimeSlots.mapNotNull { rawSlot ->
            val slot = normalizeSlotResourceSelection(rawSlot, validFieldIds)
            val slotTimeZone = slot.timeZone.toTimeZoneOrUtc(event.resolvedTimeZone())
            val normalizedFieldIds = slot.normalizedScheduledFieldIds()
            val mappedFieldIds = if (validFieldIds.isEmpty()) {
                normalizedFieldIds
            } else {
                normalizedFieldIds.filter(validFieldIds::contains)
            }
            if (mappedFieldIds.isEmpty()) {
                return@mapNotNull null
            }

            val effectiveDivisionIds = resolveEffectiveLeagueSlotDivisionIds(
                singleDivision = event.singleDivision,
                selectedDivisionIds = selectedDivisionIds,
                slotDivisionIds = slot.normalizedDivisionIds(),
            )

            if (!slot.repeating) {
                val slotStartDate = slot.startDate.takeUnless { it == Instant.DISTANT_PAST } ?: event.start
                val slotEndDate = slot.endDate ?: return@mapNotNull null
                if (slotEndDate <= slotStartDate) {
                    return@mapNotNull null
                }
                val slotDayOfWeek = slotStartDate.toMondayFirstDay(slotTimeZone)
                return@mapNotNull slot.copy(
                    id = slot.id.ifBlank { idFactory() },
                    dayOfWeek = slotDayOfWeek,
                    daysOfWeek = listOf(slotDayOfWeek),
                    divisions = effectiveDivisionIds,
                    scheduledFieldId = mappedFieldIds.first(),
                    scheduledFieldIds = mappedFieldIds,
                    startDate = slotStartDate,
                    endDate = slotEndDate,
                    startTimeMinutes = slotStartDate.toMinutesOfDay(slotTimeZone),
                    endTimeMinutes = slotEndDate.toMinutesOfDay(slotTimeZone),
                    repeating = false,
                )
            }

            val normalizedDays = slot.normalizedDaysOfWeek()
            val startMinutes = slot.startTimeMinutes
            val endMinutes = slot.endTimeMinutes
            if (normalizedDays.isEmpty() || startMinutes == null || endMinutes == null) {
                return@mapNotNull null
            }
            if (endMinutes <= startMinutes) {
                return@mapNotNull null
            }

            val bounds = resolveRecurringSlotDateBoundsForEventDraft(
                slot = slot,
                event = event,
                originalEventStart = originalEventStart,
            )
            slot.copy(
                id = slot.id.ifBlank { idFactory() },
                dayOfWeek = normalizedDays.first(),
                daysOfWeek = normalizedDays,
                divisions = effectiveDivisionIds,
                scheduledFieldId = mappedFieldIds.first(),
                scheduledFieldIds = mappedFieldIds,
                startDate = bounds.startDate,
                endDate = bounds.endDate,
                repeating = true,
            )
        }
    }

    private fun buildFieldDrafts(
        event: Event,
        editableFields: List<Field>,
        excludedFieldIds: Set<String> = emptySet(),
        idFactory: () -> String = ::newId,
    ): FieldDraftResult {
        val preservedFields = editableFields.filter { field ->
            excludedFieldIds.contains(field.id.trim())
        }
        val numberOffset = preservedFields.size
        val drafts = editableFields
            .filterNot { field -> excludedFieldIds.contains(field.id.trim()) }
            .mapIndexed { index, field ->
                val fieldNumber = numberOffset + index + 1
                field.copy(
                    id = if (field.id.isBlank()) idFactory() else field.id,
                    fieldNumber = fieldNumber,
                    name = field.name?.takeIf(String::isNotBlank) ?: "Field $fieldNumber",
                    divisions = field.divisions
                        .normalizeDivisionIdentifiers()
                        .ifEmpty { defaultFieldDivisions(event) },
                    location = eventFieldLocationDefault(field, event),
                    organizationId = resolveFieldOrganizationId(
                        fieldOrganizationId = field.organizationId,
                        eventOrganizationId = event.organizationId,
                    ),
                )
            }
        val allFields = (preservedFields + drafts)
            .distinctBy { field -> field.id.trim() }
            .mapIndexed { index, field -> field.copy(fieldNumber = index + 1) }
        return FieldDraftResult(
            drafts = drafts,
            allFields = allFields,
        )
    }

    private fun Event.shouldPersistManagedFieldsOrSlots(hasRentalBackedSlots: Boolean): Boolean {
        return eventType == EventType.LEAGUE ||
            eventType == EventType.TOURNAMENT ||
            eventType == EventType.WEEKLY_EVENT ||
            hasRentalBackedSlots
    }
}

internal fun editableLeagueTimeSlotsForEvent(
    event: Event,
    timeSlots: List<TimeSlot>,
): List<TimeSlot> {
    return timeSlots
        .map { slot -> normalizeEditableLeagueTimeSlotForEvent(event, slot) }
        .sortedBy { slot -> slot.startTimeMinutes ?: Int.MAX_VALUE }
}

internal fun syncEditableLeagueSlotBoundaries(
    previousEvent: Event,
    updatedEvent: Event,
    slots: List<TimeSlot>,
): List<TimeSlot> {
    val scheduleBoundaryChanged = previousEvent.start != updatedEvent.start ||
        previousEvent.end != updatedEvent.end ||
        previousEvent.noFixedEndDateTime != updatedEvent.noFixedEndDateTime ||
        previousEvent.eventType != updatedEvent.eventType
    if (!scheduleBoundaryChanged || slots.isEmpty()) {
        return slots
    }

    return slots.map { slot ->
        if (!slot.repeating) {
            slot
        } else {
            val normalizedStart = when {
                slot.startDate == Instant.DISTANT_PAST -> Instant.DISTANT_PAST
                slot.startDate == previousEvent.start -> Instant.DISTANT_PAST
                else -> slot.startDate
            }
            slot.copy(
                startDate = normalizedStart,
                endDate = updatedEvent.defaultLeagueSlotEndDate(),
            )
        }
    }
}

internal fun buildEditableFieldDrafts(
    event: Event,
    sourceFields: List<Field>,
    idFactory: () -> String = ::newId,
): List<Field> {
    val sourceById = sourceFields.associateBy { field -> field.id.trim() }
    val orderedEventFieldIds = event.fieldIds
        .map { fieldId -> fieldId.trim() }
        .filter(String::isNotBlank)
        .distinct()
    val baseFields = if (orderedEventFieldIds.isNotEmpty()) {
        orderedEventFieldIds.mapIndexed { index, fieldId ->
            sourceById[fieldId] ?: Field(
                fieldNumber = index + 1,
                organizationId = event.organizationId,
                id = fieldId,
            ).copy(
                name = "Field ${index + 1}",
                location = defaultFieldLocation(event),
            )
        }
    } else {
        sourceFields
            .sortedBy { field -> field.fieldNumber }
            .ifEmpty {
                emptyList()
            }
    }

    return baseFields.mapIndexed { index, field ->
        field.copy(
            id = field.id.trim().takeIf(String::isNotBlank) ?: idFactory(),
            fieldNumber = index + 1,
            name = field.name?.takeIf(String::isNotBlank) ?: "Field ${index + 1}",
            divisions = field.divisions
                .normalizeDivisionIdentifiers()
                .ifEmpty { defaultFieldDivisions(event) },
            location = eventFieldLocationDefault(field, event),
            organizationId = field.organizationId?.trim()?.takeIf(String::isNotBlank) ?: event.organizationId,
        )
    }
}

internal fun syncEditableFieldsForEvent(
    previousEvent: Event,
    updatedEvent: Event,
    fields: List<Field>,
): List<Field> {
    if (fields.isEmpty()) return fields

    return fields.mapIndexed { index, field ->
        field.copy(
            fieldNumber = index + 1,
            divisions = field.divisions
                .normalizeDivisionIdentifiers()
                .ifEmpty { defaultFieldDivisions(updatedEvent) },
            location = eventFieldLocationDefault(field, updatedEvent, previousEvent),
            organizationId = resolveFieldOrganizationId(
                fieldOrganizationId = field.organizationId,
                eventOrganizationId = updatedEvent.organizationId,
            ),
        )
    }
}

internal fun defaultFieldDivisions(event: Event): List<String> {
    val eventDivisions = event.divisions.normalizeDivisionIdentifiers()
    return eventDivisions.ifEmpty { listOf(DEFAULT_DIVISION) }
}

internal fun defaultFieldLocation(event: Event): String? {
    return event.location.trim().takeIf(String::isNotBlank)
}

internal fun eventFieldLocationDefault(
    field: Field,
    event: Event,
    previousEvent: Event? = null,
): String? {
    val currentLocation = field.location?.trim()?.takeIf(String::isNotBlank)
    val previousDefault = previousEvent?.let(::defaultFieldLocation)
    val eventDefault = defaultFieldLocation(event)
    return when {
        currentLocation == null -> eventDefault
        previousDefault != null && currentLocation == previousDefault -> eventDefault
        else -> currentLocation
    }
}

internal fun resolveFieldOrganizationId(
    fieldOrganizationId: String?,
    eventOrganizationId: String?,
): String? {
    return fieldOrganizationId
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?: eventOrganizationId?.trim()?.takeIf(String::isNotBlank)
}

internal fun LeagueScoringConfig.toDto(): LeagueScoringConfigDTO = LeagueScoringConfigDTO(
    pointsForWin = pointsForWin,
    pointsForDraw = pointsForDraw,
    pointsForLoss = pointsForLoss,
    pointsPerSetWin = pointsPerSetWin,
    pointsPerSetLoss = pointsPerSetLoss,
    pointsPerGameWin = pointsPerGameWin,
    pointsPerGameLoss = pointsPerGameLoss,
    pointsPerGoalScored = pointsPerGoalScored,
    pointsPerGoalConceded = pointsPerGoalConceded,
)

internal fun createDefaultLeagueSlot(
    event: Event,
    now: Instant = Clock.System.now(),
    idFactory: () -> String = ::newId,
): TimeSlot {
    val startDate = if (event.start == Instant.DISTANT_PAST) now else event.start
    val endDate = event.defaultLeagueSlotEndDate()
    return TimeSlot(
        id = idFactory(),
        dayOfWeek = null,
        daysOfWeek = emptyList(),
        divisions = defaultFieldDivisions(event),
        startTimeMinutes = null,
        endTimeMinutes = null,
        startDate = startDate,
        timeZone = event.timeZone,
        repeating = true,
        endDate = endDate,
        scheduledFieldId = null,
        scheduledFieldIds = emptyList(),
        price = null,
    )
}

internal fun Event.defaultLeagueSlotEndDate(): Instant? {
    if (eventType == EventType.WEEKLY_EVENT || noFixedEndDateTime) {
        return null
    }
    return end
        .takeIf { value -> value > start }
        ?.toDateOnlyInstant(resolvedTimeZone())
}

internal fun Instant.toDateOnlyInstant(timezone: TimeZone): Instant {
    val localDate = toLocalDateTime(timezone).date
    return localDate.atStartOfDayIn(timezone)
}

internal fun Instant.toMinutesOfDay(timezone: TimeZone): Int {
    val localTime = toLocalDateTime(timezone).time
    return localTime.hour * 60 + localTime.minute
}

internal fun Instant.toMondayFirstDay(timezone: TimeZone): Int {
    val isoDay = toLocalDateTime(timezone).date.dayOfWeek.isoDayNumber
    return (isoDay - 1).mod(7)
}

internal fun List<String>.normalizeDistinctIds(): List<String> {
    return this
        .map { value -> value.trim() }
        .filter(String::isNotBlank)
        .distinct()
}

internal data class RecurringSlotDateBounds(
    val startDate: Instant,
    val endDate: Instant?,
)

internal fun normalizeEditableLeagueTimeSlotForEvent(
    event: Event,
    slot: TimeSlot,
): TimeSlot {
    if (!slot.repeating) {
        return slot
    }

    val normalizedStart = if (slot.startDate == event.start) {
        Instant.DISTANT_PAST
    } else {
        slot.startDate
    }
    val normalizedEnd = if (event.eventType == EventType.WEEKLY_EVENT || event.noFixedEndDateTime) {
        null
    } else {
        slot.endDate
    }

    return if (normalizedStart == slot.startDate && normalizedEnd == slot.endDate) {
        slot
    } else {
        slot.copy(
            startDate = normalizedStart,
            endDate = normalizedEnd,
        )
    }
}

internal fun resolveRecurringSlotDateBoundsForEventDraft(
    slot: TimeSlot,
    event: Event,
    originalEventStart: Instant,
): RecurringSlotDateBounds {
    val slotStartDate = when {
        slot.startDate == Instant.DISTANT_PAST -> event.start
        slot.startDate == originalEventStart -> event.start
        else -> slot.startDate
    }
    val slotEndDate = if (event.eventType == EventType.WEEKLY_EVENT || event.noFixedEndDateTime) {
        null
    } else {
        event.end
            .takeIf { value -> value > event.start }
            ?.toDateOnlyInstant(event.resolvedTimeZone())
    }
    return RecurringSlotDateBounds(
        startDate = slotStartDate,
        endDate = slotEndDate,
    )
}
