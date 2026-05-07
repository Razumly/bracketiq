package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType

private val tournamentPoolSuffixRegex = Regex(
    pattern = "(?:^|[\\s_-]+)pool[\\s_-]*[a-z0-9]+$",
    option = RegexOption.IGNORE_CASE,
)

private fun DivisionDetail.isPlayoffDivision(): Boolean =
    kind?.trim()?.equals("PLAYOFF", ignoreCase = true) == true

private fun String.stripTournamentPoolSuffix(): String {
    val trimmed = trim()
    val match = tournamentPoolSuffixRegex.find(trimmed) ?: return trimmed
    return trimmed.substring(0, match.range.first).trim()
}

private fun String.inferredBracketDivisionIdFromPool(): String? {
    val trimmed = trim()
    if (trimmed.isBlank()) return null
    val stripped = trimmed.stripTournamentPoolSuffix()
    return stripped.takeIf { candidate -> candidate.isNotBlank() && candidate != trimmed }
}

private fun DivisionDetail.normalizedDivisionId(): String =
    id.ifBlank { key }.normalizeDivisionIdentifier()

private fun DivisionDetail.tournamentPoolBracketDivisionId(): String? =
    playoffPlacementDivisionIds.firstNotNullOfOrNull { divisionId ->
        divisionId.normalizeDivisionIdentifier().takeIf(String::isNotBlank)
    }
        ?: id.inferredBracketDivisionIdFromPool()
        ?: key.inferredBracketDivisionIdFromPool()
        ?: name.inferredBracketDivisionIdFromPool()

private fun DivisionDetail.isGeneratedTournamentPoolDivision(): Boolean =
    !isPlayoffDivision() && tournamentPoolBracketDivisionId() != null

private fun Event.hasTournamentPoolPlayDisplayDivisions(): Boolean =
    eventType == EventType.TOURNAMENT &&
        includePlayoffs &&
        (
            divisionDetails.any { detail -> detail.isGeneratedTournamentPoolDivision() } ||
                divisions.any { division -> division.inferredBracketDivisionIdFromPool() != null }
            )

private fun List<DivisionDetail>.findByDivisionId(divisionId: String): DivisionDetail? =
    firstOrNull { detail ->
        divisionsEquivalent(detail.id, divisionId) || divisionsEquivalent(detail.key, divisionId)
    }

private fun Event.tournamentBracketDisplayDetails(): List<DivisionDetail> {
    val explicitBracketDetails = divisionDetails.filter { detail -> detail.isPlayoffDivision() }
    if (explicitBracketDetails.isNotEmpty()) {
        return explicitBracketDetails
    }

    val detailsById = divisionDetails.associateBy { detail -> detail.normalizedDivisionId() }
    val poolDetails = mutableListOf<DivisionDetail>()
    val seenPoolIds = mutableSetOf<String>()

    fun addPoolDetail(detail: DivisionDetail) {
        val normalizedId = detail.normalizedDivisionId()
        if (normalizedId.isNotBlank() && seenPoolIds.add(normalizedId)) {
            poolDetails += detail
        }
    }

    divisionDetails
        .filter { detail -> detail.isGeneratedTournamentPoolDivision() }
        .forEach(::addPoolDetail)

    divisions.forEach { divisionId ->
        val normalizedId = divisionId.normalizeDivisionIdentifier()
        if (normalizedId.isBlank() || normalizedId in seenPoolIds) return@forEach
        val bracketDivisionId = normalizedId.inferredBracketDivisionIdFromPool() ?: return@forEach
        addPoolDetail(
            detailsById[normalizedId] ?: DivisionDetail(
                id = normalizedId,
                key = normalizedId,
                name = normalizedId.toDivisionDisplayLabel(divisionDetails),
                playoffPlacementDivisionIds = listOf(bracketDivisionId),
            ),
        )
    }

    val bracketDetails = linkedMapOf<String, DivisionDetail>()
    poolDetails.forEach { pool ->
        val bracketDivisionId = pool.tournamentPoolBracketDivisionId() ?: return@forEach
        if (bracketDetails.containsKey(bracketDivisionId)) return@forEach
        val existingBracketDetail = divisionDetails.findByDivisionId(bracketDivisionId)
        val sourceDetail = existingBracketDetail ?: pool
        val label = existingBracketDetail?.name?.trim().orEmpty()
            .ifBlank { pool.name.stripTournamentPoolSuffix() }
            .ifBlank { bracketDivisionId.toDivisionDisplayLabel(divisionDetails) }
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

fun Event.divisionDisplayLabels(): List<String> {
    if (hasTournamentPoolPlayDisplayDivisions()) {
        return tournamentBracketDisplayDetails()
            .map { detail -> detail.name.ifBlank { detail.id.toDivisionDisplayLabel(divisionDetails) } }
            .map { label -> label.trim() }
            .filter(String::isNotBlank)
            .distinctBy { label -> label.lowercase() }
    }

    val playoffDivisionIds = divisionDetails
        .filter { detail -> detail.isPlayoffDivision() }
        .flatMap { detail -> listOf(detail.id, detail.key) }
        .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .toSet()

    return divisions
        .normalizeDivisionIdentifiers()
        .filterNot { divisionId -> divisionId in playoffDivisionIds }
        .map { division -> division.toDivisionDisplayLabel(divisionDetails) }
        .map { label -> label.trim() }
        .filter(String::isNotBlank)
        .distinctBy { label -> label.lowercase() }
}
