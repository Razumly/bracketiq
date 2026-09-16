package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel

data class EventDetailDivisionOption(
    val id: String,
    val label: String,
    val matchIdentifiers: List<String> = emptyList(),
)

internal fun buildRegistrationDivisionOptions(event: Event): List<EventDetailDivisionOption> {
    val options = mutableListOf<EventDetailDivisionOption>()
    val seenIds = mutableSetOf<String>()
    val playoffDivisionIds = event.divisionDetails
        .asSequence()
        .filter { detail -> detail.isTournamentPlayoffDivision() }
        .map { detail -> detail.id }
        .map { rawId -> rawId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .toSet()

    fun addOption(
        rawId: String?,
        explicitLabel: String? = null,
        allowPlayoffDivision: Boolean = false,
        matchIdentifiers: List<String> = emptyList(),
    ) {
        val normalizedId = rawId
            ?.normalizeDivisionIdentifier()
            .orEmpty()
        if (
            normalizedId.isEmpty() ||
            (!allowPlayoffDivision && normalizedId in playoffDivisionIds) ||
            !seenIds.add(normalizedId)
        ) {
            return
        }
        val label = explicitLabel
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: normalizedId.toDivisionDisplayLabel(event.divisionDetails)
        val normalizedMatchIdentifiers = matchIdentifiers
            .map { identifier -> identifier.normalizeDivisionIdentifier() }
            .filter { identifier -> identifier.isNotBlank() && identifier != normalizedId }
            .distinct()
        options += EventDetailDivisionOption(
            id = normalizedId,
            label = label.ifBlank { normalizedId },
            matchIdentifiers = normalizedMatchIdentifiers,
        )
    }

    if (event.isTournamentPoolPlayEnabled()) {
        val bracketDetails = event.divisionDetails
            .filter { detail -> detail.isTournamentPlayoffDivision() }
        bracketDetails.forEach { detail ->
            addOption(
                rawId = detail.id,
                explicitLabel = detail.name,
                allowPlayoffDivision = true,
                matchIdentifiers = detail.eventDivisionMatchIdentifiers(),
            )
        }
        if (options.isNotEmpty()) {
            return options.withoutAmbiguousMatchIdentifiers()
        }
    }

    val regularDetails = event.divisionDetails
        .filterNot { detail -> detail.isTournamentPlayoffDivision() }
    if (regularDetails.isNotEmpty()) {
        regularDetails.forEach { detail ->
            addOption(
                rawId = detail.id,
                explicitLabel = detail.name,
                matchIdentifiers = detail.eventDivisionMatchIdentifiers(),
            )
        }
    } else {
        event.divisions.forEach { divisionId ->
            addOption(rawId = divisionId)
        }
    }

    return options.withoutAmbiguousMatchIdentifiers()
}

private fun List<EventDetailDivisionOption>.withoutAmbiguousMatchIdentifiers(): List<EventDetailDivisionOption> {
    val identifierCounts = flatMap { option ->
        option.matchIdentifiers
            .map { identifier -> identifier.normalizeDivisionIdentifier() }
            .filter(String::isNotBlank)
            .distinct()
    }.groupingBy { identifier -> identifier }.eachCount()

    return map { option ->
        option.copy(
            matchIdentifiers = option.matchIdentifiers.filter { identifier ->
                identifierCounts[identifier.normalizeDivisionIdentifier()] == 1
            },
        )
    }
}



internal fun List<EventDetailDivisionOption>.resolveSelectedEventDivisionId(preferredId: String?): String? {
    if (isEmpty()) return null
    return findEventDivisionOption(preferredId)?.id
        ?: first().id
}

internal fun List<EventDetailDivisionOption>.findEventDivisionOption(
    value: String?,
): EventDetailDivisionOption? {
    val normalizedValue = value
        ?.normalizeDivisionIdentifier()
        .orEmpty()
    if (normalizedValue.isEmpty()) return null

    return firstOrNull { option -> option.matchesDivisionIdentifier(normalizedValue) }
}

internal fun EventDetailDivisionOption.matchesDivisionIdentifier(value: String?): Boolean {
    val normalizedValue = value
        ?.normalizeDivisionIdentifier()
        .orEmpty()
    if (normalizedValue.isEmpty()) return false
    return normalizedValue == id ||
        matchIdentifiers.any { identifier -> identifier.normalizeDivisionIdentifier() == normalizedValue }
}
