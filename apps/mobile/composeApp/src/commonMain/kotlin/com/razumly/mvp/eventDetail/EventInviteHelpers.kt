package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.network.dto.InviteCreateDto

internal data class ParticipantMutationPreflight(
    val normalizedId: String,
    val errorMessage: String? = null,
) {
    val isAccepted: Boolean
        get() = errorMessage == null
}

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

internal fun inviteTeamToEventPreflight(
    team: Team,
    event: Event,
    existingTeamIds: Set<String>,
): ParticipantMutationPreflight {
    val normalizedTeamId = team.id.trim()
    if (normalizedTeamId.isBlank()) {
        return ParticipantMutationPreflight(
            normalizedId = normalizedTeamId,
            errorMessage = "Team id is required.",
        )
    }
    if (!event.teamSignup) {
        return ParticipantMutationPreflight(
            normalizedId = normalizedTeamId,
            errorMessage = "This event accepts individual players, not teams.",
        )
    }
    if (existingTeamIds.contains(normalizedTeamId)) {
        return ParticipantMutationPreflight(
            normalizedId = normalizedTeamId,
            errorMessage = "${team.name.ifBlank { "Team" }} is already in this event.",
        )
    }
    return ParticipantMutationPreflight(normalizedId = normalizedTeamId)
}

internal fun invitePlayerToEventPreflight(
    user: UserData,
    event: Event,
    existingUserIds: Set<String>,
): ParticipantMutationPreflight {
    val normalizedUserId = user.id.trim()
    if (normalizedUserId.isBlank()) {
        return ParticipantMutationPreflight(
            normalizedId = normalizedUserId,
            errorMessage = "User id is required.",
        )
    }
    if (event.teamSignup) {
        return ParticipantMutationPreflight(
            normalizedId = normalizedUserId,
            errorMessage = "This event accepts teams, not individual players.",
        )
    }
    if (existingUserIds.contains(normalizedUserId)) {
        return ParticipantMutationPreflight(
            normalizedId = normalizedUserId,
            errorMessage = "${user.fullName.ifBlank { "Player" }} is already in this event.",
        )
    }
    return ParticipantMutationPreflight(normalizedId = normalizedUserId)
}

internal fun removeUserParticipantPreflight(userId: String): ParticipantMutationPreflight {
    val normalizedUserId = userId.trim()
    if (normalizedUserId.isBlank()) {
        return ParticipantMutationPreflight(
            normalizedId = normalizedUserId,
            errorMessage = "User id is required.",
        )
    }
    return ParticipantMutationPreflight(normalizedId = normalizedUserId)
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
