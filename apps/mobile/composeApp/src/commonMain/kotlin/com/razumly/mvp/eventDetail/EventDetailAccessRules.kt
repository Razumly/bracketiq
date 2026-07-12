package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.canManageEventsForViewer
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier

internal fun canEditEventDetails(targetEvent: Event): Boolean {
    return mobileEventEditUnsupportedFeatures(targetEvent).isEmpty()
}

internal fun canManageEventForUser(
    event: Event,
    user: UserData,
    organization: Organization?,
    isPlatformAdmin: Boolean = false,
): Boolean {
    val currentUserId = user.id.trim()
    if (currentUserId.isBlank()) {
        return false
    }
    return isPlatformAdmin ||
        event.hostId.trim() == currentUserId ||
        event.assistantHostIds.any { assistantHostId -> assistantHostId.trim() == currentUserId } ||
        organization?.canManageEventsForViewer(currentUserId) == true
}

internal fun Iterable<String>.normalizedTeamIds(): List<String> =
    map(String::trim).filter(String::isNotBlank).distinct()

internal fun Event.playoffPlacementDivisionIdsNormalized(): Set<String> {
    val mappedPlayoffIds = divisionDetails
        .flatMap { detail -> detail.playoffPlacementDivisionIds }
        .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .toMutableSet()

    divisionDetails
        .filter { detail -> detail.isTournamentPlayoffDivision() }
        .map { detail -> detail.normalizedTournamentDivisionId() }
        .filter(String::isNotBlank)
        .forEach { divisionId -> mappedPlayoffIds += divisionId }

    inferredTournamentBracketDivisionIds()
        .filter(String::isNotBlank)
        .forEach { divisionId -> mappedPlayoffIds += divisionId }

    return mappedPlayoffIds
}

internal fun Event.isPlayoffPlacementDivision(divisionId: String?): Boolean {
    val normalizedDivisionId = divisionId
        ?.normalizeDivisionIdentifier()
        ?.takeIf(String::isNotBlank)
        ?: return false
    return normalizedDivisionId in playoffPlacementDivisionIdsNormalized()
}

internal fun Event.resolveDefaultSelectedDivisionId(): String? {
    val normalizedDivisions = divisions
        .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
    if (normalizedDivisions.isEmpty()) return null
    if (eventType != EventType.LEAGUE) return normalizedDivisions.firstOrNull()

    val playoffIds = playoffPlacementDivisionIdsNormalized()
    return normalizedDivisions.firstOrNull { divisionId -> divisionId !in playoffIds }
        ?: normalizedDivisions.firstOrNull()
}
