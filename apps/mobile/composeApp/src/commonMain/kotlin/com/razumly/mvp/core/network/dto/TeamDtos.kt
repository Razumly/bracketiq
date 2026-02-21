package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION
import com.razumly.mvp.core.data.util.normalizeDivisionLabel
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class TeamApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val name: String? = null,
    val seed: Int? = null,
    val division: String? = null,
    val wins: Int? = null,
    val losses: Int? = null,
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
) {
    fun toTeamOrNull(): Team? {
        val resolvedId = id ?: legacyId
        val resolvedCaptainId = captainId
        if (resolvedId.isNullOrBlank() || resolvedCaptainId.isNullOrBlank()) return null

        val resolvedTeamSize = (teamSize ?: 0).takeIf { it > 0 } ?: 2

        return Team(
            seed = seed ?: 0,
            division = (division ?: DEFAULT_DIVISION).normalizeDivisionLabel(),
            wins = wins ?: 0,
            losses = losses ?: 0,
            name = name,
            captainId = resolvedCaptainId,
            managerId = managerId ?: resolvedCaptainId,
            headCoachId = headCoachId,
            coachIds = assistantCoachIds ?: coachIds ?: emptyList(),
            parentTeamId = parentTeamId,
            playerIds = playerIds ?: emptyList(),
            pending = pending ?: emptyList(),
            teamSize = resolvedTeamSize,
            profileImageId = profileImageId,
            sport = sport,
            id = resolvedId,
        )
    }
}

@Serializable
data class TeamsResponseDto(
    val teams: List<TeamApiDto> = emptyList(),
)

@Serializable
data class TeamUpdateDto(
    val name: String? = null,
    val seed: Int? = null,
    val division: String? = null,
    val wins: Int? = null,
    val losses: Int? = null,
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
)

@Serializable
data class UpdateTeamRequestDto(
    val team: TeamUpdateDto,
)

fun Team.toUpdateDto(): TeamUpdateDto {
    return TeamUpdateDto(
        name = name,
        seed = seed,
        division = division,
        wins = wins,
        losses = losses,
        playerIds = playerIds,
        captainId = captainId,
        managerId = managerId,
        headCoachId = headCoachId,
        assistantCoachIds = assistantCoachIds,
        coachIds = coachIds,
        parentTeamId = parentTeamId,
        pending = pending,
        teamSize = teamSize,
        profileImageId = profileImageId,
        sport = sport,
    )
}
