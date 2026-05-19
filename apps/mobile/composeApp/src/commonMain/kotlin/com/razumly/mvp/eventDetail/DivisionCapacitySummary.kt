package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
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

private fun Team.exactDivisionIdentifier(): String =
    division.normalizeDivisionIdentifier()

private fun DivisionDetail.exactDivisionIdentifier(): String =
    id.normalizeDivisionIdentifier()

private fun Team.matchesExactEventDivision(detail: DivisionDetail): Boolean {
    val exactDivision = exactDivisionIdentifier()
    val detailDivision = detail.exactDivisionIdentifier()
    return exactDivision.isNotBlank() &&
        detailDivision.isNotBlank() &&
        exactDivision == detailDivision
}

internal fun Team.matchesEventDivision(detail: DivisionDetail): Boolean {
    return matchesExactEventDivision(detail)
}

private fun DivisionCapacityTarget.matchesExactTeamDivision(team: Team): Boolean =
    matchDetails.any { detail -> team.matchesExactEventDivision(detail) } ||
        team.matchesExactEventDivision(detail)

internal fun buildDivisionCapacitySummaries(
    event: Event,
    divisionDetails: List<DivisionDetail>,
    teams: List<TeamWithPlayers>,
): List<DivisionCapacitySummary> {
    if (!event.teamSignup || event.singleDivision || divisionDetails.isEmpty()) {
        return emptyList()
    }

    val loadedTeams = event.visibleTeams(teams)
        .map { teamWithPlayers -> teamWithPlayers.team }
        .filter { team -> team.id.trim().isNotBlank() }
        .distinctBy { team -> team.id.trim() }
    val capacityTargets = buildDivisionCapacityTargets(event, divisionDetails)
    val teamCountsByDivision = mutableMapOf<String, Int>()
    var unassignedTeamCount = 0

    loadedTeams.forEach { team ->
        val matchingTarget = capacityTargets.firstOrNull { target ->
            target.matchesExactTeamDivision(team)
        }
        if (matchingTarget == null) {
            unassignedTeamCount += 1
        } else {
            val divisionId = resolveDivisionIdentifier(matchingTarget.detail)
            if (divisionId.isBlank()) {
                unassignedTeamCount += 1
            } else {
                teamCountsByDivision[divisionId] = (teamCountsByDivision[divisionId] ?: 0) + 1
            }
        }
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
