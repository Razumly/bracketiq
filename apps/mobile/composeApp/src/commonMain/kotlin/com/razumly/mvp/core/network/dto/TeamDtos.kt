package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.TeamStaffAssignment
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION
import com.razumly.mvp.core.data.util.normalizeDivisionLabel
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class TeamPlayerRegistrationApiDto(
    val id: String? = null,
    val teamId: String? = null,
    val userId: String? = null,
    val status: String? = null,
    val jerseyNumber: String? = null,
    val position: String? = null,
    val isCaptain: Boolean? = null,
)

@Serializable
data class TeamStaffAssignmentApiDto(
    val id: String? = null,
    val teamId: String? = null,
    val userId: String? = null,
    val role: String? = null,
    val status: String? = null,
)

@Serializable
data class TeamApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val name: String = "",
    val kind: String? = null,
    val division: String? = null,
    val playerIds: List<String>? = null,
    val playerRegistrationIds: List<String>? = null,
    val captainId: String? = null,
    val managerId: String? = null,
    val headCoachId: String? = null,
    val assistantCoachIds: List<String>? = null,
    val coachIds: List<String>? = null,
    val staffAssignmentIds: List<String>? = null,
    val parentTeamId: String? = null,
    val pending: List<String>? = null,
    val teamSize: Int? = null,
    val profileImageId: String? = null,
    val sport: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeName: String? = null,
    val skillDivisionTypeId: String? = null,
    val skillDivisionTypeName: String? = null,
    val ageDivisionTypeId: String? = null,
    val ageDivisionTypeName: String? = null,
    val divisionGender: String? = null,
    val organizationId: String? = null,
    val createdBy: String? = null,
    val openRegistration: Boolean? = null,
    val registrationPriceCents: Int? = null,
    val playerRegistrations: List<TeamPlayerRegistrationApiDto>? = null,
    val staffAssignments: List<TeamStaffAssignmentApiDto>? = null,
) {
    fun toTeamOrNull(): Team? {
        val resolvedId = id ?: legacyId
        if (resolvedId.isNullOrBlank()) return null

        val resolvedTeamSize = (teamSize ?: 0).takeIf { it > 0 } ?: 2
        val resolvedPlayerRegistrations = playerRegistrations
            ?.mapNotNull { registration ->
                val userId = registration.userId?.trim()?.takeIf(String::isNotBlank) ?: return@mapNotNull null
                TeamPlayerRegistration(
                    id = registration.id?.trim().orEmpty(),
                    teamId = registration.teamId?.trim()?.takeIf(String::isNotBlank),
                    userId = userId,
                    status = registration.status?.trim().orEmpty(),
                    jerseyNumber = registration.jerseyNumber?.trim()?.takeIf(String::isNotBlank),
                    position = registration.position?.trim()?.takeIf(String::isNotBlank),
                    isCaptain = registration.isCaptain == true,
                )
            }
            .orEmpty()
        val resolvedStaffAssignments = staffAssignments
            ?.mapNotNull { assignment ->
                val userId = assignment.userId?.trim()?.takeIf(String::isNotBlank) ?: return@mapNotNull null
                TeamStaffAssignment(
                    id = assignment.id?.trim().orEmpty(),
                    teamId = assignment.teamId?.trim()?.takeIf(String::isNotBlank),
                    userId = userId,
                    role = assignment.role?.trim().orEmpty(),
                    status = assignment.status?.trim().orEmpty(),
                )
            }
            .orEmpty()

        return Team(
            division = (division ?: DEFAULT_DIVISION).normalizeDivisionLabel(),
            name = name,
            kind = kind?.trim()?.takeIf(String::isNotBlank),
            captainId = captainId?.trim().orEmpty(),
            managerId = managerId?.trim()?.takeIf(String::isNotBlank),
            headCoachId = headCoachId,
            coachIds = assistantCoachIds ?: coachIds ?: emptyList(),
            parentTeamId = parentTeamId,
            playerIds = playerIds ?: emptyList(),
            playerRegistrationIds = playerRegistrationIds ?: emptyList(),
            pending = pending ?: emptyList(),
            staffAssignmentIds = staffAssignmentIds ?: emptyList(),
            teamSize = resolvedTeamSize,
            profileImageId = profileImageId,
            sport = sport,
            divisionTypeId = divisionTypeId,
            divisionTypeName = divisionTypeName,
            skillDivisionTypeId = skillDivisionTypeId,
            skillDivisionTypeName = skillDivisionTypeName,
            ageDivisionTypeId = ageDivisionTypeId,
            ageDivisionTypeName = ageDivisionTypeName,
            divisionGender = divisionGender,
            organizationId = organizationId?.trim()?.takeIf(String::isNotBlank),
            createdBy = createdBy?.trim()?.takeIf(String::isNotBlank),
            openRegistration = openRegistration == true,
            registrationPriceCents = (registrationPriceCents ?: 0).coerceAtLeast(0),
            playerRegistrations = resolvedPlayerRegistrations,
            staffAssignments = resolvedStaffAssignments,
            id = resolvedId,
        ).withSynchronizedMembership()
    }
}

@Serializable
data class TeamsResponseDto(
    val teams: List<TeamApiDto> = emptyList(),
)

@Serializable
data class TeamInviteFreeAgentsResponseDto(
    val users: List<UserProfileDto> = emptyList(),
    val eventIds: List<String> = emptyList(),
    val freeAgentIds: List<String> = emptyList(),
)

@Serializable
data class TeamRegistrationResponseDto(
    val registrationId: String? = null,
    val status: String? = null,
    val left: Boolean? = null,
    val team: TeamApiDto? = null,
    val error: String? = null,
)

@Serializable
data class TeamUpdateDto(
    val name: String? = null,
    val division: String? = null,
    val playerIds: List<String>? = null,
    val captainId: String? = null,
    val managerId: String? = null,
    val headCoachId: String? = null,
    val assistantCoachIds: List<String>? = null,
    val coachIds: List<String>? = null,
    val parentTeamId: String? = null,
    val pending: List<String>? = null,
    val teamSize: Int? = null,
    val profileImageId: String? = null,
    val sport: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeName: String? = null,
    val openRegistration: Boolean? = null,
    val registrationPriceCents: Int? = null,
    val playerRegistrations: List<TeamPlayerRegistrationApiDto>? = null,
)

@Serializable
data class UpdateTeamRequestDto(
    val team: TeamUpdateDto,
)

private fun normalizeJerseyNumber(value: String?): String? =
    value
        .orEmpty()
        .filter(Char::isDigit)
        .take(3)
        .takeIf(String::isNotBlank)

fun Team.toUpdateDto(): TeamUpdateDto {
    val synced = withSynchronizedMembership()
    return TeamUpdateDto(
        name = synced.name,
        division = synced.division,
        playerIds = synced.playerIds,
        captainId = synced.captainId,
        managerId = synced.managerId,
        headCoachId = synced.headCoachId,
        assistantCoachIds = synced.assistantCoachIds,
        coachIds = synced.coachIds,
        parentTeamId = synced.parentTeamId,
        pending = synced.pending,
        teamSize = synced.teamSize,
        profileImageId = synced.profileImageId,
        sport = synced.sport,
        divisionTypeId = synced.divisionTypeId,
        divisionTypeName = synced.divisionTypeName,
        openRegistration = synced.openRegistration,
        registrationPriceCents = synced.registrationPriceCents.coerceAtLeast(0),
        playerRegistrations = synced.playerRegistrations.map { registration ->
            TeamPlayerRegistrationApiDto(
                id = registration.id,
                teamId = registration.teamId,
                userId = registration.userId,
                status = registration.status,
                jerseyNumber = normalizeJerseyNumber(registration.jerseyNumber),
                position = registration.position,
                isCaptain = registration.isCaptain,
            )
        },
    )
}
