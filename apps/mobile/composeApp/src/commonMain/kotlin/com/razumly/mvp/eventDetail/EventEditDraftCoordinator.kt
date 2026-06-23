package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.util.newId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.time.Clock
import kotlin.time.Instant

internal class EventEditDraftCoordinator(
    initialEvent: Event,
    canEditInitial: Boolean,
) {
    private val _editedEvent = MutableStateFlow(initialEvent)
    val editedEvent = _editedEvent.asStateFlow()

    private val _isEditing = MutableStateFlow(canEditInitial)
    val isEditing = _isEditing.asStateFlow()

    private val _fieldCount = MutableStateFlow(0)
    val fieldCount = _fieldCount.asStateFlow()

    private val _editableLeagueTimeSlots = MutableStateFlow<List<TimeSlot>>(emptyList())
    val editableLeagueTimeSlots = _editableLeagueTimeSlots.asStateFlow()

    private val _editableFields = MutableStateFlow<List<Field>>(emptyList())
    val editableFields = _editableFields.asStateFlow()

    private val _editableLeagueScoringConfig = MutableStateFlow(LeagueScoringConfigDTO())
    val editableLeagueScoringConfig = _editableLeagueScoringConfig.asStateFlow()

    fun setEditing(enabled: Boolean) {
        _isEditing.value = enabled
    }

    fun forceExitEditing(event: Event) {
        _isEditing.value = false
        _editedEvent.value = event
    }

    fun replaceReadOnlyTimeSlots(event: Event, timeSlots: List<TimeSlot>) {
        if (_isEditing.value) return
        _editableLeagueTimeSlots.value = editableLeagueTimeSlotsForEvent(
            event = event,
            timeSlots = timeSlots,
        )
    }

    fun refreshReadOnlyDraft(
        event: Event,
        sourceFields: List<Field>,
        leagueScoringConfig: LeagueScoringConfigDTO,
    ) {
        if (_isEditing.value) return
        val refreshedFields = buildEditableFieldDrafts(
            event = event,
            sourceFields = sourceFields,
        )
        _editableFields.value = refreshedFields
        _fieldCount.value = refreshedFields.size
        _editableLeagueScoringConfig.value = leagueScoringConfig
        _editedEvent.value = event.copy(fieldIds = refreshedFields.map { field -> field.id })
    }

    fun seedDraftForEditing(
        event: Event,
        sourceFields: List<Field>,
        timeSlots: List<TimeSlot>,
        leagueScoringConfig: LeagueScoringConfigDTO,
    ) {
        val seededFields = buildEditableFieldDrafts(
            event = event,
            sourceFields = sourceFields,
        )
        _editableLeagueScoringConfig.value = leagueScoringConfig
        _editedEvent.value = event.copy(fieldIds = seededFields.map { field -> field.id })
        _editableFields.value = seededFields
        _fieldCount.value = seededFields.size
        _editableLeagueTimeSlots.value = editableLeagueTimeSlotsForEvent(
            event = event,
            timeSlots = timeSlots,
        )
    }

    fun updateEditedEvent(update: (Event) -> Event) {
        val previous = _editedEvent.value
        val updated = update(previous)
        _editedEvent.value = updated
        _editableFields.value = syncEditableFieldsForEvent(previous, updated, _editableFields.value)
        _editableLeagueTimeSlots.value = syncEditableLeagueSlotBoundaries(
            previousEvent = previous,
            updatedEvent = updated,
            slots = _editableLeagueTimeSlots.value,
        )
    }

    fun selectFieldCount(
        count: Int,
        idFactory: () -> String = ::newId,
    ) {
        val normalized = count.coerceAtLeast(0)
        _fieldCount.value = normalized

        val currentEvent = _editedEvent.value
        val resized = _editableFields.value
            .take(normalized)
            .mapIndexed { index, field ->
                field.copy(
                    id = if (field.id.isBlank()) idFactory() else field.id,
                    fieldNumber = index + 1,
                    divisions = field.divisions
                        .normalizeDivisionIdentifiers()
                        .ifEmpty { defaultFieldDivisions(currentEvent) },
                    location = eventFieldLocationDefault(field, currentEvent),
                    organizationId = resolveFieldOrganizationId(
                        fieldOrganizationId = field.organizationId,
                        eventOrganizationId = currentEvent.organizationId,
                    ),
                )
            }
            .toMutableList()

        while (resized.size < normalized) {
            val fieldNumber = resized.size + 1
            resized += Field(
                fieldNumber = fieldNumber,
                organizationId = currentEvent.organizationId,
                id = idFactory(),
            ).copy(
                name = "Field $fieldNumber",
                divisions = defaultFieldDivisions(currentEvent),
                location = defaultFieldLocation(currentEvent),
            )
        }

        _editableFields.value = resized
        _editedEvent.value = currentEvent.copy(fieldIds = resized.map { field -> field.id })

        val validFieldIds = resized.map { field -> field.id }.toSet()
        _editableLeagueTimeSlots.value = _editableLeagueTimeSlots.value.map { slot ->
            val remainingFieldIds = slot.normalizedScheduledFieldIds().filter(validFieldIds::contains)
            slot.copy(
                scheduledFieldId = remainingFieldIds.firstOrNull(),
                scheduledFieldIds = remainingFieldIds,
            )
        }
    }

    fun updateLocalFieldName(index: Int, name: String) {
        val fields = _editableFields.value.toMutableList()
        if (index !in fields.indices) return
        fields[index] = fields[index].copy(name = name)
        _editableFields.value = fields
    }

    fun updateLeagueScoringConfig(update: LeagueScoringConfigDTO.() -> LeagueScoringConfigDTO) {
        _editableLeagueScoringConfig.value = _editableLeagueScoringConfig.value.update()
    }

    fun addLeagueTimeSlot(
        now: Instant = Clock.System.now(),
        idFactory: () -> String = ::newId,
    ) {
        _editableLeagueTimeSlots.value = _editableLeagueTimeSlots.value + createDefaultLeagueSlot(
            event = _editedEvent.value,
            now = now,
            idFactory = idFactory,
        )
    }

    fun updateLeagueTimeSlot(
        index: Int,
        update: TimeSlot.() -> TimeSlot,
        normalizeSlotResourceSelection: (TimeSlot, Set<String>) -> TimeSlot,
    ) {
        val slots = _editableLeagueTimeSlots.value.toMutableList()
        if (index !in slots.indices) return
        val validFieldIds = editableFieldIds()
        slots[index] = normalizeSlotResourceSelection(slots[index].update(), validFieldIds)
        _editableLeagueTimeSlots.value = slots
    }

    fun removeLeagueTimeSlot(index: Int) {
        val slots = _editableLeagueTimeSlots.value.toMutableList()
        if (index !in slots.indices) return
        slots.removeAt(index)
        _editableLeagueTimeSlots.value = slots
    }

    fun editableFieldIds(): Set<String> {
        return _editableFields.value.map { field -> field.id }.toSet()
    }

    fun applyRentalDraft(draft: RentalResourceDraftSyncResult) {
        _editableFields.value = draft.fields
        _fieldCount.value = draft.fields.size
        _editableLeagueTimeSlots.value = draft.timeSlots
        _editedEvent.value = draft.event
    }

    fun applyPreparedEditableFields(fields: List<Field>) {
        _editableFields.value = fields
        _fieldCount.value = fields.size
        _editedEvent.value = _editedEvent.value.copy(fieldIds = fields.map { field -> field.id })
    }
}
