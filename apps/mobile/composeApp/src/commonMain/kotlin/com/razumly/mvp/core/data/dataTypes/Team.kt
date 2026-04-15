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
    val name: String,
    val kind: String? = null,
    val captainId: String,
    val managerId: String? = null,
    val headCoachId: String? = null,
    val coachIds: List<String> = emptyList(),
    val parentTeamId: String? = null,
    val playerIds: List<String> = emptyList(),
    val playerRegistrationIds: List<String> = emptyList(),
    val pending: List<String> = emptyList(),
    val staffAssignmentIds: List<String> = emptyList(),
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
    val playerRegistrations: List<TeamPlayerRegistration> = emptyList(),
    val staffAssignments: List<TeamStaffAssignment> = emptyList(),
    @PrimaryKey override val id: String
) : MVPDocument, DisplayableEntity {
    override val displayName: String get() = name.ifBlank { "Team ${activePlayerRegistrations().size}" }
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
                name = "",
                playerIds = listOf(captainId),
                playerRegistrationIds = emptyList(),
                teamSize = 2,
                id = newId(),
                captainId = captainId,
                managerId = captainId,
                headCoachId = null,
                coachIds = emptyList(),
                staffAssignmentIds = emptyList(),
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
                playerRegistrations = emptyList(),
                staffAssignments = emptyList(),
            ).withSynchronizedMembership()
        }
    }

    fun toTeamDTO(): TeamDTO {
        val synced = withSynchronizedMembership()
        return TeamDTO(
            name = synced.name,
            division = synced.division.normalizeDivisionLabel(),
            playerIds = synced.playerIds,
            captainId = synced.captainId,
            managerId = synced.managerId,
            headCoachId = synced.headCoachId,
            assistantCoachIds = synced.assistantCoachIds,
            coachIds = synced.coachIds,
            parentTeamId = synced.parentTeamId,
            teamSize = synced.teamSize,
            id = synced.id,
            pending = synced.pending,
            profileImageId = synced.profileImageId,
            sport = synced.sport,
            divisionTypeId = synced.divisionTypeId,
            divisionTypeName = synced.divisionTypeName,
            skillDivisionTypeId = synced.skillDivisionTypeId,
            skillDivisionTypeName = synced.skillDivisionTypeName,
            ageDivisionTypeId = synced.ageDivisionTypeId,
            ageDivisionTypeName = synced.ageDivisionTypeName,
            divisionGender = synced.divisionGender,
        )
    }
}
