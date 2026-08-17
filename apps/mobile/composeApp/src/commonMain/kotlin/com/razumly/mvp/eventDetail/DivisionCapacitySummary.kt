package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel

internal data class DivisionCapacitySummary(
    val id: String,
    val label: String,
    val filled: Int,
    val capacity: Int,
) {
    val left: Int
        get() = if (capacity > 0) {
            (capacity - filled).coerceAtLeast(0)
        } else {
            0
        }

    val progress: Float
        get() = if (capacity > 0) {
            (filled.toFloat() / capacity.toFloat()).coerceIn(0f, 1f)
        } else {
            0f
        }
}

private fun resolveDivisionIdentifier(detail: DivisionDetail): String {
    return detail.id.normalizeDivisionIdentifier()
}

private data class DivisionCapacityTarget(
    val detail: DivisionDetail,
    val matchDetails: List<DivisionDetail>,
)

private fun Event.usesTournamentPoolCapacityTargets(divisionDetails: List<DivisionDetail>): Boolean =
    isTournamentPoolPlayEnabled() &&
        divisionDetails.any { detail -> detail.isGeneratedTournamentPoolDivision() }

private fun List<DivisionDetail>.unionTeamIds(): List<String> =
    flatMap { detail -> detail.teamIds }
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()

private fun buildSyntheticBracketTarget(
    bracketDivisionId: String,
    poolDetails: List<DivisionDetail>,
): DivisionCapacityTarget? {
    if (bracketDivisionId.isBlank() || poolDetails.isEmpty()) return null

    val firstPool = poolDetails.first()
    val capacity = poolDetails.sumOf { detail -> detail.maxParticipants?.coerceAtLeast(0) ?: 0 }
    val label = firstPool.name.stripTournamentPoolSuffix()
        .ifBlank { bracketDivisionId.toDivisionDisplayLabel(poolDetails) }

    return DivisionCapacityTarget(
        detail = firstPool.copy(
            id = bracketDivisionId,
            key = bracketDivisionId,
            kind = "PLAYOFF",
            name = label,
            maxParticipants = capacity,
            teamIds = poolDetails.unionTeamIds(),
            playoffPlacementDivisionIds = emptyList(),
        ),
        matchDetails = poolDetails,
    )
}

private fun buildDivisionCapacityTargets(
    event: Event,
    divisionDetails: List<DivisionDetail>,
): List<DivisionCapacityTarget> {
    if (!event.usesTournamentPoolCapacityTargets(divisionDetails)) {
        val eventDivisionIds = event.divisions.normalizeDivisionIdentifiers()
        val details = if (eventDivisionIds.isNotEmpty()) {
            eventDivisionIds.map { divisionId ->
                divisionDetails.findCapacityDetailByDivisionId(divisionId)
                    ?: DivisionDetail(
                        id = divisionId,
                        key = divisionId,
                        name = divisionId.toDivisionDisplayLabel(divisionDetails),
                    )
            }
        } else {
            divisionDetails.filterNot(DivisionDetail::isTournamentPlayoffDivision)
        }
        return details.map { detail ->
            DivisionCapacityTarget(detail = detail, matchDetails = listOf(detail))
        }
    }

    return divisionDetails
        .filter { detail -> detail.isGeneratedTournamentPoolDivision() }
        .groupBy { detail ->
            detail.tournamentBracketDivisionId()
                .orEmpty()
        }
        .mapNotNull { (bracketDivisionId, poolDetails) ->
            buildSyntheticBracketTarget(bracketDivisionId, poolDetails)
        }
}

private fun List<DivisionDetail>.findCapacityDetailByDivisionId(divisionId: String): DivisionDetail? {
    val normalizedDivisionId = divisionId.normalizeDivisionIdentifier()
    if (normalizedDivisionId.isBlank()) return null
    return filter { detail ->
        detail.id.normalizeDivisionIdentifier() == normalizedDivisionId
    }.singleOrNull()
}

private fun DivisionCapacityTarget.registeredTeamIds(
    registeredTeamIds: Set<String>,
): Set<String> =
    (matchDetails + detail)
        .flatMap { detail -> detail.teamIds }
        .map(String::trim)
        .filter(String::isNotBlank)
        .filter(registeredTeamIds::contains)
        .toSet()

internal fun buildDivisionCapacitySummaries(
    event: Event,
    divisionDetails: List<DivisionDetail>,
): List<DivisionCapacitySummary> {
    if (!event.teamSignup || event.singleDivision || divisionDetails.isEmpty()) {
        return emptyList()
    }

    val registeredTeamIds = event.registeredTeamIdsForCapacity().toSet()
    val capacityTargets = buildDivisionCapacityTargets(event, divisionDetails)
    val teamCountsByDivision = mutableMapOf<String, Int>()
    val assignedTeamIds = mutableSetOf<String>()

    capacityTargets.forEach { target ->
        val divisionId = resolveDivisionIdentifier(target.detail)
        if (divisionId.isBlank()) {
            return@forEach
        }
        val targetTeamIds = target.registeredTeamIds(registeredTeamIds)
        assignedTeamIds += targetTeamIds
        teamCountsByDivision[divisionId] = targetTeamIds.size
    }

    val capacityDetails = capacityTargets.map { target -> target.detail }
    val summaries = capacityTargets.mapNotNull { target ->
        val detail = target.detail
        val divisionId = resolveDivisionIdentifier(detail)
        if (divisionId.isBlank()) return@mapNotNull null

        val capacity = detail.maxParticipants?.coerceAtLeast(0) ?: 0
        val filled = teamCountsByDivision[divisionId] ?: 0
        if (capacity <= 0 && filled <= 0) return@mapNotNull null

        DivisionCapacitySummary(
            id = divisionId,
            label = divisionId.toDivisionDisplayLabel(capacityDetails),
            filled = filled,
            capacity = capacity,
        )
    }.sortedBy { summary -> summary.label.lowercase() }

    if (summaries.isEmpty()) return emptyList()

    val unassignedTeamCount = (registeredTeamIds - assignedTeamIds).size
    return if (unassignedTeamCount > 0) {
        summaries + DivisionCapacitySummary(
            id = "unassigned",
            label = "Unassigned",
            filled = unassignedTeamCount,
            capacity = 0,
        )
    } else {
        summaries
    }
}
