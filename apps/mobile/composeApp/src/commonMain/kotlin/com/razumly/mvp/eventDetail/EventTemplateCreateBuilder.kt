package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.buildEventOfficialPositionId
import com.razumly.mvp.core.data.dataTypes.buildEventOfficialRecordId
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers

private const val TEMPLATE_RENTAL_RESOURCE_SOURCE_TYPE_PREFIX = "BRACKETIQ_TEMPLATE_RENTAL_RESOURCE:"

internal data class EventTemplateCreateInput(
    val sourceEvent: Event,
    val currentUserId: String?,
    val sourceSport: Sport?,
    val isEditing: Boolean,
    val editableFields: List<Field>,
    val relationFields: List<Field>,
    val editableTimeSlots: List<TimeSlot>,
    val relationTimeSlots: List<TimeSlot>,
    val editableLeagueScoringConfig: LeagueScoringConfigDTO,
    val nextId: () -> String,
)

internal data class PreparedTemplateForCreate(
    val event: Event,
    val fields: List<Field>? = null,
    val timeSlots: List<TimeSlot>? = null,
    val leagueScoringConfig: LeagueScoringConfigDTO? = null,
)

internal object EventTemplateCreateBuilder {
    fun prepare(input: EventTemplateCreateInput): PreparedTemplateForCreate {
        val templateEvent = buildTemplateEvent(
            sourceEvent = input.sourceEvent,
            currentUserId = input.currentUserId,
            sourceSport = input.sourceSport,
            nextId = input.nextId,
        )
        val shouldPersistFieldsAndSlots = templateEvent.eventType == EventType.LEAGUE ||
            templateEvent.eventType == EventType.TOURNAMENT ||
            templateEvent.eventType == EventType.WEEKLY_EVENT
        if (!shouldPersistFieldsAndSlots) {
            return PreparedTemplateForCreate(
                event = templateEvent,
                fields = null,
                timeSlots = null,
                leagueScoringConfig = null,
            )
        }

        val sourceSlots = if (input.isEditing) {
            input.editableTimeSlots
        } else {
            input.relationTimeSlots
        }
        val rentalOnlyFieldIds = sourceSlots.rentalOnlyFieldIds()
        val sourceFields = buildEditableFieldDrafts(
            event = templateEvent,
            sourceFields = if (input.isEditing) {
                input.editableFields
            } else {
                input.relationFields
            },
        ).filterNot { field -> rentalOnlyFieldIds.contains(field.id.trim()) }
        val sourceFieldById = buildEditableFieldDrafts(
            event = templateEvent,
            sourceFields = if (input.isEditing) {
                input.editableFields
            } else {
                input.relationFields
            },
        ).associateBy { field -> field.id.trim() }

        val isOrganizationManaged = !templateEvent.organizationId.isNullOrBlank()
        val clonedFields = if (isOrganizationManaged) {
            null
        } else {
            sourceFields.mapIndexed { index, field ->
                field.copy(
                    id = input.nextId(),
                    fieldNumber = index + 1,
                    name = field.name?.takeIf(String::isNotBlank) ?: "Field ${index + 1}",
                    divisions = field.divisions
                        .normalizeDivisionIdentifiers()
                        .ifEmpty { defaultFieldDivisions(templateEvent) },
                    location = eventFieldLocationDefault(field, templateEvent),
                    organizationId = resolveFieldOrganizationId(
                        fieldOrganizationId = field.organizationId,
                        eventOrganizationId = templateEvent.organizationId,
                    ),
                )
            }
        }

        val fieldIdRemap = if (clonedFields != null) {
            sourceFields.zip(clonedFields).mapNotNull { (source, clone) ->
                val sourceId = source.id.trim().takeIf(String::isNotBlank) ?: return@mapNotNull null
                sourceId to clone.id
            }.toMap()
        } else {
            emptyMap()
        }

        val resolvedFieldIds = if (clonedFields != null) {
            clonedFields.map { field -> field.id }
        } else {
            templateEvent.fieldIds
                .map { fieldId -> fieldId.trim() }
                .filter(String::isNotBlank)
                .filterNot(rentalOnlyFieldIds::contains)
                .ifEmpty {
                    sourceFields
                        .map { field -> field.id.trim() }
                        .filter(String::isNotBlank)
                }
        }
        val resolvedFieldIdSet = resolvedFieldIds.toSet()

        val clonedTimeSlots = sourceSlots.mapNotNull { slot ->
            val sourceSlotFieldIds = slot.normalizedScheduledFieldIds()
            val isRentalReference = slot.isRentalBacked() &&
                sourceSlotFieldIds.any(rentalOnlyFieldIds::contains)
            val normalizedDays = slot.normalizedDaysOfWeek()
            val normalizedDivisions = slot.normalizedDivisionIds()
                .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
                .filter(String::isNotBlank)
                .distinct()
                .ifEmpty { defaultFieldDivisions(templateEvent) }

            if (isRentalReference) {
                val sourceField = sourceSlotFieldIds
                    .firstNotNullOfOrNull { fieldId -> sourceFieldById[fieldId] }
                return@mapNotNull slot.copy(
                    id = input.nextId(),
                    dayOfWeek = normalizedDays.firstOrNull(),
                    daysOfWeek = normalizedDays,
                    divisions = normalizedDivisions,
                    scheduledFieldId = null,
                    scheduledFieldIds = emptyList(),
                    price = null,
                    sourceType = buildTemplateRentalResourceSourceType(
                        field = sourceField,
                        event = templateEvent,
                    ),
                    rentalBookingId = null,
                    rentalBookingItemId = null,
                    rentalLocked = false,
                )
            }

            val mappedFieldIds = sourceSlotFieldIds
                .map { fieldId -> fieldIdRemap[fieldId] ?: fieldId }
                .filterNot(rentalOnlyFieldIds::contains)
                .filter(resolvedFieldIdSet::contains)
                .distinct()
            if (mappedFieldIds.isEmpty()) {
                return@mapNotNull null
            }
            slot.copy(
                id = input.nextId(),
                dayOfWeek = normalizedDays.firstOrNull(),
                daysOfWeek = normalizedDays,
                divisions = normalizedDivisions,
                scheduledFieldId = mappedFieldIds.firstOrNull(),
                scheduledFieldIds = mappedFieldIds,
            )
        }

        val leagueScoringConfig = if (templateEvent.eventType == EventType.LEAGUE) {
            input.editableLeagueScoringConfig
        } else {
            null
        }

        return PreparedTemplateForCreate(
            event = templateEvent.copy(
                fieldIds = resolvedFieldIds,
                timeSlotIds = clonedTimeSlots.map { slot -> slot.id },
            ),
            fields = clonedFields,
            timeSlots = clonedTimeSlots,
            leagueScoringConfig = leagueScoringConfig,
        )
    }

    private fun buildTemplateEvent(
        sourceEvent: Event,
        currentUserId: String?,
        sourceSport: Sport?,
        nextId: () -> String,
    ): Event {
        val templateId = nextId()
        val normalizedCurrentUserId = currentUserId?.trim()?.takeIf(String::isNotBlank)
        val templatePositions = sourceEvent.officialPositions.mapIndexed { index, position ->
            position.copy(
                id = buildEventOfficialPositionId(
                    eventId = templateId,
                    order = index,
                    name = position.name,
                ),
                order = index,
            )
        }
        val templatePositionIdsByPreviousId = sourceEvent.officialPositions
            .mapIndexed { index, position -> position.id to templatePositions[index].id }
            .toMap()
        return sourceEvent.copy(
            id = templateId,
            name = addTemplateSuffix(sourceEvent.name),
            state = "TEMPLATE",
            hostId = normalizedCurrentUserId ?: sourceEvent.hostId,
            userIds = emptyList(),
            teamIds = emptyList(),
            waitListIds = emptyList(),
            freeAgentIds = emptyList(),
            officialPositions = templatePositions,
            eventOfficials = sourceEvent.eventOfficials.map { official ->
                official.copy(
                    id = buildEventOfficialRecordId(
                        eventId = templateId,
                        userId = official.userId,
                    ),
                    positionIds = official.positionIds.mapNotNull(templatePositionIdsByPreviousId::get),
                )
            },
        ).syncOfficialStaffing(sport = sourceSport)
    }
}

private fun List<TimeSlot>.rentalOnlyFieldIds(): Set<String> {
    val rentalFieldIds = mutableSetOf<String>()
    val regularFieldIds = mutableSetOf<String>()
    forEach { slot ->
        val target = if (slot.isRentalBacked()) rentalFieldIds else regularFieldIds
        target += slot.normalizedScheduledFieldIds()
    }
    return rentalFieldIds.filterNot(regularFieldIds::contains).toSet()
}

private fun buildTemplateRentalResourceSourceType(
    field: Field?,
    event: Event,
): String {
    val payload = mapOf(
        "fieldId" to field?.id.orEmpty(),
        "fieldName" to field?.name.orEmpty(),
        "facilityName" to field?.facility?.name.orEmpty(),
        "organizationId" to (field?.organizationId ?: event.organizationId).orEmpty(),
        "location" to (field?.location ?: event.location).orEmpty(),
    ).entries
        .filter { (_, value) -> value.isNotBlank() }
        .joinToString(prefix = "{", postfix = "}") { (key, value) ->
            "\"${key.jsonEscape()}\":\"${value.jsonEscape()}\""
        }
    return TEMPLATE_RENTAL_RESOURCE_SOURCE_TYPE_PREFIX + payload.percentEncode()
}

private fun String.jsonEscape(): String =
    buildString {
        this@jsonEscape.forEach { char ->
            when (char) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\b' -> append("\\b")
                '\u000C' -> append("\\f")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> append(char)
            }
        }
    }

private fun String.percentEncode(): String =
    encodeToByteArray().joinToString(separator = "") { byte ->
        val value = byte.toInt() and 0xFF
        val char = value.toChar()
        if (
            char in 'A'..'Z' ||
            char in 'a'..'z' ||
            char in '0'..'9' ||
            char == '-' ||
            char == '_' ||
            char == '.' ||
            char == '~'
        ) {
            char.toString()
        } else {
            "%${value.toString(16).uppercase().padStart(2, '0')}"
        }
    }

internal fun addTemplateSuffix(name: String): String {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) {
        return "(TEMPLATE)"
    }
    return if (trimmed.endsWith("(TEMPLATE)", ignoreCase = true)) {
        trimmed
    } else {
        "$trimmed (TEMPLATE)"
    }
}
