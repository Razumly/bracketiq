package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.enums.Divisions
import kotlin.jvm.Transient

data class TeamDTO (
    var name: String? = null,
    var tournament: String,
    var seed: Int,
    var division: String,
    var wins: Int,
    var losses: Int,
    var players: List<String> = emptyList(),
    @Transient
    val id: String
)

fun TeamDTO.toTeam(id: String): Team {
    return Team(
        name = name,
        tournament = tournament,
        seed = seed,
        division = Divisions.valueOf(division),
        wins = wins,
        losses = losses,
        players = players,
        id = id
    )
}