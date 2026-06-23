package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.emailAddressRegex
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

    suspend fun searchUsers(
        query: String,
        searchPlayers: suspend (String) -> Result<List<UserData>>,
    ): ErrorMessage? {
        val normalizedQuery = normalizedInviteSearchQuery(query)
        if (normalizedQuery == null) {
            clearSuggestedUsers()
            return null
        }

        replaceSuggestedUsers(
            searchPlayers(normalizedQuery)
                .getOrElse { error ->
                    return ErrorMessage(error.userMessage("Unable to search users."))
                },
        )
        return null
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

    suspend fun searchInviteTeams(
        query: String,
        event: Event,
        organizationId: String?,
        sportName: String?,
        excludeTeamIds: Set<String>,
        searchTeams: suspend (
            query: String,
            eventId: String,
            organizationId: String?,
            sportName: String?,
            excludeTeamIds: Set<String>,
        ) -> Result<List<Team>>,
    ): ErrorMessage? {
        val normalizedQuery = normalizedInviteSearchQuery(query, minLength = 2)
        if (normalizedQuery == null || !event.teamSignup) {
            clearInviteTeamSearch()
            return null
        }

        startInviteTeamSearch()
        return searchTeams(
            normalizedQuery,
            event.id,
            organizationId,
            sportName,
            excludeTeamIds,
        ).fold(
            onSuccess = { teams ->
                finishInviteTeamSearch(teams)
                null
            },
            onFailure = { error ->
                failInviteTeamSearch()
                ErrorMessage(error.userMessage("Unable to search teams."))
            },
        )
    }

    fun removeInviteTeamSuggestion(teamId: String) {
        val normalizedTeamId = teamId.trim().takeIf(String::isNotBlank) ?: return
        _inviteTeamSuggestions.value = _inviteTeamSuggestions.value.filterNot { candidate ->
            candidate.id.trim() == normalizedTeamId
        }
    }

    suspend fun inviteTeamToEvent(
        team: Team,
        event: Event,
        existingTeamIds: Set<String>,
        selectedDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
        loadingHandler: LoadingHandler,
        addTeam: suspend (
            event: Event,
            team: Team,
            preferredDivisionId: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<*>,
        refreshAfterMutation: suspend (eventId: String, warningMessage: String) -> Unit,
    ): ErrorMessage {
        val preflight = inviteTeamToEventPreflight(
            team = team,
            event = event,
            existingTeamIds = existingTeamIds,
        )
        if (!preflight.isAccepted) {
            return ErrorMessage(preflight.errorMessage ?: "Unable to add team.")
        }

        loadingHandler.showLoading("Adding team...")
        return try {
            addTeam(event, team, selectedDivisionId, occurrence)
                .fold(
                    onSuccess = {
                        refreshAfterMutation(
                            event.id,
                            "Failed to refresh event after adding team participant.",
                        )
                        removeInviteTeamSuggestion(preflight.normalizedId)
                        ErrorMessage("${team.name.ifBlank { "Team" }} added to the event.")
                    },
                    onFailure = { error ->
                        ErrorMessage(error.userMessage("Unable to add team."))
                    },
                )
        } finally {
            loadingHandler.hideLoading()
        }
    }

    suspend fun invitePlayerToEvent(
        user: UserData,
        event: Event,
        existingUserIds: Set<String>,
        selectedDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
        loadingHandler: LoadingHandler,
        addPlayer: suspend (
            event: Event,
            player: UserData,
            preferredDivisionId: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<*>,
        refreshAfterMutation: suspend (eventId: String, warningMessage: String) -> Unit,
    ): ErrorMessage {
        val preflight = invitePlayerToEventPreflight(
            user = user,
            event = event,
            existingUserIds = existingUserIds,
        )
        if (!preflight.isAccepted) {
            return ErrorMessage(preflight.errorMessage ?: "Unable to add player.")
        }

        loadingHandler.showLoading("Adding player...")
        return try {
            addPlayer(event, user, selectedDivisionId, occurrence)
                .fold(
                    onSuccess = {
                        refreshAfterMutation(
                            event.id,
                            "Failed to refresh event after adding player participant.",
                        )
                        removeSuggestedUser(preflight.normalizedId)
                        ErrorMessage("${user.fullName.ifBlank { "Player" }} added to the event.")
                    },
                    onFailure = { error ->
                        ErrorMessage(error.userMessage("Unable to add player."))
                    },
                )
        } finally {
            loadingHandler.hideLoading()
        }
    }

    suspend fun invitePlayerToEventByEmail(
        firstName: String,
        lastName: String,
        email: String,
        event: Event,
        loadingHandler: LoadingHandler,
        createInvite: suspend (
            event: Event,
            email: String,
            firstName: String,
            lastName: String,
        ) -> Result<List<Invite>>,
    ): ErrorMessage {
        val normalizedFirstName = firstName.trim()
        val normalizedLastName = lastName.trim()
        val normalizedEmail = email.trim().lowercase()
        if (normalizedFirstName.isBlank() || normalizedLastName.isBlank() || !normalizedEmail.matches(emailAddressRegex)) {
            return ErrorMessage("Enter first name, last name, and a valid email.")
        }
        if (event.teamSignup) {
            return ErrorMessage("This event accepts teams, not individual players.")
        }

        loadingHandler.showLoading("Sending invite...")
        return try {
            createInvite(event, normalizedEmail, normalizedFirstName, normalizedLastName)
                .fold(
                    onSuccess = {
                        ErrorMessage("Event invite sent to $normalizedEmail.")
                    },
                    onFailure = { error ->
                        ErrorMessage(error.userMessage("Unable to invite player by email."))
                    },
                )
        } finally {
            loadingHandler.hideLoading()
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
