package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.enums.Division
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
    val pending: List<String> = emptyList(),
    val teamSize: Int,
    @Transient
    val id: String = ""
)

fun TeamDTO.toTeam(id: String): Team {
    return Team(
        name = name,
        seed = seed,
        division = Division.valueOf(division),
        wins = wins,
        losses = losses,
        playerIds = playerIds,
        captainId = captainId,
        pending = pending,
        teamSize = teamSize,
        id = id
    )
}