package com.razumly.mvp.core.data.dataTypes

enum class TeamInviteRole {
    PLAYER,
    MANAGER,
    HEAD_COACH,
    ASSISTANT_COACH,
    UNKNOWN,
}

fun Invite.inferTeamInviteRole(team: Team?): TeamInviteRole {
    val inviteUserId = userId?.trim()?.takeIf(String::isNotBlank) ?: return TeamInviteRole.UNKNOWN
    val resolvedTeam = team ?: return TeamInviteRole.UNKNOWN

    return when {
        resolvedTeam.pending.any { it == inviteUserId } -> TeamInviteRole.PLAYER
        resolvedTeam.managerId == inviteUserId -> TeamInviteRole.MANAGER
        resolvedTeam.headCoachId == inviteUserId -> TeamInviteRole.HEAD_COACH
        resolvedTeam.coachIds.any { it == inviteUserId } -> TeamInviteRole.ASSISTANT_COACH
        else -> TeamInviteRole.UNKNOWN
    }
}

fun TeamInviteRole.label(): String = when (this) {
    TeamInviteRole.PLAYER -> "Player"
    TeamInviteRole.MANAGER -> "Manager"
    TeamInviteRole.HEAD_COACH -> "Head Coach"
    TeamInviteRole.ASSISTANT_COACH -> "Assistant Coach"
    TeamInviteRole.UNKNOWN -> "Team Invite"
}

fun Invite.staffInviteRoleLabel(): String {
    val normalized = staffTypes
        .map { it.trim().uppercase() }
        .filter(String::isNotBlank)
        .distinct()

    if (normalized.isEmpty()) return "Staff Invite"

    return normalized.joinToString(", ") { type ->
        when (type) {
            "HOST" -> "Host"
            "REFEREE" -> "Referee"
            "STAFF" -> "Staff"
            else -> type.lowercase().replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        }
    }
}
