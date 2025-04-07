package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.TeamDTO
import com.razumly.mvp.core.data.dataTypes.enums.Division
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class Team(
    val tournamentIds: List<String>,
    val eventIds: List<String>,
    val seed: Int,
    val division: Division,
    val wins: Int,
    val losses: Int,
    val name: String?,
    val captainId: String,
    val players: List<String> = emptyList(),
    val pending: List<String> = emptyList(),
    val teamSize: Int,
    @PrimaryKey override val id: String
) : MVPDocument {

    companion object {
        operator fun invoke(captainId: String): Team {
            return Team(
                tournamentIds = listOf(),
                eventIds = listOf(),
                seed = 0,
                division = Division.NOVICE,
                wins = 0,
                losses = 0,
                name = null,
                players = listOf(captainId),
                teamSize = 2,
                id = "",
                captainId = captainId
            )
        }
    }

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
            captainId = captainId,
            teamSize = teamSize,
            id = id,
            pending = pending
        )
    }
}