package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithRelations
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.calcDistance
import dev.icerock.moko.geo.LatLng
import io.appwrite.Query
import io.github.aakira.napier.Napier
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first

class EventAbsRepository(
    private val eventRepository: IEventRepository,
    private val tournamentRepository: ITournamentRepository,
    private val userRepository: IUserRepository,
    private val teamRepository: ITeamRepository,
): IEventAbsRepository {
    override suspend fun getEvent(event: EventAbs): Result<EventAbsWithRelations> {
        val eventWithPlayers = when (event) {
            is EventImp -> eventRepository.getEvent(event.id)
            is Tournament -> tournamentRepository.getTournament(event.id)
        }
        return eventWithPlayers
    }

    override fun getEventsInBounds(bounds: Bounds, userLocation: LatLng): Flow<Result<List<EventAbsWithRelations>>> {
        val query = Query.and(
            listOf(
                Query.greaterThan(DbConstants.LAT_ATTRIBUTE, bounds.south),
                Query.lessThan(DbConstants.LAT_ATTRIBUTE, bounds.north),
                Query.greaterThan(DbConstants.LONG_ATTRIBUTE, bounds.west),
                Query.lessThan(DbConstants.LONG_ATTRIBUTE, bounds.east),
            )
        )

        return getEvents(query, userLocation)
    }

    override fun getEvents(query: String, userLocation: LatLng): Flow<Result<List<EventAbsWithRelations>>> {

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

    override suspend fun searchEvents(searchQuery: String, userLocation: LatLng): Flow<Result<List<EventAbsWithRelations>>> {
        val query = Query.contains("name", searchQuery)
        return getEvents(query, userLocation)
    }


    override suspend fun addCurrentUserToEvent(event: EventAbs): Result<Unit> {
        var currentUser = userRepository.getCurrentUserFlow().first().getOrNull()
        if (currentUser == null) {
            Napier.e("No current user")
            return Result.failure(Exception("No Current User"))
        }

        return eventRepository.getEvent(event.id).onSuccess { eventWithRelations ->
            if (eventWithRelations.players.size >= eventWithRelations.event.maxPlayers) {
                val result = when (event) {
                    is EventImp -> {
                        eventRepository.updateEvent(event.copy(waitList = event.waitList + currentUser!!.id))
                    }

                    is Tournament -> {
                        tournamentRepository.updateTournament(event.copy(waitList = event.waitList + currentUser!!.id))
                    }
                }
                return result.map {}
            }

            if (event.teamSignup) {
                val result = when (event) {
                    is EventImp -> {
                        eventRepository.updateEvent(event.copy(freeAgents = event.freeAgents + currentUser!!.id))
                    }

                    is Tournament -> {
                        tournamentRepository.updateTournament(event.copy(freeAgents = event.freeAgents + currentUser!!.id))
                    }
                }
                return result.map { }
            }

            currentUser = when (event.eventType) {
                EventType.EVENT -> {
                    currentUser!!.copy(tournamentIds = currentUser!!.tournamentIds + event.id)
                }

                EventType.TOURNAMENT -> {
                    currentUser!!.copy(eventIds = currentUser!!.tournamentIds + event.id)
                }
            }

            userRepository.updateUser(currentUser!!).map {}
        }.map {}
    }

    override suspend fun addTeamToEvent(event: EventAbs, team: TeamWithRelations): Result<Unit> {
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
                        player.copy(eventIds = player.tournamentIds + event.id)
                    }

                    is Tournament -> {
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