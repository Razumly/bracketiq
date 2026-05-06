package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
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
        .filter { detail -> detail.isTournamentPlayoffDivision() }
        .flatMap { detail -> sequenceOf(detail.id, detail.key) }
        .map { rawId -> rawId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .toSet()

    fun addOption(
        rawId: String?,
        explicitLabel: String? = null,
        key: String? = null,
        divisionTypeId: String? = null,
        allowPlayoffDivision: Boolean = false,
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
        options += EventDetailDivisionOption(
            id = normalizedId,
            label = label.ifBlank { normalizedId },
            key = key?.normalizeDivisionIdentifier()?.ifEmpty { null },
            divisionTypeId = divisionTypeId?.normalizeDivisionIdentifier()?.ifEmpty { null },
        )
    }

    if (event.isTournamentPoolPlayEnabled()) {
        val bracketDetails = event.divisionDetails
            .filter { detail -> detail.isTournamentPlayoffDivision() }
        if (bracketDetails.isNotEmpty()) {
            bracketDetails.forEach { detail ->
                addOption(
                    rawId = detail.id.ifBlank { detail.key },
                    explicitLabel = detail.name,
                    key = detail.key,
                    divisionTypeId = detail.divisionTypeId,
                    allowPlayoffDivision = true,
                )
            }
        } else {
            buildSyntheticTournamentBracketRegistrationDetails(event).forEach { detail ->
                addOption(
                    rawId = detail.id.ifBlank { detail.key },
                    explicitLabel = detail.name,
                    key = detail.key,
                    divisionTypeId = detail.divisionTypeId,
                    allowPlayoffDivision = true,
                )
            }
        }
        if (options.isNotEmpty()) {
            return options
        }
    }

    val regularDetails = event.divisionDetails
        .filterNot { detail -> detail.isTournamentPlayoffDivision() }
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

private fun buildSyntheticTournamentBracketRegistrationDetails(event: Event): List<DivisionDetail> {
    val detailsById = event.divisionDetails.associateBy { detail ->
        detail.normalizedTournamentDivisionId()
    }
    val poolDetails = mutableListOf<DivisionDetail>()
    val seenPoolIds = mutableSetOf<String>()

    fun addPoolDetail(detail: DivisionDetail) {
        val normalizedId = detail.normalizedTournamentDivisionId()
        if (normalizedId.isNotBlank() && seenPoolIds.add(normalizedId)) {
            poolDetails += detail
        }
    }

    event.divisionDetails
        .filter { detail -> detail.isGeneratedTournamentPoolDivision() }
        .forEach(::addPoolDetail)

    event.divisions.forEach { divisionId ->
        val normalizedId = divisionId.normalizeDivisionIdentifier()
        if (normalizedId.isBlank() || normalizedId in seenPoolIds) return@forEach
        val bracketDivisionId = normalizedId.inferredTournamentBracketDivisionIdFromPool() ?: return@forEach
        addPoolDetail(
            detailsById[normalizedId] ?: DivisionDetail(
                id = normalizedId,
                key = normalizedId,
                name = normalizedId.toDivisionDisplayLabel(event.divisionDetails),
                playoffPlacementDivisionIds = listOf(bracketDivisionId),
            ),
        )
    }

    val bracketDetails = linkedMapOf<String, DivisionDetail>()
    poolDetails.forEach { pool ->
        val bracketDivisionId = pool.tournamentBracketDivisionId() ?: return@forEach
        if (bracketDetails.containsKey(bracketDivisionId)) return@forEach
        val existingBracketDetail = detailsById[bracketDivisionId]
        val sourceDetail = existingBracketDetail ?: pool
        val label = existingBracketDetail?.name?.trim().orEmpty()
            .ifBlank { pool.name.stripTournamentPoolSuffix() }
            .ifBlank { pool.key.stripTournamentPoolSuffix() }
            .ifBlank { bracketDivisionId.toDivisionDisplayLabel(event.divisionDetails) }
        bracketDetails[bracketDivisionId] = sourceDetail.copy(
            id = bracketDivisionId,
            key = existingBracketDetail?.key?.ifBlank { bracketDivisionId } ?: bracketDivisionId,
            kind = "PLAYOFF",
            name = label,
            playoffPlacementDivisionIds = emptyList(),
        )
    }
    return bracketDetails.values.toList()
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
