package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Ignore
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.TeamDTO
import com.razumly.mvp.core.data.dataTypes.enums.Division
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Entity
@Serializable
data class Team(
    var tournamentIds: List<String>,
    val eventIds: List<String>,
    var seed: Int,
    var division: Division,
    var wins: Int,
    var losses: Int,
    var name: String? = null,
    @Ignore
    var players: List<String> = emptyList(),
    @PrimaryKey
    @Transient
    override var id: String = ""
) : MVPDocument {
    // Provide an explicit no-arg constructor for Room.
    constructor() : this(
        tournamentIds = listOf(),
        eventIds = listOf(),
        seed = 0,
        division = Division.NOVICE,
        wins = 0,
        losses = 0,
        name = null,
        players = emptyList(),
        id = ""
    )

    fun toTeamDTO(): TeamDTO {
        return TeamDTO(
            name = name,
            tournamentIds = tournamentIds,
            eventIds = eventIds,
            seed = seed,
            division = division.name,
            wins = wins,
            losses = losses,
            players = players,
            id = id
        )
    }
}