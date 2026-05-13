package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.divisionsEquivalent
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionDetails
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier

private val tournamentPoolSuffixRegex = Regex(
    pattern = "(?:^|[\\s_-]+)pool[\\s_-]*[a-z0-9]+$",
    option = RegexOption.IGNORE_CASE,
)

internal fun String.stripTournamentPoolSuffix(): String {
    val trimmed = trim()
    val match = tournamentPoolSuffixRegex.find(trimmed) ?: return trimmed
    return trimmed.substring(0, match.range.first).trim()
}

internal fun String.inferredTournamentBracketDivisionIdFromPool(): String? {
    val normalized = normalizeDivisionIdentifier()
    if (normalized.isBlank()) return null
    val stripped = normalized.stripTournamentPoolSuffix()
        .trim('_', '-', ' ')
        .normalizeDivisionIdentifier()
    return stripped
        .takeIf { it.isNotBlank() && it != normalized }
}

internal fun DivisionDetail.normalizedTournamentDivisionId(): String =
    id.ifBlank { key }.normalizeDivisionIdentifier()

internal fun DivisionDetail.isTournamentPlayoffDivision(): Boolean =
    kind?.trim()?.equals("PLAYOFF", ignoreCase = true) == true

internal fun DivisionDetail.tournamentBracketDivisionId(): String? =
    playoffPlacementDivisionIds
        .firstNotNullOfOrNull { divisionId ->
            divisionId.normalizeDivisionIdentifier().takeIf(String::isNotBlank)
        }
        ?: id.inferredTournamentBracketDivisionIdFromPool()
        ?: key.inferredTournamentBracketDivisionIdFromPool()
        ?: name.inferredTournamentBracketDivisionIdFromPool()

internal fun DivisionDetail.isGeneratedTournamentPoolDivision(): Boolean =
    !isTournamentPlayoffDivision() && tournamentBracketDivisionId() != null

internal fun Event.inferredTournamentBracketDivisionIds(): Set<String> = buildSet {
    divisionDetails
        .filter { detail -> detail.isTournamentPlayoffDivision() }
        .map { detail -> detail.normalizedTournamentDivisionId() }
        .filter(String::isNotBlank)
        .forEach(::add)

    divisionDetails
        .mapNotNull { detail -> detail.tournamentBracketDivisionId() }
        .filter(String::isNotBlank)
        .forEach(::add)

    divisions
        .mapNotNull { divisionId -> divisionId.inferredTournamentBracketDivisionIdFromPool() }
        .filter(String::isNotBlank)
        .forEach(::add)
}

internal fun Event.isTournamentPoolPlayEnabled(): Boolean =
    eventType == EventType.TOURNAMENT &&
        (includePlayoffs || inferredTournamentBracketDivisionIds().isNotEmpty())

internal fun derivePoolTeamCount(
    maxTeams: Int?,
    poolCount: Int?,
): Int? {
    val normalizedMaxTeams = maxTeams?.takeIf { it >= 2 } ?: return null
    val normalizedPoolCount = poolCount?.takeIf { it >= 1 } ?: return null
    return if (normalizedMaxTeams % normalizedPoolCount == 0) {
        normalizedMaxTeams / normalizedPoolCount
    } else {
        null
    }
}

internal fun DivisionDetail.withDerivedTournamentPoolTeamCount(enabled: Boolean): DivisionDetail {
    if (!enabled) {
        return copy(
            poolCount = null,
            poolTeamCount = null,
        )
    }
    return copy(
        poolTeamCount = derivePoolTeamCount(
            maxTeams = maxParticipants,
            poolCount = poolCount,
        ),
    )
}

internal fun isTournamentPoolDivisionValid(detail: DivisionDetail): Boolean {
    val maxTeams = detail.maxParticipants ?: return false
    val poolCount = detail.poolCount ?: return false
    val bracketTeamCount = detail.playoffTeamCount ?: return false
    return maxTeams >= 2 &&
        poolCount >= 1 &&
        bracketTeamCount >= 2 &&
        maxTeams % poolCount == 0 &&
        bracketTeamCount % poolCount == 0
}

internal fun Event.divisionDetailsForEventSettings(): List<DivisionDetail> {
    val mergedDetails = mergeDivisionDetailsForDivisions(
        divisions = divisions,
        existingDetails = divisionDetails,
        eventId = id,
    )
    if (!isTournamentPoolPlayEnabled()) {
        return mergedDetails
    }

    val allDetails = divisionDetails.normalizeDivisionDetails(id)
    val explicitBracketDetails = allDetails.filter(DivisionDetail::isTournamentPlayoffDivision)
    if (explicitBracketDetails.isNotEmpty()) {
        return explicitBracketDetails
    }

    val nonPoolDetails = mergedDetails.filterNot(DivisionDetail::isGeneratedTournamentPoolDivision)
    if (nonPoolDetails.isNotEmpty()) {
        return nonPoolDetails
    }

    return synthesizeTournamentBracketDetailsFromPools(allDetails).ifEmpty { mergedDetails }
}

private fun synthesizeTournamentBracketDetailsFromPools(details: List<DivisionDetail>): List<DivisionDetail> {
    val poolsByBracket = details
        .filter(DivisionDetail::isGeneratedTournamentPoolDivision)
        .groupBy { detail -> detail.tournamentBracketDivisionId().orEmpty() }
        .filterKeys(String::isNotBlank)
    if (poolsByBracket.isEmpty()) return emptyList()

    return poolsByBracket.map { (bracketDivisionId, poolDetails) ->
        val firstPool = poolDetails.first()
        val poolTeamCounts = poolDetails.mapNotNull(DivisionDetail::maxParticipants).distinct()
        val advancingTeamCount = poolDetails.sumOf { pool ->
            pool.playoffTeamCount ?: pool.playoffPlacementDivisionIds.count { placementId ->
                divisionsEquivalent(placementId, bracketDivisionId)
            }
        }.takeIf { count -> count > 0 }
        firstPool.copy(
            id = bracketDivisionId,
            key = bracketDivisionId,
            name = firstPool.name.stripTournamentPoolSuffix().ifBlank { bracketDivisionId },
            kind = "PLAYOFF",
            maxParticipants = poolTeamCounts.singleOrNull()?.let { poolTeamCount -> poolTeamCount * poolDetails.size },
            playoffTeamCount = advancingTeamCount,
            poolCount = poolDetails.size,
            poolTeamCount = poolTeamCounts.singleOrNull(),
            playoffPlacementDivisionIds = emptyList(),
            fieldIds = emptyList(),
            teamIds = emptyList(),
        )
    }
}
