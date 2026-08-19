package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event

fun Event.resolveParticipantCapacity(): Int {
    if (divisions.isEmpty()) {
        return maxParticipants.coerceAtLeast(0)
    }

    return divisions
        .normalizeDivisionIdentifiers()
        .sumOf { divisionId ->
            divisionDetails
                .firstOrNull { detail -> detail.id.normalizeDivisionIdentifier() == divisionId }
                ?.maxParticipants
                ?.coerceAtLeast(0)
                ?: 0
    }
}

data class PlayoffDivisionPlacementCapacity(
    val playoffDivisionId: String,
    val name: String?,
    val mappedPositionCount: Int,
    val capacity: Int?,
    val sourceMappingsValid: Boolean,
) {
    val matchesCapacity: Boolean
        get() = sourceMappingsValid && capacity != null && mappedPositionCount == capacity
}

fun resolveCanonicalPlayoffPlacementSources(
    sourceDivisionIds: List<String>,
    divisionDetails: List<DivisionDetail>,
): List<DivisionDetail>? {
    if (sourceDivisionIds.isEmpty()) return null
    val normalizedSourceIds = sourceDivisionIds.map(String::normalizeDivisionIdentifier)
    if (
        normalizedSourceIds.any(String::isBlank) ||
        normalizedSourceIds.distinct().size != normalizedSourceIds.size
    ) {
        return null
    }

    return normalizedSourceIds.map { sourceDivisionId ->
        divisionDetails.singleOrNull { detail ->
            detail.kind?.trim()?.equals("PLAYOFF", ignoreCase = true) != true &&
                detail.id.normalizeDivisionIdentifier() == sourceDivisionId
        } ?: return null
    }
}

fun evaluatePlayoffDivisionPlacementCapacities(
    sourceDivisions: List<DivisionDetail>,
    playoffDivisions: List<DivisionDetail>,
): List<PlayoffDivisionPlacementCapacity> {
    val targetsById = linkedMapOf<String, DivisionDetail>()
    playoffDivisions.forEach { division ->
        val playoffDivisionId = division.id.normalizeDivisionIdentifier()
        if (playoffDivisionId.isNotBlank() && playoffDivisionId !in targetsById) {
            targetsById[playoffDivisionId] = division
        }
    }

    val mappedPositionCounts = mutableMapOf<String, Int>()
    var sourceMappingsValid = sourceDivisions.isNotEmpty()
    sourceDivisions.forEach { source ->
        val placementCount = source.playoffTeamCount
        if (placementCount == null || placementCount < 2) {
            sourceMappingsValid = false
            return@forEach
        }
        val placementDivisionIds = source.playoffPlacementDivisionIds.take(placementCount)
        if (placementDivisionIds.size != placementCount) {
            sourceMappingsValid = false
        }
        placementDivisionIds.forEach { rawPlayoffDivisionId ->
            val playoffDivisionId = rawPlayoffDivisionId.normalizeDivisionIdentifier()
            if (playoffDivisionId.isBlank() || playoffDivisionId !in targetsById) {
                sourceMappingsValid = false
            } else {
                mappedPositionCounts[playoffDivisionId] =
                    (mappedPositionCounts[playoffDivisionId] ?: 0) + 1
            }
        }
    }

    return targetsById.map { (playoffDivisionId, division) ->
        PlayoffDivisionPlacementCapacity(
            playoffDivisionId = playoffDivisionId,
            name = division.name.trim().takeIf(String::isNotBlank),
            mappedPositionCount = mappedPositionCounts[playoffDivisionId] ?: 0,
            capacity = division.maxParticipants?.takeIf { capacity -> capacity >= 0 },
            sourceMappingsValid = sourceMappingsValid,
        )
    }
}
