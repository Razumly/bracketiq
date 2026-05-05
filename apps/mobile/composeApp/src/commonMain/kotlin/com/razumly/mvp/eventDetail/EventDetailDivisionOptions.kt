package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel

data class EventDetailDivisionOption(
    val id: String,
    val label: String,
    val key: String? = null,
    val divisionTypeId: String? = null,
)

internal fun buildRegistrationDivisionOptions(event: Event): List<EventDetailDivisionOption> {
    val options = mutableListOf<EventDetailDivisionOption>()
    val seenIds = mutableSetOf<String>()
    val playoffDivisionIds = event.divisionDetails
        .asSequence()
        .filter { detail -> detail.kind?.trim()?.equals("PLAYOFF", ignoreCase = true) == true }
        .flatMap { detail -> sequenceOf(detail.id, detail.key) }
        .map { rawId -> rawId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .toSet()

    fun addOption(
        rawId: String?,
        explicitLabel: String? = null,
        key: String? = null,
        divisionTypeId: String? = null,
    ) {
        val normalizedId = rawId
            ?.normalizeDivisionIdentifier()
            .orEmpty()
        if (normalizedId.isEmpty() || normalizedId in playoffDivisionIds || !seenIds.add(normalizedId)) {
            return
        }
        val label = explicitLabel
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: normalizedId.toDivisionDisplayLabel(event.divisionDetails)
        options += EventDetailDivisionOption(
            id = normalizedId,
            label = label.ifBlank { normalizedId },
            key = key?.normalizeDivisionIdentifier()?.ifEmpty { null },
            divisionTypeId = divisionTypeId?.normalizeDivisionIdentifier()?.ifEmpty { null },
        )
    }

    val regularDetails = event.divisionDetails
        .filterNot { detail -> detail.kind?.trim()?.equals("PLAYOFF", ignoreCase = true) == true }
    if (regularDetails.isNotEmpty()) {
        regularDetails.forEach { detail ->
            addOption(
                rawId = detail.id.ifBlank { detail.key },
                explicitLabel = detail.name,
                key = detail.key,
                divisionTypeId = detail.divisionTypeId,
            )
        }
    } else {
        event.divisions.forEach { divisionId ->
            addOption(rawId = divisionId)
        }
    }

    return options
}

internal fun List<EventDetailDivisionOption>.resolveSelectedEventDivisionId(preferredId: String?): String? {
    if (isEmpty()) return null
    return firstOrNull { option -> option.matchesDivisionIdentifier(preferredId) }?.id
        ?: first().id
}

internal fun EventDetailDivisionOption.matchesDivisionIdentifier(value: String?): Boolean {
    val normalizedValue = value
        ?.normalizeDivisionIdentifier()
        .orEmpty()
    if (normalizedValue.isEmpty()) return false
    return normalizedValue == id ||
        normalizedValue == key ||
        normalizedValue == divisionTypeId
}
