package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite

enum class EventStaffRole {
    REFEREE,
    ASSISTANT_HOST,
}

data class PendingStaffInviteDraft(
    val firstName: String,
    val lastName: String,
    val email: String,
    val roles: Set<EventStaffRole>,
    val resolvedUserId: String? = null,
)

data class EventStaffSaveOutcome(
    val event: Event,
    val staffInvites: List<Invite>,
)

fun normalizeStaffInviteEmail(value: String): String = value.trim().lowercase()

fun PendingStaffInviteDraft.normalized(): PendingStaffInviteDraft = copy(
    firstName = firstName.trim(),
    lastName = lastName.trim(),
    email = normalizeStaffInviteEmail(email),
    roles = roles.toSet(),
    resolvedUserId = resolvedUserId?.trim()?.takeIf(String::isNotBlank),
)

fun EventStaffRole.toInviteStaffType(): String = when (this) {
    EventStaffRole.REFEREE -> "REFEREE"
    EventStaffRole.ASSISTANT_HOST -> "HOST"
}

fun EventStaffRole.label(): String = when (this) {
    EventStaffRole.REFEREE -> "Referee"
    EventStaffRole.ASSISTANT_HOST -> "Assistant Host"
}

fun EventStaffRole.conflictListLabel(): String = when (this) {
    EventStaffRole.REFEREE -> "referee list"
    EventStaffRole.ASSISTANT_HOST -> "host list"
}

fun PendingStaffInviteDraft.hasRole(role: EventStaffRole): Boolean = roles.contains(role)

fun PendingStaffInviteDraft.displayName(): String {
    val fullName = listOf(firstName.trim(), lastName.trim())
        .filter(String::isNotBlank)
        .joinToString(" ")
    return fullName.ifBlank { email }
}

fun mergePendingStaffInviteDraft(
    existing: List<PendingStaffInviteDraft>,
    draft: PendingStaffInviteDraft,
): List<PendingStaffInviteDraft> {
    val normalizedDraft = draft.normalized()
    if (normalizedDraft.email.isBlank()) {
        return existing
    }
    val merged = mutableListOf<PendingStaffInviteDraft>()
    var replaced = false
    existing.forEach { current ->
        if (normalizeStaffInviteEmail(current.email) == normalizedDraft.email) {
            replaced = true
            val normalizedCurrent = current.normalized()
            merged += normalizedCurrent.copy(
                firstName = normalizedDraft.firstName.ifBlank { normalizedCurrent.firstName },
                lastName = normalizedDraft.lastName.ifBlank { normalizedCurrent.lastName },
                roles = normalizedCurrent.roles + normalizedDraft.roles,
                resolvedUserId = normalizedDraft.resolvedUserId ?: normalizedCurrent.resolvedUserId,
            )
        } else {
            merged += current.normalized()
        }
    }
    if (!replaced) {
        merged += normalizedDraft
    }
    return merged
}

fun Invite.includesEventStaffRole(role: EventStaffRole): Boolean {
    val targetType = role.toInviteStaffType()
    return staffTypes.any { staffType ->
        staffType.trim().uppercase() == targetType
    }
}

fun Invite.normalizedStatusOrNull(): String? =
    status?.trim()?.uppercase()?.takeIf(String::isNotBlank)

fun Event.assignedUserIdsForRole(role: EventStaffRole): Set<String> = when (role) {
    EventStaffRole.REFEREE -> refereeIds
    EventStaffRole.ASSISTANT_HOST -> listOf(hostId) + assistantHostIds
}.map { userId -> userId.trim() }
    .filter(String::isNotBlank)
    .toSet()
