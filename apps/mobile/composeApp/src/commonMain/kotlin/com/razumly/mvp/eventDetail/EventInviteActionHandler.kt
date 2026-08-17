package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

internal class EventInviteActionHandler(
    private val scope: CoroutineScope,
    private val inviteCoordinator: EventInviteCoordinator,
    private val participantBootstrapCoordinator: EventParticipantBootstrapCoordinator,
    private val userRepository: IUserRepository,
    private val teamRepository: ITeamRepository,
    private val eventRepository: IEventRepository,
    private val loadingHandler: () -> LoadingHandler,
    private val selectedEvent: () -> Event,
    private val eventWithRelations: () -> EventWithFullRelations,
    private val selectedDivisionId: () -> String?,
    private val currentUserId: () -> String,
    private val requireSelectedWeeklyOccurrence: (Event, String) -> EventOccurrenceSelection?,
    private val setError: (ErrorMessage) -> Unit,
) {
    fun searchUsers(query: String) {
        if (normalizedInviteSearchQuery(query) == null) {
            inviteCoordinator.clearSuggestedUsers()
            return
        }
        scope.launch {
            inviteCoordinator.searchUsers(
                query = query,
                searchPlayers = userRepository::searchPlayers,
            )?.let(setError)
        }
    }

    fun searchInviteTeams(query: String) {
        val event = selectedEvent()
        if (normalizedInviteSearchQuery(query, minLength = 2) == null || !event.teamSignup) {
            inviteCoordinator.clearInviteTeamSearch()
            return
        }
        scope.launch {
            inviteCoordinator.searchInviteTeams(
                query = query,
                event = event,
                organizationId = currentInviteOrganizationId(event),
                sportName = currentInviteSportName(event),
                excludeTeamIds = eventParticipantTeamIdsForInviteSearch(event),
                searchTeams = { searchQuery, eventId, organizationId, sportName, excludeTeamIds ->
                    teamRepository.searchTeamsForEventInvite(
                        query = searchQuery,
                        eventId = eventId,
                        organizationId = organizationId,
                        sportName = sportName,
                        excludeTeamIds = excludeTeamIds,
                    )
                },
            )?.let(setError)
        }
    }

    fun inviteTeamToEvent(team: Team) {
        scope.launch {
            val event = selectedEvent()
            val occurrence = selectedOccurrenceOrNull(
                event,
                "Select an occurrence before inviting a team.",
            ) ?: if (isWeeklyParentEvent(event)) return@launch else null

            setError(
                inviteCoordinator.inviteTeamToEvent(
                    team = team,
                    event = event,
                    existingTeamIds = eventParticipantTeamIdsForInviteSearch(event),
                    selectedDivisionId = selectedDivisionId(),
                    occurrence = occurrence,
                    loadingHandler = loadingHandler(),
                    addTeam = eventRepository::addTeamToEvent,
                    refreshAfterMutation = participantBootstrapCoordinator::refreshEventAfterParticipantMutation,
                ),
            )
        }
    }

    fun invitePlayerToEvent(user: UserData) {
        scope.launch {
            val event = selectedEvent()
            val occurrence = selectedOccurrenceOrNull(
                event,
                "Select an occurrence before inviting a player.",
            ) ?: if (isWeeklyParentEvent(event)) return@launch else null

            setError(
                inviteCoordinator.invitePlayerToEvent(
                    user = user,
                    event = event,
                    existingUserIds = eventParticipantUserIdsForInviteSearch(event),
                    selectedDivisionId = selectedDivisionId(),
                    occurrence = occurrence,
                    loadingHandler = loadingHandler(),
                    addPlayer = eventRepository::addPlayerToEvent,
                    refreshAfterMutation = participantBootstrapCoordinator::refreshEventAfterParticipantMutation,
                ),
            )
        }
    }

    fun invitePlayerToEventByEmail(firstName: String, lastName: String, email: String) {
        scope.launch {
            val event = selectedEvent()
            setError(
                inviteCoordinator.invitePlayerToEventByEmail(
                    firstName = firstName,
                    lastName = lastName,
                    email = email,
                    event = event,
                    loadingHandler = loadingHandler(),
                    createInvite = { targetEvent, normalizedEmail, normalizedFirstName, normalizedLastName ->
                        createEventPlayerInvite(
                            event = targetEvent,
                            userId = null,
                            email = normalizedEmail,
                            firstName = normalizedFirstName,
                            lastName = normalizedLastName,
                        )
                    },
                ),
            )
        }
    }

    suspend fun addPendingStaffInvite(
        firstName: String,
        lastName: String,
        email: String,
        roles: Set<EventStaffRole>,
        editedEvent: Event,
    ): Result<Unit> = runCatching {
        val normalizedDraft = inviteCoordinator.pendingStaffInviteDraft(
            firstName = firstName,
            lastName = lastName,
            email = email,
            roles = roles,
        ).getOrThrow()

        val assignedUserIds = normalizedDraft.roles
            .flatMap { role -> editedEvent.assignedUserIdsForRole(role) }
            .distinct()
        if (assignedUserIds.isNotEmpty()) {
            val matches = userRepository.findEmailMembership(
                emails = listOf(normalizedDraft.email),
                userIds = assignedUserIds,
            ).getOrThrow()
            normalizedDraft.roles.forEach { role ->
                val roleUserIds = editedEvent.assignedUserIdsForRole(role)
                if (matches.any { match -> roleUserIds.contains(match.userId) }) {
                    error("${normalizedDraft.email} is already added in the ${role.conflictListLabel()}.")
                }
            }
        }

        inviteCoordinator.addPendingStaffInviteDraft(normalizedDraft)
    }.onFailure { error ->
        setError(ErrorMessage(error.userMessage("Unable to add staff invite.")))
    }

    fun removePendingStaffInvite(email: String, role: EventStaffRole?) {
        inviteCoordinator.removePendingStaffInvite(email, role)
    }

    private fun currentInviteOrganizationId(event: Event): String? {
        return resolveEventInviteOrganizationId(
            event = event,
            relationOrganizationId = eventWithRelations().organization?.id,
        )
    }

    private fun currentInviteSportName(event: Event): String? {
        return resolveEventInviteSportName(
            event = event,
            relationSportName = eventWithRelations().sport?.name,
        )
    }

    private fun eventParticipantTeamIdsForInviteSearch(event: Event): Set<String> =
        eventParticipantTeamIdsForInviteSearch(
            event = event,
            teams = eventWithRelations().teams,
        )

    private fun eventParticipantUserIdsForInviteSearch(event: Event): Set<String> =
        eventParticipantUserIdsForInviteSearch(
            event = event,
            players = eventWithRelations().players,
        )

    private suspend fun createEventPlayerInvite(
        event: Event,
        userId: String?,
        email: String?,
        firstName: String?,
        lastName: String?,
    ): Result<List<Invite>> {
        val invite = buildEventPlayerInviteRequest(
            event = event,
            organizationId = currentInviteOrganizationId(event),
            userId = userId,
            email = email,
            firstName = firstName,
            lastName = lastName,
            createdBy = currentUserId(),
        ).getOrElse { throwable ->
            return Result.failure(throwable)
        }
        return userRepository.createInvites(invites = listOf(invite))
    }

    private fun selectedOccurrenceOrNull(event: Event, errorMessage: String): EventOccurrenceSelection? {
        return if (isWeeklyParentEvent(event)) {
            requireSelectedWeeklyOccurrence(event, errorMessage)
        } else {
            null
        }
    }
}
