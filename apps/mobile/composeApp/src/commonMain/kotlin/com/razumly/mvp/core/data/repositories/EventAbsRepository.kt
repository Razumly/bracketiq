package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithRelations
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.calcDistance
import dev.icerock.moko.geo.LatLng
import io.appwrite.Query
import io.github.aakira.napier.Napier
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

class EventAbsRepository(
    private val eventRepository: IEventRepository,
    private val tournamentRepository: ITournamentRepository,
    private val userRepository: IUserRepository,
    private val teamRepository: ITeamRepository,
): IEventAbsRepository {
    override suspend fun getEvent(event: EventAbs): Result<EventAbsWithRelations> {
        val eventWithRelations = when (event) {
            is EventImp -> eventRepository.getEvent(event.id)
            is Tournament -> tournamentRepository.getTournament(event.id)
        }
        return eventWithRelations
    }

    override fun getEventWithRelationsFlow(event: EventAbs): Flow<Result<EventAbsWithRelations>> {
        val eventWithRelations = when (event) {
            is EventImp -> eventRepository.getEventWithRelationsFlow(event.id)
            is Tournament -> tournamentRepository.getTournamentWithRelationsFlow(event.id)
        }
        return eventWithRelations
    }

    override suspend fun getEventsInBounds(bounds: Bounds): Result<List<EventAbs>> {
        val query = Query.and(
            listOf(
                Query.greaterThan(DbConstants.LAT_ATTRIBUTE, bounds.south),
                Query.lessThan(DbConstants.LAT_ATTRIBUTE, bounds.north),
                Query.greaterThan(DbConstants.LONG_ATTRIBUTE, bounds.west),
                Query.lessThan(DbConstants.LONG_ATTRIBUTE, bounds.east),
            )
        )

        return getEvents(query, bounds.center)
    }

    private suspend fun getEvents(query: String, userLocation: LatLng): Result<List<EventAbs>> {
        val eventResults = eventRepository.getEvents(query)
        val tournamentResults = tournamentRepository.getTournaments(query)

        val result = eventResults.onSuccess { events ->
            tournamentResults.onSuccess { tournaments ->
                val combinedEvents: List<EventAbs> = events + tournaments
            }
        }

        return result.map { events ->
            events.sortedBy {
                calcDistance(
                    userLocation, LatLng(it.lat, it.long)
                )
            }
        }
    }

    override fun getEventsInBoundsFlow(bounds: Bounds): Flow<Result<List<EventAbsWithRelations>>> {
        val query = Query.and(
            listOf(
                Query.greaterThan(DbConstants.LAT_ATTRIBUTE, bounds.south),
                Query.lessThan(DbConstants.LAT_ATTRIBUTE, bounds.north),
                Query.greaterThan(DbConstants.LONG_ATTRIBUTE, bounds.west),
                Query.lessThan(DbConstants.LONG_ATTRIBUTE, bounds.east),
            )
        )

        return searchEventsFlow(query, bounds.center)
    }

    private fun getEventsFlow(query: String, userLocation: LatLng): Flow<Result<List<EventAbsWithRelations>>> {
        val eventsFlow = eventRepository.getEventsFlow(query)
        val tournamentsFlow = tournamentRepository.getTournamentsFlow(query)

        return combine(eventsFlow, tournamentsFlow) { events, tournaments ->
            runCatching {
                val combinedEvents: List<EventAbsWithRelations> = events.getOrDefault(emptyList()) + tournaments.getOrDefault(
                    emptyList())
                combinedEvents.sortedBy { calcDistance(userLocation, LatLng(it.event.lat, it.event.long)) }
            }
        }
    }

    override suspend fun searchEvents(searchQuery: String, userLocation: LatLng): Result<List<EventAbs>> {
        val query = Query.contains("name", searchQuery)
        return getEvents(query, userLocation)
    }

    override fun searchEventsFlow(searchQuery: String, userLocation: LatLng): Flow<Result<List<EventAbsWithRelations>>> {
        val query = Query.contains("name", searchQuery)
        return getEventsFlow(query, userLocation)
    }


    override suspend fun addCurrentUserToEvent(event: EventAbs): Result<Unit> {
        val currentUser = userRepository.currentUserFlow.value
        if (currentUser == null) {
            Napier.e("No current user")
            return Result.failure(Exception("No Current User"))
        }
        when (event) {
            is EventImp -> {
                eventRepository.getEvent(event.id).onSuccess { eventWithRelations ->
                    if (eventWithRelations.players.size >= eventWithRelations.event.maxPlayers) {
                        eventRepository.updateEvent(event.copy(waitList = event.waitList + currentUser.id))
                    }
                    if (event.teamSignup) {
                        eventRepository.updateEvent(event.copy(freeAgents = event.freeAgents + currentUser.id))
                    }
                }
            }

            is Tournament -> {
                tournamentRepository.getTournament(event.id).onSuccess { tournamentWithPlayers ->
                    if (tournamentWithPlayers.players.size >= tournamentWithPlayers.event.maxPlayers) {
                        tournamentRepository.updateTournament(event.copy(waitList = event.waitList + currentUser.id))
                    }
                    if (event.teamSignup) {
                        tournamentRepository.updateTournament(event.copy(freeAgents = event.freeAgents + currentUser.id))
                    }
                }
            }
        }.onFailure {
            return Result.failure(it)
        }

        val updatedUser = when (event.eventType) {
            EventType.EVENT -> {
                currentUser.copy(eventIds = currentUser.eventIds + event.id)
            }

            EventType.TOURNAMENT -> {
                currentUser.copy(tournamentIds = currentUser.tournamentIds + event.id)
            }
        }
        return userRepository.updateUser(updatedUser).map {}
    }

    override suspend fun addTeamToEvent(event: EventAbs, team: TeamWithPlayers): Result<Unit> {
        if (event.waitList.contains(team.team.id)) {
            return Result.failure(Exception("Team already in waitlist"))
        }
        return getEvent(event).onSuccess { eventWithPlayers ->
            if (eventWithPlayers.players.size >= eventWithPlayers.event.maxPlayers) {
                val waitlist = event.waitList + team.team.id
                val result = when (event) {
                    is EventImp -> {
                        eventRepository.updateEvent(event.copy(waitList = waitlist))

                    }
                    is Tournament -> {
                        tournamentRepository.updateTournament(event.copy(waitList = event.waitList + team.team.id))
                    }
                }
                return result.map {}
            }
            team.players.forEach { player ->
                if (eventWithPlayers.players.contains(player)) {
                    return Result.failure(Exception("Player already in event: ${player.firstName}, ${player.lastName}"))
                }
                val updatedPlayer = when (event) {
                    is EventImp -> {
                        if (event.freeAgents.contains(player.id)) {
                            eventRepository.updateEvent(event.copy(freeAgents = event.freeAgents - player.id))
                        }
                        player.copy(eventIds = player.tournamentIds + event.id)
                    }

                    is Tournament -> {
                        if (event.freeAgents.contains(player.id)) {
                            tournamentRepository.updateTournament(event.copy(freeAgents = event.freeAgents - player.id))
                        }
                        player.copy(tournamentIds = player.tournamentIds + event.id)
                    }
                }

                userRepository.updateUser(updatedPlayer).onFailure {
                    Napier.e("Failed to add player to event: player-${player.id}, ${event.eventType}-${event.id}")
                }
            }

            val updatedTeam = when (event) {
                is EventImp -> {
                    team.team.copy(eventIds = team.team.eventIds + event.id)
                }

                is Tournament -> {
                    team.team.copy(tournamentIds = team.team.tournamentIds + event.id)
                }
            }

            teamRepository.updateTeam(updatedTeam)
        }.map {}
    }
}