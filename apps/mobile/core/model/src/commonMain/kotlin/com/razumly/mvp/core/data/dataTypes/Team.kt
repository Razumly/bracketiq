package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Ignore
import androidx.room.PrimaryKey
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
    val skillDivisionTypeId: String? = null,
    val skillDivisionTypeName: String? = null,
    val ageDivisionTypeId: String? = null,
    val ageDivisionTypeName: String? = null,
    val divisionGender: String? = null,
    val organizationId: String? = null,
    val createdBy: String? = null,
    val joinPolicy: String = "CLOSED",
    val openRegistration: Boolean = false,
    val registrationPriceCents: Int = 0,
    val affiliateUrl: String? = null,
    val requiredTemplateIds: List<String> = emptyList(),
    val playerRegistrations: List<TeamPlayerRegistration> = emptyList(),
    val staffAssignments: List<TeamStaffAssignment> = emptyList(),
    @PrimaryKey override val id: String
) : MVPDocument, DisplayableEntity {
    @Ignore
    override var displayName: String = ""
        get() = name.ifBlank { "Team ${activePlayerRegistrations().size}" }
        set(value) { field = value }
    @Ignore
    override var imageUrl: String? = null
        get() = profileImageId
        set(value) { field = value }
    @Ignore
    var assistantCoachIds: List<String> = emptyList()
        get() = coachIds
        set(value) { field = value }

    companion object {
        operator fun invoke(captainId: String): Team {
            return Team(
                division = "",
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
                divisionTypeId = null,
                skillDivisionTypeId = null,
                skillDivisionTypeName = null,
                ageDivisionTypeId = null,
                ageDivisionTypeName = null,
                divisionGender = null,
                organizationId = null,
                createdBy = captainId,
                joinPolicy = "CLOSED",
                openRegistration = false,
                registrationPriceCents = 0,
                affiliateUrl = null,
                requiredTemplateIds = emptyList(),
                playerRegistrations = emptyList(),
                staffAssignments = emptyList(),
            ).withSynchronizedMembership()
        }
    }
}

fun Team.normalizedAffiliateUrl(): String? =
    affiliateUrl?.trim()?.takeIf(String::isNotBlank)
