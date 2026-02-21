package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.TeamDTO
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION
import com.razumly.mvp.core.data.util.normalizeDivisionLabel
import com.razumly.mvp.core.util.newId
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class Team(
    val seed: Int,
    val division: String,
    val wins: Int,
    val losses: Int,
    val name: String?,
    val captainId: String,
    val managerId: String? = null,
    val headCoachId: String? = null,
    val coachIds: List<String> = emptyList(),
    val parentTeamId: String? = null,
    val playerIds: List<String> = emptyList(),
    val pending: List<String> = emptyList(),
    val teamSize: Int,
    val profileImageId: String? = null,
    val sport: String? = null,
    @PrimaryKey override val id: String
) : MVPDocument, DisplayableEntity {
    override val displayName: String get() = name ?: "Team ${playerIds.size}"
    override val imageUrl: String? get() = profileImageId
    val assistantCoachIds: List<String> get() = coachIds

    companion object {
        operator fun invoke(captainId: String): Team {
            return Team(
                seed = 0,
                division = DEFAULT_DIVISION,
                wins = 0,
                losses = 0,
                name = null,
                playerIds = listOf(captainId),
                teamSize = 2,
                id = newId(),
                captainId = captainId,
                managerId = captainId,
                headCoachId = null,
                coachIds = emptyList(),
                profileImageId = null,
                sport = null
            )
        }
    }

    fun toTeamDTO(): TeamDTO {
        return TeamDTO(
            name = name,
            seed = seed,
            division = division.normalizeDivisionLabel(),
            wins = wins,
            losses = losses,
            playerIds = playerIds,
            captainId = captainId,
            managerId = managerId,
            headCoachId = headCoachId,
            assistantCoachIds = assistantCoachIds,
            coachIds = coachIds,
            parentTeamId = parentTeamId,
            teamSize = teamSize,
            id = id,
            pending = pending,
            profileImageId = profileImageId,
            sport = sport
        )
    }
}
