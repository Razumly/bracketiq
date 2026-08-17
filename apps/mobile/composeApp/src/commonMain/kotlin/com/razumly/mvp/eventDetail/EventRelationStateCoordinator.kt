package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.activeStaffAssignments
import com.razumly.mvp.core.data.dataTypes.normalizedRole
import com.razumly.mvp.core.data.repositories.UserVisibilityContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

internal fun EventWithRelations.withInitialEventImageFallback(
    initialEvent: Event,
): EventWithRelations {
    val initialImageId = initialEvent.imageId.trim()
    if (initialImageId.isBlank() || event.id != initialEvent.id || event.imageId.isNotBlank()) {
        return this
    }
    return copy(event = event.copy(imageId = initialImageId))
}

internal fun resolveEventRelationTeamIds(
    event: Event,
    relations: EventWithRelations,
): List<String> {
    val registeredTeamIds = event.teamIds.normalizedTeamIds()
    return if (event.teamSignup) {
        registeredTeamIds
    } else {
        (registeredTeamIds + relations.teams.map { team -> team.id }).normalizedTeamIds()
    }
}

internal fun resolveCurrentUserManagedEventTeamId(
    eventTeamIds: Iterable<String>,
    teams: List<TeamWithPlayers>,
    currentUserId: String,
): String? {
    val normalizedUserId = currentUserId.trim()
    if (normalizedUserId.isBlank()) return null

    val registeredTeamIds = eventTeamIds.normalizedTeamIds().toSet()
    val candidateTeams = if (registeredTeamIds.isEmpty()) {
        teams
    } else {
        teams.filter { team -> team.team.id.trim() in registeredTeamIds }
    }
    return candidateTeams.firstOrNull { team ->
        team.team.managerId?.trim() == normalizedUserId ||
            team.team.headCoachId?.trim() == normalizedUserId ||
            team.team.coachIds.any { coachId -> coachId.trim() == normalizedUserId } ||
            team.team.activeStaffAssignments().any { assignment ->
                assignment.userId.trim() == normalizedUserId &&
                    assignment.normalizedRole() in MANAGED_EVENT_TEAM_ROLES
            }
    }?.team?.id
}

private val MANAGED_EVENT_TEAM_ROLES = setOf(
    "MANAGER",
    "HEAD_COACH",
    "ASSISTANT_COACH",
)

@OptIn(ExperimentalCoroutinesApi::class)
internal class EventRelationStateCoordinator(
    initialEvent: Event,
    currentUser: StateFlow<UserData>,
    observeEventRelations: (String) -> Flow<Result<EventWithRelations>>,
    observeEventMatches: (String) -> Flow<Result<List<MatchWithRelations>>>,
    observeEventTeams: (List<String>) -> Flow<Result<List<TeamWithPlayers>>>,
    observeUsers: (
        userIds: List<String>,
        visibilityContext: UserVisibilityContext,
    ) -> Flow<Result<List<UserData>>>,
    observeCurrentUserTeams: (String) -> Flow<Result<List<TeamWithPlayers>>>,
    scope: CoroutineScope,
    onEventRelationsError: (Throwable) -> Unit,
    onEventMatchesError: (Throwable) -> Unit,
    onEventTeamsError: (Throwable) -> Unit,
) {
    val eventRelations: StateFlow<EventWithRelations> =
        observeEventRelations(initialEvent.id).map { result ->
            result.getOrElse { error ->
                if (error !is NoSuchElementException) {
                    onEventRelationsError(error)
                }
                EventWithRelations(initialEvent, null)
            }.withInitialEventImageFallback(initialEvent)
        }.stateIn(
            scope,
            SharingStarted.Eagerly,
            EventWithRelations(initialEvent, null),
        )

    val selectedEvent: StateFlow<Event> = eventRelations
        .map { relations -> relations.event }
        .stateIn(scope, SharingStarted.Eagerly, initialEvent)

    val selectedEventId: StateFlow<String> = selectedEvent
        .map { event -> event.id.trim() }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.Eagerly, initialEvent.id.trim())

    val eventPlayers: StateFlow<List<UserData>> = eventRelations
        .map { relations -> relations.players }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val relationHost: StateFlow<UserData?> = eventRelations
        .map { relations -> relations.host }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.Eagerly, eventRelations.value.host)

    val eventTeamIds: StateFlow<List<String>> = combine(
        selectedEvent,
        eventRelations,
        ::resolveEventRelationTeamIds,
    )
        .distinctUntilChanged()
        .stateIn(
            scope,
            SharingStarted.Eagerly,
            initialEvent.teamIds.normalizedTeamIds(),
        )

    val eventMatches: StateFlow<List<MatchWithRelations>> = selectedEventId
        .flatMapLatest { eventId ->
            if (eventId.isBlank()) {
                flowOf(emptyList())
            } else {
                observeEventMatches(eventId).map { result ->
                    result.getOrElse { error ->
                        onEventMatchesError(error)
                        emptyList()
                    }
                }
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

    val eventTeams: StateFlow<List<TeamWithPlayers>> = eventTeamIds
        .flatMapLatest { teamIds ->
            if (teamIds.isEmpty()) {
                flowOf(emptyList())
            } else {
                observeEventTeams(teamIds).map { result ->
                    result.getOrElse { error ->
                        onEventTeamsError(error)
                        emptyList()
                    }
                }
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

    val eventHost: StateFlow<UserData?> = combine(
        selectedEvent
            .map { event -> event.id.trim() to event.hostId.trim() }
            .distinctUntilChanged(),
        relationHost,
    ) { (eventId, hostId), host ->
        Triple(eventId, hostId, host)
    }.flatMapLatest { (eventId, hostId, host) ->
        if (host != null || hostId.isBlank()) {
            flowOf(host)
        } else {
            observeUsers(
                listOf(hostId),
                UserVisibilityContext(eventId = eventId),
            ).map { result ->
                result.getOrElse { emptyList() }.firstOrNull()
            }
        }
    }.stateIn(scope, SharingStarted.Eagerly, eventRelations.value.host)

    val currentUserTeams: StateFlow<List<TeamWithPlayers>> = currentUser
        .map { user -> user.id.trim() }
        .distinctUntilChanged()
        .flatMapLatest { userId ->
            if (userId.isBlank()) {
                flowOf(emptyList())
            } else {
                observeCurrentUserTeams(userId).map { result ->
                    result.getOrElse { emptyList() }
                }
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

    val currentUserTeamIds: StateFlow<Set<String>> = currentUserTeams
        .map { teams ->
            teams.map { team -> team.team.id }.normalizedTeamIds().toSet()
        }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.Eagerly, emptySet())

    val currentUserManagedEventTeamId: StateFlow<String?> = combine(
        selectedEvent,
        eventTeams,
        currentUser,
    ) { event, teams, user ->
        resolveCurrentUserManagedEventTeamId(
            eventTeamIds = event.teamIds,
            teams = teams,
            currentUserId = user.id,
        )
    }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.Eagerly, null)
}
