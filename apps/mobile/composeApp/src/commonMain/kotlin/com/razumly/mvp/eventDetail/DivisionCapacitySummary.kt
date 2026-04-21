package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeId
import com.razumly.mvp.core.data.util.buildGenderSkillAgeDivisionToken
import com.razumly.mvp.core.data.util.divisionsEquivalent
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

private fun Team.divisionCandidates(): List<String> = buildList {
    division.normalizeDivisionIdentifier().takeIf(String::isNotBlank)?.let(::add)
    divisionTypeId?.normalizeDivisionIdentifier()?.takeIf(String::isNotBlank)?.let(::add)

    val skillDivisionId = skillDivisionTypeId
        ?.normalizeDivisionIdentifier()
        ?.takeIf(String::isNotBlank)
    val ageDivisionId = ageDivisionTypeId
        ?.normalizeDivisionIdentifier()
        ?.takeIf(String::isNotBlank)
    if (skillDivisionId != null && ageDivisionId != null) {
        add(
            buildCombinedDivisionTypeId(
                skillDivisionTypeId = skillDivisionId,
                ageDivisionTypeId = ageDivisionId,
            ),
        )
        add(
            buildGenderSkillAgeDivisionToken(
                gender = divisionGender.orEmpty(),
                skillDivisionTypeId = skillDivisionId,
                ageDivisionTypeId = ageDivisionId,
            ),
        )
    }
}.distinct()

private fun DivisionDetail.divisionCandidates(): List<String> = buildList {
    id.normalizeDivisionIdentifier().takeIf(String::isNotBlank)?.let(::add)
    key.normalizeDivisionIdentifier().takeIf(String::isNotBlank)?.let(::add)
    divisionTypeId.normalizeDivisionIdentifier().takeIf(String::isNotBlank)?.let(::add)

    val skillDivisionId = skillDivisionTypeId.normalizeDivisionIdentifier().takeIf(String::isNotBlank)
    val ageDivisionId = ageDivisionTypeId.normalizeDivisionIdentifier().takeIf(String::isNotBlank)
    if (skillDivisionId != null && ageDivisionId != null) {
        add(
            buildCombinedDivisionTypeId(
                skillDivisionTypeId = skillDivisionId,
                ageDivisionTypeId = ageDivisionId,
            ),
        )
        add(
            buildGenderSkillAgeDivisionToken(
                gender = gender,
                skillDivisionTypeId = skillDivisionId,
                ageDivisionTypeId = ageDivisionId,
            ),
        )
    }
}.distinct()

internal fun Team.matchesEventDivision(detail: DivisionDetail): Boolean {
    val teamCandidates = divisionCandidates()
    val divisionCandidates = detail.divisionCandidates()
    return teamCandidates.any { teamCandidate ->
        divisionCandidates.any { divisionCandidate ->
            divisionsEquivalent(teamCandidate, divisionCandidate)
        }
    }
}

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
    val teamCountsByDivision = mutableMapOf<String, Int>()
    var unassignedTeamCount = 0

    loadedTeams.forEach { team ->
        val matchingDivision = divisionDetails.firstOrNull { detail -> team.matchesEventDivision(detail) }
        if (matchingDivision == null) {
            unassignedTeamCount += 1
        } else {
            val divisionId = resolveDivisionIdentifier(matchingDivision)
            if (divisionId.isBlank()) {
                unassignedTeamCount += 1
            } else {
                teamCountsByDivision[divisionId] = (teamCountsByDivision[divisionId] ?: 0) + 1
            }
        }
    }

    val summaries = divisionDetails.mapNotNull { detail ->
        val divisionId = resolveDivisionIdentifier(detail)
        if (divisionId.isBlank()) return@mapNotNull null

        val capacity = detail.maxParticipants?.coerceAtLeast(0) ?: 0
        val filled = teamCountsByDivision[divisionId] ?: 0
        if (capacity <= 0 && filled <= 0) return@mapNotNull null

        DivisionCapacitySummary(
            id = divisionId,
            label = divisionId.toDivisionDisplayLabel(divisionDetails),
            filled = filled,
            capacity = capacity,
        )
    }

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
