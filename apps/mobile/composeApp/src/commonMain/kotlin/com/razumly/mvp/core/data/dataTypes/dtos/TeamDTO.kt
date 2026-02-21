package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.util.normalizeDivisionLabel
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class TeamDTO (
    var name: String?,
    var seed: Int,
    var division: String,
    var wins: Int,
    var losses: Int,
    val playerIds: List<String> = emptyList(),
    val captainId: String,
    val managerId: String? = null,
    val headCoachId: String? = null,
    val assistantCoachIds: List<String> = emptyList(),
    val coachIds: List<String> = emptyList(),
    val parentTeamId: String? = null,
    val pending: List<String> = emptyList(),
    val teamSize: Int,
    val profileImageId: String? = null,
    val sport: String? = null,
    @Transient
    val id: String = ""
)

fun TeamDTO.toTeam(id: String): Team {
    return Team(
        name = name,
        seed = seed,
        division = division.normalizeDivisionLabel(),
        wins = wins,
        losses = losses,
        playerIds = playerIds,
        captainId = captainId,
        managerId = managerId,
        headCoachId = headCoachId,
        coachIds = if (assistantCoachIds.isNotEmpty()) assistantCoachIds else coachIds,
        parentTeamId = parentTeamId,
        pending = pending,
        teamSize = teamSize,
        id = id,
        profileImageId = profileImageId,
        sport = sport
    )
}
