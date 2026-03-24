package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.addOfficialUser
import com.razumly.mvp.core.data.dataTypes.removeOfficialUser
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.network.dto.InviteCreateDto

private fun PendingStaffInviteDraft.validationErrorOrNull(): String? {
    val normalized = normalized()
    if (normalized.firstName.isBlank()) return "Staff invite first name is required."
    if (normalized.lastName.isBlank()) return "Staff invite last name is required."
    if (normalized.email.isBlank()) return "Staff invite email is required."
    if (normalized.roles.isEmpty()) return "Select at least one role for ${normalized.email}."
    return null
}

private fun validatePendingStaffInviteDrafts(drafts: List<PendingStaffInviteDraft>) {
    drafts.forEach { draft ->
        val error = draft.validationErrorOrNull()
        if (error != null) {
            error(error)
        }
    }
}

private suspend fun validatePendingStaffEmailMembership(
    userRepository: IUserRepository,
    event: Event,
    drafts: List<PendingStaffInviteDraft>,
) {
    val assignedUserIds = drafts
        .flatMap { draft -> draft.roles.map { role -> event.assignedUserIdsForRole(role) } }
        .flatten()
        .distinct()
    if (assignedUserIds.isEmpty()) {
        return
    }

    val matches = userRepository.findEmailMembership(
        emails = drafts.map(PendingStaffInviteDraft::email),
        userIds = assignedUserIds,
    ).getOrThrow()
    val matchedUserIdsByEmail = matches.groupBy(
        keySelector = { match -> normalizeStaffInviteEmail(match.email) },
        valueTransform = { match -> match.userId.trim() },
    )

    drafts.forEach { draft ->
        val normalizedDraft = draft.normalized()
        val matchedUserIds = matchedUserIdsByEmail[normalizedDraft.email].orEmpty().toSet()
        normalizedDraft.roles.forEach { role ->
            if (matchedUserIds.any { userId -> event.assignedUserIdsForRole(role).contains(userId) }) {
                error("${normalizedDraft.email} is already added in the ${role.conflictListLabel()}.")
            }
        }
    }
}

private fun buildTargetStaffRoles(event: Event): MutableMap<String, MutableSet<EventStaffRole>> {
    val rolesByUserId = linkedMapOf<String, MutableSet<EventStaffRole>>()
    event.officialIds
        .map { userId -> userId.trim() }
        .filter(String::isNotBlank)
        .forEach { userId ->
            rolesByUserId.getOrPut(userId) { linkedSetOf() }.add(EventStaffRole.OFFICIAL)
        }
    event.assistantHostIds
        .map { userId -> userId.trim() }
        .filter(String::isNotBlank)
        .filterNot { userId -> userId == event.hostId.trim() }
        .forEach { userId ->
            rolesByUserId.getOrPut(userId) { linkedSetOf() }.add(EventStaffRole.ASSISTANT_HOST)
        }
    return rolesByUserId
}

private fun mergeReturnedStaffInvites(
    existing: List<Invite>,
    deletedInviteIds: Set<String>,
    returned: List<Invite>,
    eventId: String,
): List<Invite> {
    val scopedExisting = existing.filter { invite ->
        invite.type.equals("STAFF", ignoreCase = true) &&
            invite.eventId?.trim() == eventId
    }
    val mergedByKey = linkedMapOf<String, Invite>()

    scopedExisting.forEach { invite ->
        if (invite.id !in deletedInviteIds) {
            val key = invite.userId?.trim()?.takeIf(String::isNotBlank)
                ?: normalizeStaffInviteEmail(invite.email)
            if (key.isNotBlank()) {
                mergedByKey[key] = invite
            }
        }
    }

    returned.forEach { invite ->
        val key = invite.userId?.trim()?.takeIf(String::isNotBlank)
            ?: normalizeStaffInviteEmail(invite.email)
        if (key.isNotBlank()) {
            mergedByKey[key] = invite
        }
    }

    return mergedByKey.values.toList()
}

suspend fun reconcileEventStaffInvites(
    userRepository: IUserRepository,
    event: Event,
    pendingStaffInvites: List<PendingStaffInviteDraft>,
    existingStaffInvites: List<Invite>,
    createdByUserId: String? = null,
): Result<EventStaffSaveOutcome> = runCatching {
    val normalizedDrafts = pendingStaffInvites
        .map(PendingStaffInviteDraft::normalized)
        .filter { draft -> draft.email.isNotBlank() }

    validatePendingStaffInviteDrafts(normalizedDrafts)
    validatePendingStaffEmailMembership(
        userRepository = userRepository,
        event = event,
        drafts = normalizedDrafts,
    )

    val targetRolesByUserId = buildTargetStaffRoles(event)
    val targetInviteRequests = mutableListOf<InviteCreateDto>()

    targetRolesByUserId.forEach { (userId, roles) ->
        targetInviteRequests += InviteCreateDto(
            type = "STAFF",
            eventId = event.id,
            userId = userId,
            createdBy = createdByUserId,
            staffTypes = roles.map(EventStaffRole::toInviteStaffType).sorted(),
            replaceStaffTypes = true,
        )
    }

    normalizedDrafts.forEach { draft ->
        val resolvedUserId = draft.resolvedUserId?.trim()?.takeIf(String::isNotBlank)
        if (resolvedUserId != null) {
            targetRolesByUserId.getOrPut(resolvedUserId) { linkedSetOf() }.addAll(draft.roles)
        } else {
            targetInviteRequests += InviteCreateDto(
                type = "STAFF",
                eventId = event.id,
                email = draft.email,
                firstName = draft.firstName,
                lastName = draft.lastName,
                createdBy = createdByUserId,
                staffTypes = draft.roles.map(EventStaffRole::toInviteStaffType).sorted(),
                replaceStaffTypes = true,
            )
        }
    }

    val scopedExistingInvites = existingStaffInvites.filter { invite ->
        invite.type.equals("STAFF", ignoreCase = true) &&
            invite.eventId?.trim() == event.id
    }
    val activeUserIds = targetRolesByUserId.keys
    val deletedInviteIds = scopedExistingInvites
        .filter { invite ->
            val inviteUserId = invite.userId?.trim()
            !inviteUserId.isNullOrBlank() && inviteUserId !in activeUserIds
        }
        .map { invite -> invite.id }
        .filter(String::isNotBlank)
        .toSet()

    deletedInviteIds.forEach { inviteId ->
        userRepository.deleteInvite(inviteId).getOrThrow()
    }

    val returnedInvites = userRepository.createInvites(targetInviteRequests).getOrThrow()
    val draftRolesByEmail = normalizedDrafts.associateBy(
        keySelector = PendingStaffInviteDraft::email,
        valueTransform = PendingStaffInviteDraft::roles,
    )

    val resolvedAssistantHostIds = buildSet {
        addAll(event.assistantHostIds.map(String::trim).filter(String::isNotBlank))
        returnedInvites.forEach { invite ->
            val userId = invite.userId?.trim().takeIf { !it.isNullOrBlank() } ?: return@forEach
            val roles = targetRolesByUserId[userId]
                ?: draftRolesByEmail[normalizeStaffInviteEmail(invite.email)]
                ?: emptySet()
            if (roles.contains(EventStaffRole.ASSISTANT_HOST) && userId != event.hostId.trim()) {
                add(userId)
            }
        }
    }.toList()

    val resolvedAssignedOfficialIds = buildSet {
        addAll(event.officialIds.map(String::trim).filter(String::isNotBlank))
        returnedInvites.forEach { invite ->
            val userId = invite.userId?.trim().takeIf { !it.isNullOrBlank() } ?: return@forEach
            val roles = targetRolesByUserId[userId]
                ?: draftRolesByEmail[normalizeStaffInviteEmail(invite.email)]
                ?: emptySet()
            if (roles.contains(EventStaffRole.OFFICIAL)) {
                add(userId)
            }
        }
    }.toList()

    val updatedEvent = resolvedAssignedOfficialIds.fold(
        event.copy(
            assistantHostIds = resolvedAssistantHostIds,
            officialIds = emptyList(),
            eventOfficials = event.eventOfficials.filterNot { official ->
                official.userId.trim().isNotBlank()
            },
        ),
    ) { currentEvent, userId ->
        currentEvent.addOfficialUser(userId)
    }.copy(
        assistantHostIds = resolvedAssistantHostIds,
    ).let { currentEvent ->
        currentEvent.eventOfficials
            .map { official -> official.userId.trim() }
            .filter(String::isNotBlank)
            .filterNot { userId -> resolvedAssignedOfficialIds.contains(userId) }
            .fold(currentEvent) { eventState, userId ->
                eventState.removeOfficialUser(userId)
            }
    }.syncOfficialStaffing()

    EventStaffSaveOutcome(
        event = updatedEvent,
        staffInvites = mergeReturnedStaffInvites(
            existing = existingStaffInvites,
            deletedInviteIds = deletedInviteIds,
            returned = returnedInvites,
            eventId = event.id,
        ),
    )
}


