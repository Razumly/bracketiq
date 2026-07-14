package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Ignore
import androidx.room.PrimaryKey
import com.razumly.mvp.core.util.newId
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class Team @Ignore constructor(
    val division: String,
    val name: String,
    val kind: String? = null,
    val captainId: String,
    val managerId: String? = null,
    val headCoachId: String? = null,
    val coachIds: List<String> = emptyList(),
    val parentTeamId: String? = null,
    @Ignore val playerIds: List<String> = emptyList(),
    val playerRegistrationIds: List<String> = emptyList(),
    @Ignore val pending: List<String> = emptyList(),
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
    constructor(
        division: String,
        name: String,
        kind: String? = null,
        captainId: String,
        managerId: String? = null,
        headCoachId: String? = null,
        coachIds: List<String> = emptyList(),
        parentTeamId: String? = null,
        playerRegistrationIds: List<String> = emptyList(),
        staffAssignmentIds: List<String> = emptyList(),
        teamSize: Int,
        profileImageId: String? = null,
        sport: String? = null,
        divisionTypeId: String? = null,
        skillDivisionTypeId: String? = null,
        skillDivisionTypeName: String? = null,
        ageDivisionTypeId: String? = null,
        ageDivisionTypeName: String? = null,
        divisionGender: String? = null,
        organizationId: String? = null,
        createdBy: String? = null,
        joinPolicy: String = "CLOSED",
        openRegistration: Boolean = false,
        registrationPriceCents: Int = 0,
        affiliateUrl: String? = null,
        requiredTemplateIds: List<String> = emptyList(),
        playerRegistrations: List<TeamPlayerRegistration> = emptyList(),
        staffAssignments: List<TeamStaffAssignment> = emptyList(),
        id: String,
    ) : this(
        division = division,
        name = name,
        kind = kind,
        captainId = captainId,
        managerId = managerId,
        headCoachId = headCoachId,
        coachIds = coachIds,
        parentTeamId = parentTeamId,
        playerIds = emptyList(),
        playerRegistrationIds = playerRegistrationIds,
        pending = emptyList(),
        staffAssignmentIds = staffAssignmentIds,
        teamSize = teamSize,
        profileImageId = profileImageId,
        sport = sport,
        divisionTypeId = divisionTypeId,
        skillDivisionTypeId = skillDivisionTypeId,
        skillDivisionTypeName = skillDivisionTypeName,
        ageDivisionTypeId = ageDivisionTypeId,
        ageDivisionTypeName = ageDivisionTypeName,
        divisionGender = divisionGender,
        organizationId = organizationId,
        createdBy = createdBy,
        joinPolicy = joinPolicy,
        openRegistration = openRegistration,
        registrationPriceCents = registrationPriceCents,
        affiliateUrl = affiliateUrl,
        requiredTemplateIds = requiredTemplateIds,
        playerRegistrations = playerRegistrations,
        staffAssignments = staffAssignments,
        id = id,
    )

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
