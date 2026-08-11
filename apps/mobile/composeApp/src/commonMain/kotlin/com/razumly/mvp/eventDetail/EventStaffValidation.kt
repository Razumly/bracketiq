package com.razumly.mvp.eventDetail

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

internal fun validatePendingStaffInviteDrafts(
    pendingStaffInvites: List<PendingStaffInviteDraft>,
): Result<Unit> = runCatching {
    pendingStaffInvites.forEach { draft ->
        draft.validationErrorOrNull()?.let(::error)
    }
}
