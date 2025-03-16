package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.enums.Division
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class TeamDTO (
    var name: String? = null,
    var tournamentIds: List<String>,
    val eventIds: List<String>,
    var seed: Int,
    var division: String,
    var wins: Int,
    var losses: Int,
    var players: List<String> = emptyList(),
    @Transient
    val id: String = ""
)

fun TeamDTO.toTeam(id: String): Team {
    return Team(
        name = name,
        tournament = tournamentIds,
        eventIds = eventIds,
        seed = seed,
        division = Division.valueOf(division),
        wins = wins,
        losses = losses,
        players = players,
        id = id
    )
}