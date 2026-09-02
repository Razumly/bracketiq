package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.isRentalBacked
import com.razumly.mvp.core.data.dataTypes.normalizeScheduleConstructionTimeSlots
import com.razumly.mvp.core.data.dataTypes.withAutomatedScheduling
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.isScheduleConstructionAutomationType
import com.razumly.mvp.core.data.dataTypes.enums.normalizeAutomatedSchedulingForEventType
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.util.newId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.time.Clock
import kotlin.time.Instant

data class EventEditorControlLocks(
    val eventType: Boolean = false,
    val teamSignup: Boolean = false,
    val automatedScheduling: Boolean = false,
    val eventTypeHasProtectedHistory: Boolean = false,
)

internal class EventEditDraftCoordinator(
    initialEvent: Event,
    canEditInitial: Boolean,
) {
    private val _controlLocks = MutableStateFlow(EventEditorControlLocks())
    val controlLocks = _controlLocks.asStateFlow()

    private val _editedEvent = MutableStateFlow(initialEvent)
    val editedEvent = _editedEvent.asStateFlow()

    private val _isEditing = MutableStateFlow(canEditInitial)
    val isEditing = _isEditing.asStateFlow()
    private var draftHasUnsavedChanges = false

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
        if (!enabled) {
            _controlLocks.value = EventEditorControlLocks()
            draftHasUnsavedChanges = false
        }
    }

    fun setControlLocks(
        immutableFieldNames: Set<String>,
        eventTypeHasProtectedHistory: Boolean = false,
        fallbackEvent: Event? = null,
    ) {
        val persistedEvent = fallbackEvent ?: _editedEvent.value
        val protectedHistory = eventTypeHasProtectedHistory ||
            persistedEvent.eventTypeHasProtectedHistory
        val normalizedImmutableFieldNames = immutableFieldNames
            .map(String::trim)
            .filter(String::isNotBlank)
            .toSet()
        _controlLocks.value = EventEditorControlLocks(
            eventType = persistedEvent.eventTypeLocked ||
                protectedHistory ||
                normalizedImmutableFieldNames.contains("eventType"),
            teamSignup = persistedEvent.registrationUnitLocked ||
                normalizedImmutableFieldNames.contains("teamSignup"),
            automatedScheduling = normalizedImmutableFieldNames.contains("isAutomatedScheduling"),
            eventTypeHasProtectedHistory = protectedHistory,
        )
    }


    fun forceExitEditing(event: Event) {
        _isEditing.value = false
        _controlLocks.value = EventEditorControlLocks()
        draftHasUnsavedChanges = false
        val retainedSlots = normalizeScheduleConstructionTimeSlots(
            event = event,
            slots = _editableLeagueTimeSlots.value,
        )
        _editedEvent.value = event.copy(timeSlotIds = retainedSlots.map(TimeSlot::id))
        _editableLeagueTimeSlots.value = retainedSlots
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
        resourceLabelSingular: String = "Resource",
        leagueScoringConfig: LeagueScoringConfigDTO,
    ) {
        if (_isEditing.value) return
        val refreshedFields = buildEditableFieldDrafts(
            event = event,
            sourceFields = sourceFields,
            resourceLabelSingular = resourceLabelSingular,
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
        resourceLabelSingular: String = "Resource",
        leagueScoringConfig: LeagueScoringConfigDTO,
    ) {
        val seededFields = buildEditableFieldDrafts(
            event = event,
            sourceFields = sourceFields,
            resourceLabelSingular = resourceLabelSingular,
            preserveSourceValues = true,
        )
        val retainedSlots = normalizeScheduleConstructionTimeSlots(
            event = event,
            slots = timeSlots,
        )
        _editableLeagueScoringConfig.value = leagueScoringConfig
        _editedEvent.value = event.copy(
            fieldIds = seededFields.map { field -> field.id },
            timeSlotIds = retainedSlots.map(TimeSlot::id),
        )
        _editableFields.value = seededFields
        _fieldCount.value = seededFields.size
        _editableLeagueTimeSlots.value = retainedSlots
        draftHasUnsavedChanges = false
    }

    fun hasUnsavedChanges(): Boolean = draftHasUnsavedChanges

    fun updateEditedEvent(update: (Event) -> Event) {
        draftHasUnsavedChanges = true
        val previous = _editedEvent.value
        val candidate = update(previous)
        val locks = _controlLocks.value
        val eventTypeChangedWhileLocked = locks.eventType &&
            candidate.eventType != previous.eventType
        val eventTypeChangeConflictsWithAutomationLock = locks.automatedScheduling &&
            candidate.eventType != previous.eventType &&
            normalizeAutomatedSchedulingForEventType(
                eventType = candidate.eventType,
                value = previous.isAutomatedScheduling,
            ) != previous.isAutomatedScheduling
        val nextEventType = if (
            locks.eventType ||
                eventTypeChangeConflictsWithAutomationLock
        ) {
            previous.eventType
        } else {
            candidate.eventType
        }
        val nextTeamSignup = when {
            locks.teamSignup || eventTypeChangedWhileLocked -> previous.teamSignup
            nextEventType == EventType.LEAGUE ||
                nextEventType == EventType.TOURNAMENT -> true
            nextEventType == EventType.TRYOUT -> false
            else -> candidate.teamSignup
        }
        val nextAutomatedScheduling = if (locks.automatedScheduling) {
            previous.isAutomatedScheduling
        } else {
            normalizeAutomatedSchedulingForEventType(
                eventType = nextEventType,
                value = candidate.isAutomatedScheduling,
            )
        }
        val automatedSchedulingChangeRejected = locks.automatedScheduling &&
            candidate.isAutomatedScheduling != previous.isAutomatedScheduling
        val updated = candidate
            .copy(
                eventType = nextEventType,
                teamSignup = nextTeamSignup,
            )
            .let { next ->
                if (automatedSchedulingChangeRejected) {
                    next.copy(
                        isAutomatedScheduling = previous.isAutomatedScheduling,
                        noFixedEndDateTime = previous.noFixedEndDateTime,
                    )
                } else {
                    next.withAutomatedScheduling(nextAutomatedScheduling)
                }
            }
        val clearScheduleConstructionState =
            previous.isAutomatedScheduling &&
                !updated.isAutomatedScheduling &&
                previous.eventType.isScheduleConstructionAutomationType()
        val transitionedTimeSlots = if (clearScheduleConstructionState) {
            _editableLeagueTimeSlots.value.filter { slot -> slot.isRentalBacked() }
        } else {
            syncEditableLeagueSlotBoundaries(
                previousEvent = previous,
                updatedEvent = updated,
                slots = _editableLeagueTimeSlots.value,
            )
        }
        val nextTimeSlots = normalizeScheduleConstructionTimeSlots(
            event = updated,
            slots = transitionedTimeSlots,
        )
        _editedEvent.value = if (nextTimeSlots != _editableLeagueTimeSlots.value) {
            updated.copy(timeSlotIds = nextTimeSlots.map(TimeSlot::id))
        } else {
            updated
        }
        _editableFields.value = syncEditableFieldsForEvent(previous, updated, _editableFields.value)
        _editableLeagueTimeSlots.value = nextTimeSlots
    }

    fun selectFieldCount(
        count: Int,
        resourceLabelSingular: String = "Resource",
        idFactory: () -> String = ::newId,
    ) {
        draftHasUnsavedChanges = true
        val normalized = count.coerceAtLeast(0)
        _fieldCount.value = normalized

        val currentEvent = _editedEvent.value
        val resized = _editableFields.value
            .take(normalized)
            .mapIndexed { index, field ->
                field.copy(
                    id = if (field.id.isBlank()) idFactory() else field.id,
                    fieldNumber = index + 1,
                    name = field.name?.takeIf(String::isNotBlank) ?: "$resourceLabelSingular ${index + 1}",
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
                name = "$resourceLabelSingular $fieldNumber",
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
        draftHasUnsavedChanges = true
        fields[index] = fields[index].copy(name = name)
        _editableFields.value = fields
    }

    fun updateLeagueScoringConfig(update: LeagueScoringConfigDTO.() -> LeagueScoringConfigDTO) {
        draftHasUnsavedChanges = true
        _editableLeagueScoringConfig.value = _editableLeagueScoringConfig.value.update()
    }

    fun addLeagueTimeSlot(
        now: Instant = Clock.System.now(),
        idFactory: () -> String = ::newId,
    ) {
        draftHasUnsavedChanges = true
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
        draftHasUnsavedChanges = true
        val validFieldIds = editableFieldIds()
        slots[index] = normalizeSlotResourceSelection(slots[index].update(), validFieldIds)
        _editableLeagueTimeSlots.value = slots
    }

    fun removeLeagueTimeSlot(index: Int) {
        val slots = _editableLeagueTimeSlots.value.toMutableList()
        if (index !in slots.indices) return
        draftHasUnsavedChanges = true
        slots.removeAt(index)
        _editableLeagueTimeSlots.value = slots
    }

    fun editableFieldIds(): Set<String> {
        return _editableFields.value.map { field -> field.id }.toSet()
    }

    fun applyRentalDraft(draft: RentalResourceDraftSyncResult) {
        draftHasUnsavedChanges = true
        val retainedSlots = normalizeScheduleConstructionTimeSlots(
            event = draft.event,
            slots = draft.timeSlots,
        )
        _editableFields.value = draft.fields
        _fieldCount.value = draft.fields.size
        _editableLeagueTimeSlots.value = retainedSlots
        _editedEvent.value = draft.event.copy(timeSlotIds = retainedSlots.map(TimeSlot::id))
    }

    fun applyPreparedEditableFields(fields: List<Field>) {
        _editableFields.value = fields
        _fieldCount.value = fields.size
        _editedEvent.value = _editedEvent.value.copy(fieldIds = fields.map { field -> field.id })
    }
}
