package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.util.isPlaceholderSlot
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
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
    val normalizedId = detail.id.normalizeDivisionIdentifier()
    if (normalizedId.isNotBlank()) return normalizedId
    return detail.key.normalizeDivisionIdentifier()
}

internal fun buildDivisionCapacitySummaries(
    event: Event,
    divisionDetails: List<DivisionDetail>,
    teams: List<TeamWithPlayers>,
): List<DivisionCapacitySummary> {
    if (!event.teamSignup || event.singleDivision || divisionDetails.isEmpty()) {
        return emptyList()
    }

    val registeredTeamIdSet = teams
        .map { teamWithPlayers -> teamWithPlayers.team }
        .filter { team -> !team.isPlaceholderSlot(event.eventType) }
        .map { team -> team.id.trim() }
        .filter(String::isNotBlank)
        .toSet()
    val assignedTeamIds = mutableSetOf<String>()

    val summaries = divisionDetails.mapNotNull { detail ->
        val divisionId = resolveDivisionIdentifier(detail)
        if (divisionId.isBlank()) return@mapNotNull null

        val divisionTeamIds = detail.teamIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .toSet()
        val filteredDivisionTeamIds = divisionTeamIds.filterTo(linkedSetOf()) { teamId -> teamId in registeredTeamIdSet }
        assignedTeamIds += filteredDivisionTeamIds

        val capacity = detail.maxParticipants?.coerceAtLeast(0) ?: 0
        val filled = filteredDivisionTeamIds.size
        if (capacity <= 0 && filled <= 0) return@mapNotNull null

        DivisionCapacitySummary(
            id = divisionId,
            label = divisionId.toDivisionDisplayLabel(divisionDetails),
            filled = filled,
            capacity = capacity,
        )
    }

    if (summaries.isEmpty()) return emptyList()

    val unresolvedTeamCount = (registeredTeamIdSet.size - assignedTeamIds.size).coerceAtLeast(0)
    return if (unresolvedTeamCount > 0) {
        summaries + DivisionCapacitySummary(
            id = "unassigned",
            label = "Unassigned",
            filled = unresolvedTeamCount,
            capacity = 0,
        )
    } else {
        summaries
    }
}
