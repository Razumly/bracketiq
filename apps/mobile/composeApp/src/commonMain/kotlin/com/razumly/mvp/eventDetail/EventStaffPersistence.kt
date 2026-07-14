package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.repositories.EventStaffAssignmentRole
import com.razumly.mvp.core.data.repositories.EventStaffInviteInput
import com.razumly.mvp.core.data.repositories.EventStaffState
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.util.emailAddressRegex

private fun PendingStaffInviteDraft.validationErrorOrNull(): String? {
    val normalized = normalized()
    if (normalized.firstName.isBlank()) return "Staff invite first name is required."
    if (normalized.lastName.isBlank()) return "Staff invite last name is required."
    if (normalized.email.isBlank()) return "Staff invite email is required."
    if (!normalized.email.matches(emailAddressRegex)) return "Enter a valid staff invite email address."
    if (normalized.roles.isEmpty()) return "Select at least one role for ${normalized.email}."
    return null
}

private data class EventOfficialStaffFingerprint(
    val userId: String,
    val positionIds: List<String>,
    val fieldIds: List<String>,
    val isActive: Boolean,
)

private fun List<String>.normalizedStaffIds(): List<String> =
    map(String::trim).filter(String::isNotBlank).distinct().sorted()

private fun Event.officialStaffFingerprint(): List<EventOfficialStaffFingerprint> =
    eventOfficials.mapNotNull { official ->
        val userId = official.userId.trim().takeIf(String::isNotBlank) ?: return@mapNotNull null
        EventOfficialStaffFingerprint(
            userId = userId,
            positionIds = official.positionIds.normalizedStaffIds(),
            fieldIds = official.fieldIds.normalizedStaffIds(),
            isActive = official.isActive,
        )
    }.sortedWith(
        compareBy<EventOfficialStaffFingerprint>(EventOfficialStaffFingerprint::userId)
            .thenBy { fingerprint -> fingerprint.positionIds.joinToString("\u0000") }
            .thenBy { fingerprint -> fingerprint.fieldIds.joinToString("\u0000") }
            .thenBy(EventOfficialStaffFingerprint::isActive),
    )

internal fun requireNoUnsavedEventStaffChanges(
    persistedEvent: Event,
    preparedEvent: Event,
    pendingStaffInvites: List<PendingStaffInviteDraft>,
) {
    val hasUnsavedChanges = pendingStaffInvites.isNotEmpty()
        || persistedEvent.assistantHostIds.normalizedStaffIds() != preparedEvent.assistantHostIds.normalizedStaffIds()
        || persistedEvent.officialIds.normalizedStaffIds() != preparedEvent.officialIds.normalizedStaffIds()
        || persistedEvent.officialStaffFingerprint() != preparedEvent.officialStaffFingerprint()
    check(!hasUnsavedChanges) {
        "Save staff changes with Confirm before rescheduling or rebuilding the schedule."
    }
}

private fun PendingStaffInviteDraft.toRepositoryInput(): EventStaffInviteInput {
    val normalized = normalized()
    validationErrorOrNull()?.let(::error)
    return EventStaffInviteInput(
        email = normalized.email,
        firstName = normalized.firstName,
        lastName = normalized.lastName,
        roles = normalized.roles
            .map { role -> EventStaffAssignmentRole.valueOf(role.name) }
            .toSet(),
        resolvedUserId = normalized.resolvedUserId,
    )
}

internal fun validatePendingStaffInviteDrafts(
    pendingStaffInvites: List<PendingStaffInviteDraft>,
): Result<Unit> = runCatching {
    pendingStaffInvites.forEach { draft ->
        draft.validationErrorOrNull()?.let(::error)
    }
}

suspend fun reconcileEventStaffState(
    eventRepository: IEventRepository,
    event: Event,
    pendingStaffInvites: List<PendingStaffInviteDraft>,
    expectedRevision: String,
): Result<EventStaffState> = runCatching {
    val revision = expectedRevision.trim()
    require(revision.isNotEmpty()) {
        "Reload the event before saving staff changes."
    }
    validatePendingStaffInviteDrafts(pendingStaffInvites).getOrThrow()
    val pendingInputs = pendingStaffInvites
        .map(PendingStaffInviteDraft::normalized)
        .map(PendingStaffInviteDraft::toRepositoryInput)

    eventRepository.reconcileEventStaff(
        event = event,
        pendingInvites = pendingInputs,
        expectedRevision = revision,
    ).getOrThrow()
}
