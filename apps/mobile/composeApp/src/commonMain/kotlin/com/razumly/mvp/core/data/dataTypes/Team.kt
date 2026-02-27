package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.TeamDTO
import com.razumly.mvp.core.data.util.DEFAULT_AGE_DIVISION
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeId
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeName
import com.razumly.mvp.core.data.util.normalizeDivisionLabel
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.util.newId
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class Team(
    val division: String,
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
    val divisionTypeId: String? = null,
    val divisionTypeName: String? = null,
    val skillDivisionTypeId: String? = null,
    val skillDivisionTypeName: String? = null,
    val ageDivisionTypeId: String? = null,
    val ageDivisionTypeName: String? = null,
    val divisionGender: String? = null,
    @PrimaryKey override val id: String
) : MVPDocument, DisplayableEntity {
    override val displayName: String get() = name ?: "Team ${playerIds.size}"
    override val imageUrl: String? get() = profileImageId
    val assistantCoachIds: List<String> get() = coachIds

    companion object {
        operator fun invoke(captainId: String): Team {
            val defaultSkillDivisionTypeId = DEFAULT_DIVISION
            val defaultAgeDivisionTypeId = DEFAULT_AGE_DIVISION
            val defaultSkillDivisionTypeName = defaultSkillDivisionTypeId.toDivisionDisplayLabel()
            val defaultAgeDivisionTypeName = defaultAgeDivisionTypeId.toDivisionDisplayLabel()
            return Team(
                division = DEFAULT_DIVISION,
                name = null,
                playerIds = listOf(captainId),
                teamSize = 2,
                id = newId(),
                captainId = captainId,
                managerId = captainId,
                headCoachId = null,
                coachIds = emptyList(),
                profileImageId = null,
                sport = null,
                divisionTypeId = buildCombinedDivisionTypeId(
                    skillDivisionTypeId = defaultSkillDivisionTypeId,
                    ageDivisionTypeId = defaultAgeDivisionTypeId,
                ),
                divisionTypeName = buildCombinedDivisionTypeName(
                    skillDivisionTypeName = defaultSkillDivisionTypeName,
                    ageDivisionTypeName = defaultAgeDivisionTypeName,
                ),
                skillDivisionTypeId = defaultSkillDivisionTypeId,
                skillDivisionTypeName = defaultSkillDivisionTypeName,
                ageDivisionTypeId = defaultAgeDivisionTypeId,
                ageDivisionTypeName = defaultAgeDivisionTypeName,
                divisionGender = "C",
            )
        }
    }

    fun toTeamDTO(): TeamDTO {
        return TeamDTO(
            name = name,
            division = division.normalizeDivisionLabel(),
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
            sport = sport,
            divisionTypeId = divisionTypeId,
            divisionTypeName = divisionTypeName,
            skillDivisionTypeId = skillDivisionTypeId,
            skillDivisionTypeName = skillDivisionTypeName,
            ageDivisionTypeId = ageDivisionTypeId,
            ageDivisionTypeName = ageDivisionTypeName,
            divisionGender = divisionGender,
        )
    }
}
