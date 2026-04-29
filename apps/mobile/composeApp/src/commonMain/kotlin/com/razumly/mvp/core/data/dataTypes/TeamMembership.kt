package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

private const val TEAM_MEMBERSHIP_STATUS_ACTIVE = "ACTIVE"
private const val TEAM_MEMBERSHIP_STATUS_INVITED = "INVITED"
private const val TEAM_MEMBERSHIP_STATUS_STARTED = "STARTED"
private const val TEAM_MEMBERSHIP_STATUS_LEFT = "LEFT"
private const val TEAM_MEMBERSHIP_STATUS_REMOVED = "REMOVED"
private const val TEAM_REGISTRANT_TYPE_SELF = "SELF"
private const val TEAM_REGISTRANT_TYPE_CHILD = "CHILD"

private const val TEAM_STAFF_STATUS_ACTIVE = "ACTIVE"

private const val TEAM_STAFF_ROLE_MANAGER = "MANAGER"
private const val TEAM_STAFF_ROLE_HEAD_COACH = "HEAD_COACH"
private const val TEAM_STAFF_ROLE_ASSISTANT_COACH = "ASSISTANT_COACH"

private const val TEAM_KIND_PLACEHOLDER = "PLACEHOLDER"

@Serializable
data class TeamPlayerRegistration(
    val id: String = "",
    val teamId: String? = null,
    val userId: String = "",
    val registrantId: String = userId,
    val parentId: String? = null,
    val registrantType: String = TEAM_REGISTRANT_TYPE_SELF,
    val rosterRole: String? = null,
    val status: String = TEAM_MEMBERSHIP_STATUS_ACTIVE,
    val jerseyNumber: String? = null,
    val position: String? = null,
    val isCaptain: Boolean = false,
    val consentDocumentId: String? = null,
    val consentStatus: String? = null,
    val createdBy: String? = null,
)

@Serializable
data class TeamStaffAssignment(
    val id: String = "",
    val teamId: String? = null,
    val userId: String = "",
    val role: String = TEAM_STAFF_ROLE_ASSISTANT_COACH,
    val status: String = TEAM_STAFF_STATUS_ACTIVE,
)

private fun normalizeIdToken(value: String?): String? =
    value?.trim()?.takeIf(String::isNotBlank)

private fun normalizeTeamMembershipStatus(value: String?): String =
    when (value?.trim()?.uppercase()) {
        TEAM_MEMBERSHIP_STATUS_INVITED -> TEAM_MEMBERSHIP_STATUS_INVITED
        TEAM_MEMBERSHIP_STATUS_STARTED -> TEAM_MEMBERSHIP_STATUS_STARTED
        TEAM_MEMBERSHIP_STATUS_LEFT -> TEAM_MEMBERSHIP_STATUS_LEFT
        TEAM_MEMBERSHIP_STATUS_REMOVED -> TEAM_MEMBERSHIP_STATUS_REMOVED
        else -> TEAM_MEMBERSHIP_STATUS_ACTIVE
    }

private fun normalizeTeamRegistrantType(value: String?): String =
    when (value?.trim()?.uppercase()) {
        TEAM_REGISTRANT_TYPE_CHILD -> TEAM_REGISTRANT_TYPE_CHILD
        else -> TEAM_REGISTRANT_TYPE_SELF
    }

private fun normalizeTeamStaffStatus(value: String?): String =
    if (value?.trim()?.uppercase() == TEAM_STAFF_STATUS_ACTIVE) {
        TEAM_STAFF_STATUS_ACTIVE
    } else {
        value?.trim()?.uppercase()?.takeIf(String::isNotBlank) ?: TEAM_STAFF_STATUS_ACTIVE
    }

private fun normalizeTeamStaffRole(value: String?): String =
    when (value?.trim()?.uppercase()) {
        TEAM_STAFF_ROLE_MANAGER -> TEAM_STAFF_ROLE_MANAGER
        TEAM_STAFF_ROLE_HEAD_COACH -> TEAM_STAFF_ROLE_HEAD_COACH
        else -> TEAM_STAFF_ROLE_ASSISTANT_COACH
    }

fun TeamPlayerRegistration.normalizedStatus(): String = normalizeTeamMembershipStatus(status)

fun TeamPlayerRegistration.isActive(): Boolean = normalizedStatus() == TEAM_MEMBERSHIP_STATUS_ACTIVE

fun TeamPlayerRegistration.isInvited(): Boolean = normalizedStatus() == TEAM_MEMBERSHIP_STATUS_INVITED

fun TeamPlayerRegistration.isStarted(): Boolean = normalizedStatus() == TEAM_MEMBERSHIP_STATUS_STARTED

fun TeamPlayerRegistration.countsTowardTeamCapacity(): Boolean =
    when (normalizedStatus()) {
        TEAM_MEMBERSHIP_STATUS_ACTIVE,
        TEAM_MEMBERSHIP_STATUS_INVITED,
        TEAM_MEMBERSHIP_STATUS_STARTED -> true
        else -> false
    }

fun TeamStaffAssignment.normalizedStatus(): String = normalizeTeamStaffStatus(status)

fun TeamStaffAssignment.normalizedRole(): String = normalizeTeamStaffRole(role)

fun TeamStaffAssignment.isActive(): Boolean = normalizedStatus() == TEAM_STAFF_STATUS_ACTIVE

fun Team.isExplicitPlaceholder(): Boolean = kind?.trim()?.uppercase() == TEAM_KIND_PLACEHOLDER

fun Team.isCaptainOrManager(userId: String): Boolean {
    val normalizedUserId = normalizeIdToken(userId) ?: return false
    val syncedTeam = withSynchronizedMembership()
    return syncedTeam.captainId == normalizedUserId || syncedTeam.managerId == normalizedUserId
}

fun Team.activePlayerRegistrations(): List<TeamPlayerRegistration> =
    withSynchronizedMembership().playerRegistrations.filter(TeamPlayerRegistration::isActive)

fun Team.invitedPlayerRegistrations(): List<TeamPlayerRegistration> =
    withSynchronizedMembership().playerRegistrations.filter(TeamPlayerRegistration::isInvited)

fun Team.teamCapacityPlayerCount(): Int {
    val syncedTeam = withSynchronizedMembership()
    val registrationUserIds = syncedTeam.playerRegistrations
        .filter(TeamPlayerRegistration::countsTowardTeamCapacity)
        .mapNotNull { registration -> normalizeIdToken(registration.userId) }
        .toSet()
    val legacyUserIds = (syncedTeam.playerIds + syncedTeam.pending)
        .mapNotNull(::normalizeIdToken)
        .toSet()
    return (registrationUserIds + legacyUserIds).size
}

fun Team.hasAvailablePlayerSlot(): Boolean =
    teamSize <= 0 || teamCapacityPlayerCount() < teamSize

fun Team.activeStaffAssignments(): List<TeamStaffAssignment> =
    withSynchronizedMembership().staffAssignments.filter(TeamStaffAssignment::isActive)

fun Team.primaryEventTeamId(): String? =
    normalizeIdToken(id)

private fun buildTeamPlayerRegistrationId(teamId: String, userId: String, status: String): String =
    "${teamId}__player__${status.lowercase()}__${userId}"

private fun buildTeamStaffAssignmentId(teamId: String, role: String, userId: String): String =
    "${teamId}__staff__${role.lowercase()}__${userId}"

private fun Team.normalizeExplicitPlayerRegistrations(): List<TeamPlayerRegistration> =
    playerRegistrations
        .mapNotNull { row ->
            val userId = normalizeIdToken(row.userId) ?: return@mapNotNull null
            val normalizedStatus = normalizeTeamMembershipStatus(row.status)
            TeamPlayerRegistration(
                id = normalizeIdToken(row.id) ?: buildTeamPlayerRegistrationId(
                    teamId = id,
                    userId = userId,
                    status = normalizedStatus,
                ),
                teamId = normalizeIdToken(row.teamId) ?: id,
                userId = userId,
                registrantId = normalizeIdToken(row.registrantId) ?: userId,
                parentId = normalizeIdToken(row.parentId),
                registrantType = normalizeTeamRegistrantType(row.registrantType),
                rosterRole = row.rosterRole?.trim()?.takeIf(String::isNotBlank),
                status = normalizedStatus,
                jerseyNumber = row.jerseyNumber?.trim()?.takeIf(String::isNotBlank),
                position = row.position?.trim()?.takeIf(String::isNotBlank),
                isCaptain = row.isCaptain,
                consentDocumentId = normalizeIdToken(row.consentDocumentId),
                consentStatus = row.consentStatus?.trim()?.takeIf(String::isNotBlank),
                createdBy = normalizeIdToken(row.createdBy),
            )
        }

private fun Team.buildFallbackPlayerRegistrations(): List<TeamPlayerRegistration> {
    val activeIds = playerIds.mapNotNull(::normalizeIdToken)
    val invitedIds = pending.mapNotNull(::normalizeIdToken).filterNot { activeIds.contains(it) }
    val fallbackCaptainId = normalizeIdToken(captainId)
    return buildList {
        activeIds.forEach { userId ->
            add(
                TeamPlayerRegistration(
                    id = buildTeamPlayerRegistrationId(id, userId, TEAM_MEMBERSHIP_STATUS_ACTIVE),
                    teamId = id,
                    userId = userId,
                    registrantId = userId,
                    parentId = null,
                    registrantType = TEAM_REGISTRANT_TYPE_SELF,
                    rosterRole = null,
                    status = TEAM_MEMBERSHIP_STATUS_ACTIVE,
                    isCaptain = fallbackCaptainId == userId,
                    consentDocumentId = null,
                    consentStatus = null,
                    createdBy = null,
                ),
            )
        }
        invitedIds.forEach { userId ->
            add(
                TeamPlayerRegistration(
                    id = buildTeamPlayerRegistrationId(id, userId, TEAM_MEMBERSHIP_STATUS_INVITED),
                    teamId = id,
                    userId = userId,
                    registrantId = userId,
                    parentId = null,
                    registrantType = TEAM_REGISTRANT_TYPE_SELF,
                    rosterRole = null,
                    status = TEAM_MEMBERSHIP_STATUS_INVITED,
                    isCaptain = false,
                    consentDocumentId = null,
                    consentStatus = null,
                    createdBy = null,
                ),
            )
        }
    }
}

private fun Team.normalizeExplicitStaffAssignments(): List<TeamStaffAssignment> =
    staffAssignments
        .mapNotNull { row ->
            val userId = normalizeIdToken(row.userId) ?: return@mapNotNull null
            val normalizedRole = normalizeTeamStaffRole(row.role)
            TeamStaffAssignment(
                id = normalizeIdToken(row.id) ?: buildTeamStaffAssignmentId(
                    teamId = id,
                    role = normalizedRole,
                    userId = userId,
                ),
                teamId = normalizeIdToken(row.teamId) ?: id,
                userId = userId,
                role = normalizedRole,
                status = normalizeTeamStaffStatus(row.status),
            )
        }

private fun Team.buildFallbackStaffAssignments(): List<TeamStaffAssignment> {
    val fallbackManagerId = normalizeIdToken(managerId)
    val fallbackHeadCoachId = normalizeIdToken(headCoachId)
    val fallbackAssistantCoachIds = coachIds.mapNotNull(::normalizeIdToken)
        .filterNot { coachId -> coachId == fallbackManagerId || coachId == fallbackHeadCoachId }

    return buildList {
        fallbackManagerId?.let { userId ->
            add(
                TeamStaffAssignment(
                    id = buildTeamStaffAssignmentId(id, TEAM_STAFF_ROLE_MANAGER, userId),
                    teamId = id,
                    userId = userId,
                    role = TEAM_STAFF_ROLE_MANAGER,
                    status = TEAM_STAFF_STATUS_ACTIVE,
                ),
            )
        }
        fallbackHeadCoachId?.let { userId ->
            add(
                TeamStaffAssignment(
                    id = buildTeamStaffAssignmentId(id, TEAM_STAFF_ROLE_HEAD_COACH, userId),
                    teamId = id,
                    userId = userId,
                    role = TEAM_STAFF_ROLE_HEAD_COACH,
                    status = TEAM_STAFF_STATUS_ACTIVE,
                ),
            )
        }
        fallbackAssistantCoachIds.forEach { userId ->
            add(
                TeamStaffAssignment(
                    id = buildTeamStaffAssignmentId(id, TEAM_STAFF_ROLE_ASSISTANT_COACH, userId),
                    teamId = id,
                    userId = userId,
                    role = TEAM_STAFF_ROLE_ASSISTANT_COACH,
                    status = TEAM_STAFF_STATUS_ACTIVE,
                ),
            )
        }
    }
}

fun Team.withSynchronizedMembership(): Team {
    var normalizedPlayerRegistrations = normalizeExplicitPlayerRegistrations()
        .ifEmpty { buildFallbackPlayerRegistrations() }
    var normalizedStaffAssignments = normalizeExplicitStaffAssignments()
        .ifEmpty { buildFallbackStaffAssignments() }

    val normalizedKind = kind?.trim()?.uppercase()?.takeIf(String::isNotBlank)

    val fallbackCaptainId = normalizeIdToken(captainId)
    val derivedCaptainId = normalizedPlayerRegistrations
        .firstOrNull { row -> row.isCaptain && row.isActive() }
        ?.userId
        ?: fallbackCaptainId
        ?: normalizedPlayerRegistrations.firstOrNull(TeamPlayerRegistration::isActive)?.userId
        .orEmpty()

    if (derivedCaptainId.isNotBlank()) {
        normalizedPlayerRegistrations = when {
            normalizedPlayerRegistrations.any { row -> row.userId == derivedCaptainId } -> {
                normalizedPlayerRegistrations.map { row ->
                    if (row.userId == derivedCaptainId && row.isActive()) {
                        row.copy(isCaptain = true)
                    } else if (row.isCaptain) {
                        row.copy(isCaptain = false)
                    } else {
                        row
                    }
                }
            }

            else -> normalizedPlayerRegistrations + TeamPlayerRegistration(
                id = buildTeamPlayerRegistrationId(id, derivedCaptainId, TEAM_MEMBERSHIP_STATUS_ACTIVE),
                teamId = id,
                userId = derivedCaptainId,
                registrantId = derivedCaptainId,
                parentId = null,
                registrantType = TEAM_REGISTRANT_TYPE_SELF,
                rosterRole = null,
                status = TEAM_MEMBERSHIP_STATUS_ACTIVE,
                isCaptain = true,
                consentDocumentId = null,
                consentStatus = null,
                createdBy = null,
            )
        }
    }

    val activePlayerIds = normalizedPlayerRegistrations
        .filter(TeamPlayerRegistration::isActive)
        .map(TeamPlayerRegistration::userId)
    val invitedPlayerIds = normalizedPlayerRegistrations
        .filter(TeamPlayerRegistration::isInvited)
        .map(TeamPlayerRegistration::userId)
        .filterNot(activePlayerIds::contains)

    val fallbackManagerId = normalizeIdToken(managerId)
    val fallbackHeadCoachId = normalizeIdToken(headCoachId)
    val fallbackAssistantCoachIds = coachIds.mapNotNull(::normalizeIdToken)

    val derivedManagerId = normalizedStaffAssignments
        .firstOrNull { row -> row.isActive() && row.normalizedRole() == TEAM_STAFF_ROLE_MANAGER }
        ?.userId
        ?: fallbackManagerId
        ?: derivedCaptainId.takeIf(String::isNotBlank)

    val derivedHeadCoachId = normalizedStaffAssignments
        .firstOrNull { row -> row.isActive() && row.normalizedRole() == TEAM_STAFF_ROLE_HEAD_COACH }
        ?.userId
        ?: fallbackHeadCoachId

    var derivedAssistantCoachIds = normalizedStaffAssignments
        .filter { row -> row.isActive() && row.normalizedRole() == TEAM_STAFF_ROLE_ASSISTANT_COACH }
        .map(TeamStaffAssignment::userId)
        .ifEmpty { fallbackAssistantCoachIds }
        .filterNot { coachId -> coachId == derivedManagerId || coachId == derivedHeadCoachId }
        .distinct()

    val ensuredStaffAssignments = buildList {
        normalizedStaffAssignments.forEach { assignment ->
            if (!assignment.isActive()) {
                add(assignment)
            }
        }

        derivedManagerId?.takeIf(String::isNotBlank)?.let { userId ->
            add(
                TeamStaffAssignment(
                    id = buildTeamStaffAssignmentId(id, TEAM_STAFF_ROLE_MANAGER, userId),
                    teamId = id,
                    userId = userId,
                    role = TEAM_STAFF_ROLE_MANAGER,
                    status = TEAM_STAFF_STATUS_ACTIVE,
                ),
            )
        }
        derivedHeadCoachId?.takeIf(String::isNotBlank)?.let { userId ->
            add(
                TeamStaffAssignment(
                    id = buildTeamStaffAssignmentId(id, TEAM_STAFF_ROLE_HEAD_COACH, userId),
                    teamId = id,
                    userId = userId,
                    role = TEAM_STAFF_ROLE_HEAD_COACH,
                    status = TEAM_STAFF_STATUS_ACTIVE,
                ),
            )
        }
        derivedAssistantCoachIds.forEach { userId ->
            add(
                TeamStaffAssignment(
                    id = buildTeamStaffAssignmentId(id, TEAM_STAFF_ROLE_ASSISTANT_COACH, userId),
                    teamId = id,
                    userId = userId,
                    role = TEAM_STAFF_ROLE_ASSISTANT_COACH,
                    status = TEAM_STAFF_STATUS_ACTIVE,
                ),
            )
        }
    }

    normalizedStaffAssignments = ensuredStaffAssignments
        .groupBy { assignment -> "${assignment.normalizedRole()}:${assignment.userId}" }
        .mapNotNull { (_, assignments) ->
            assignments.firstOrNull { it.isActive() } ?: assignments.firstOrNull()
        }
        .sortedWith(compareBy(TeamStaffAssignment::role, TeamStaffAssignment::userId))

    derivedAssistantCoachIds = normalizedStaffAssignments
        .filter { row -> row.isActive() && row.normalizedRole() == TEAM_STAFF_ROLE_ASSISTANT_COACH }
        .map(TeamStaffAssignment::userId)
        .distinct()

    val resolvedPlayerRegistrationIds = playerRegistrationIds
        .mapNotNull(::normalizeIdToken)
        .ifEmpty {
            normalizedPlayerRegistrations.mapNotNull { row -> normalizeIdToken(row.id) }
        }

    val resolvedStaffAssignmentIds = staffAssignmentIds
        .mapNotNull(::normalizeIdToken)
        .ifEmpty {
            normalizedStaffAssignments.mapNotNull { row -> normalizeIdToken(row.id) }
        }

    return copy(
        kind = normalizedKind,
        playerIds = activePlayerIds,
        playerRegistrationIds = resolvedPlayerRegistrationIds,
        captainId = derivedCaptainId,
        managerId = derivedManagerId,
        headCoachId = derivedHeadCoachId,
        coachIds = derivedAssistantCoachIds,
        staffAssignmentIds = resolvedStaffAssignmentIds,
        pending = invitedPlayerIds,
        playerRegistrations = normalizedPlayerRegistrations,
        staffAssignments = normalizedStaffAssignments,
    )
}
