package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.network.dto.InviteCreateDto

internal fun normalizedInviteSearchQuery(
    query: String,
    minLength: Int = 1,
): String? {
    val normalizedQuery = query.trim()
    return normalizedQuery.takeIf { it.length >= minLength }
}

internal fun resolveEventInviteOrganizationId(
    event: Event,
    relationOrganizationId: String?,
): String? {
    return event.organizationId
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?: relationOrganizationId?.trim()?.takeIf(String::isNotBlank)
}

internal fun resolveEventInviteSportName(
    event: Event,
    relationSportName: String?,
): String? {
    return relationSportName
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?: event.sportId?.trim()?.takeIf(String::isNotBlank)
}

internal fun eventParticipantTeamIdsForInviteSearch(
    event: Event,
    teams: List<TeamWithPlayers>,
): Set<String> = buildSet {
    event.teamIds
        .map(String::trim)
        .filter(String::isNotBlank)
        .forEach(::add)
    teams.forEach { teamWithPlayers ->
        val team = teamWithPlayers.team
        team.id.trim().takeIf(String::isNotBlank)?.let(::add)
        team.parentTeamId?.trim()?.takeIf(String::isNotBlank)?.let(::add)
    }
}

internal fun eventParticipantUserIdsForInviteSearch(
    event: Event,
    players: List<UserData>,
): Set<String> = buildSet {
    addAll(event.playerIds.map(String::trim).filter(String::isNotBlank))
    addAll(event.waitListIds.map(String::trim).filter(String::isNotBlank))
    addAll(event.freeAgentIds.map(String::trim).filter(String::isNotBlank))
    players
        .map { player -> player.id.trim() }
        .filter(String::isNotBlank)
        .forEach(::add)
}

internal fun buildEventPlayerInviteRequest(
    event: Event,
    organizationId: String?,
    userId: String?,
    email: String?,
    firstName: String?,
    lastName: String?,
    createdBy: String?,
): Result<InviteCreateDto> {
    val eventId = event.id.trim()
    if (eventId.isBlank()) {
        return Result.failure(IllegalArgumentException("Event id is required."))
    }

    return Result.success(
        InviteCreateDto(
            type = "EVENT",
            status = "PENDING",
            eventId = eventId,
            organizationId = organizationId?.trim()?.takeIf(String::isNotBlank),
            userId = userId?.trim()?.takeIf(String::isNotBlank),
            email = email?.trim()?.lowercase()?.takeIf(String::isNotBlank),
            firstName = firstName?.trim()?.takeIf(String::isNotBlank),
            lastName = lastName?.trim()?.takeIf(String::isNotBlank),
            createdBy = createdBy?.trim()?.takeIf(String::isNotBlank),
        ),
    )
}
