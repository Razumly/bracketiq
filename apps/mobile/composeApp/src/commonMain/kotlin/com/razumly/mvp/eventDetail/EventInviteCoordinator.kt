package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

internal class EventInviteCoordinator {
    private val _suggestedUsers = MutableStateFlow<List<UserData>>(emptyList())
    val suggestedUsers = _suggestedUsers.asStateFlow()

    private val _inviteTeamSuggestions = MutableStateFlow<List<Team>>(emptyList())
    val inviteTeamSuggestions = _inviteTeamSuggestions.asStateFlow()

    private val _inviteTeamsLoading = MutableStateFlow(false)
    val inviteTeamsLoading = _inviteTeamsLoading.asStateFlow()

    private val _pendingStaffInvites = MutableStateFlow<List<PendingStaffInviteDraft>>(emptyList())
    val pendingStaffInvites = _pendingStaffInvites.asStateFlow()

    fun replaceSuggestedUsers(users: List<UserData>) {
        _suggestedUsers.value = users
    }

    fun clearSuggestedUsers() {
        _suggestedUsers.value = emptyList()
    }

    fun removeSuggestedUser(userId: String) {
        val normalizedUserId = userId.trim().takeIf(String::isNotBlank) ?: return
        _suggestedUsers.value = _suggestedUsers.value.filterNot { candidate ->
            candidate.id.trim() == normalizedUserId
        }
    }

    fun startInviteTeamSearch() {
        _inviteTeamsLoading.value = true
    }

    fun finishInviteTeamSearch(teams: List<Team>) {
        _inviteTeamSuggestions.value = teams
        _inviteTeamsLoading.value = false
    }

    fun failInviteTeamSearch() {
        _inviteTeamSuggestions.value = emptyList()
        _inviteTeamsLoading.value = false
    }

    fun clearInviteTeamSearch() {
        _inviteTeamSuggestions.value = emptyList()
        _inviteTeamsLoading.value = false
    }

    fun removeInviteTeamSuggestion(teamId: String) {
        val normalizedTeamId = teamId.trim().takeIf(String::isNotBlank) ?: return
        _inviteTeamSuggestions.value = _inviteTeamSuggestions.value.filterNot { candidate ->
            candidate.id.trim() == normalizedTeamId
        }
    }

    fun pendingStaffInviteDraft(
        firstName: String,
        lastName: String,
        email: String,
        roles: Set<EventStaffRole>,
    ): Result<PendingStaffInviteDraft> = runCatching {
        val normalizedDraft = PendingStaffInviteDraft(
            firstName = firstName.trim(),
            lastName = lastName.trim(),
            email = normalizeStaffInviteEmail(email),
            roles = roles,
        )
        if (normalizedDraft.email.isBlank()) error("Email is required.")
        if (normalizedDraft.roles.isEmpty()) error("Select at least one role.")

        val existingDraft = _pendingStaffInvites.value.firstOrNull { draft ->
            normalizeStaffInviteEmail(draft.email) == normalizedDraft.email
        }
        if (existingDraft != null && normalizedDraft.roles.all(existingDraft.roles::contains)) {
            error("That email is already added for the selected role.")
        }
        normalizedDraft
    }

    fun addPendingStaffInviteDraft(draft: PendingStaffInviteDraft) {
        _pendingStaffInvites.value = mergePendingStaffInviteDraft(
            existing = _pendingStaffInvites.value,
            draft = draft,
        )
    }

    fun removePendingStaffInvite(email: String, role: EventStaffRole?) {
        val normalizedEmail = normalizeStaffInviteEmail(email)
        if (normalizedEmail.isBlank()) {
            return
        }
        _pendingStaffInvites.value = _pendingStaffInvites.value.mapNotNull { draft ->
            if (normalizeStaffInviteEmail(draft.email) != normalizedEmail) {
                draft
            } else if (role == null) {
                null
            } else {
                val updatedRoles = draft.roles - role
                if (updatedRoles.isEmpty()) {
                    null
                } else {
                    draft.copy(roles = updatedRoles)
                }
            }
        }
    }

    fun clearPendingStaffInvites() {
        _pendingStaffInvites.value = emptyList()
    }
}
