package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithRelations
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.calcDistance
import dev.icerock.moko.geo.LatLng
import io.appwrite.Query
import io.appwrite.services.Functions
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

interface IEventAbsRepository : IMVPRepository {
    fun getEventWithRelationsFlow(event: EventAbs): Flow<Result<EventAbsWithRelations>>
    fun getEventsInBoundsFlow(bounds: Bounds): Flow<Result<List<EventAbs>>>
    fun searchEventsFlow(searchQuery: String, userLocation: LatLng): Flow<Result<List<EventAbs>>>
    fun getUsersEventsFlow(): Flow<Result<List<EventAbs>>>
    fun resetCursor()
    suspend fun createEvent(event: EventAbs): Result<Unit>
    suspend fun updateEvent(event: EventAbs): Result<Unit>
    suspend fun deleteEvent(event: EventAbs): Result<Unit>
    suspend fun updateLocalEvent(event: EventAbs): Result<Unit>
    suspend fun removeTeamFromEvent(event: EventAbs, teamWithPlayers: TeamWithPlayers): Result<Unit>
    suspend fun removeCurrentUserFromEvent(event: EventAbs): Result<Unit>
    suspend fun getEvent(event: EventAbs): Result<EventAbsWithRelations>
    suspend fun getEventsInBounds(bounds: Bounds): Result<Pair<List<EventAbs>, Boolean>>
    suspend fun searchEvents(
        searchQuery: String, userLocation: LatLng
    ): Result<Pair<List<EventAbs>, Boolean>>

    suspend fun addCurrentUserToEvent(event: EventAbs): Result<Unit>
    suspend fun addTeamToEvent(event: EventAbs, team: Team): Result<Unit>
    suspend fun getUsersEvents(): Result<Pair<List<EventAbs>, Boolean>>
}

class EventAbsRepository(
    private val eventRepository: IEventRepository,
    private val tournamentRepository: ITournamentRepository,
    private val userRepository: IUserRepository,
    private val teamRepository: ITeamRepository,
    private val functions: Functions,
) : IEventAbsRepository {
    override fun resetCursor() {
        eventRepository.resetCursor()
        tournamentRepository.resetCursor()
    }

    override suspend fun getEvent(event: EventAbs): Result<EventAbsWithRelations> {
        val eventWithRelations = when (event) {
            is EventImp -> eventRepository.getEvent(event.id)
            is Tournament -> tournamentRepository.getTournamentWithRelations(event.id)
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

    override suspend fun getEventsInBounds(bounds: Bounds): Result<Pair<List<EventAbs>, Boolean>> {
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

    private suspend fun getEvents(
        query: String, userLocation: LatLng?
    ): Result<Pair<List<EventAbs>, Boolean>> {
        val eventResults = eventRepository.getEvents(query)
        val tournamentResults = tournamentRepository.getTournaments(query)

        val result = runCatching {
            val events = eventResults.getOrThrow()
            val tournaments = tournamentResults.getOrThrow()
            events + tournaments
        }

        return if (userLocation != null) {
            result.map { events ->
                Pair(events.sortedBy {
                    calcDistance(
                        userLocation, LatLng(it.lat, it.long)
                    )
                }, false)
            }
        } else {
            result.map { events ->
                Pair(events.sortedBy {
                    it.start
                }, false)
            }
        }
    }

    override fun getEventsInBoundsFlow(bounds: Bounds): Flow<Result<List<EventAbs>>> {
        val query = Query.and(
            listOf(
                Query.greaterThan(DbConstants.LAT_ATTRIBUTE, bounds.south),
                Query.lessThan(DbConstants.LAT_ATTRIBUTE, bounds.north),
                Query.greaterThan(DbConstants.LONG_ATTRIBUTE, bounds.west),
                Query.lessThan(DbConstants.LONG_ATTRIBUTE, bounds.east),
            )
        )

        return getEventsFlow(query, bounds.center)
    }

    private fun getEventsFlow(query: String, userLocation: LatLng): Flow<Result<List<EventAbs>>> {
        val eventsFlow = eventRepository.getEventsFlow(query)
        val tournamentsFlow = tournamentRepository.getTournamentsFlow(query)

        return combine(eventsFlow, tournamentsFlow) { events, tournaments ->
            runCatching {
                val combinedEvents: List<EventAbs> =
                    events.getOrDefault(emptyList()) + tournaments.getOrDefault(
                        emptyList()
                    )
                combinedEvents.sortedBy { calcDistance(userLocation, LatLng(it.lat, it.long)) }
            }
        }
    }

    override suspend fun createEvent(event: EventAbs): Result<Unit> {
        return when (event.eventType) {
            EventType.TOURNAMENT -> tournamentRepository.createTournament(event as Tournament)
            EventType.EVENT -> eventRepository.createEvent(event as EventImp)
        }.map {}
    }

    override suspend fun updateEvent(event: EventAbs): Result<Unit> {
        return when (event) {
            is EventImp -> {
                eventRepository.updateEvent(event)
            }

            is Tournament -> {
                tournamentRepository.updateTournament(event)
            }
        }.map {}
    }

    override suspend fun deleteEvent(event: EventAbs): Result<Unit> = runCatching {
        functions.createExecution(
            DbConstants.EVENT_MANAGER_FUNCTION, Json.encodeToString(
                EditEventRequest(
                    eventId = event.id,
                    isTournament = (event.eventType == EventType.TOURNAMENT),
                    command = "deleteEvent"
                )
            )
        )
        when (event) {
            is EventImp -> {
                eventRepository.deleteEvent(event.id)
            }
            is Tournament -> {
                tournamentRepository.deleteTournament(event.id)
            }
        }.map {}
    }

    override fun getUsersEventsFlow(): Flow<Result<List<EventAbs>>> {
        return eventRepository.getEventsFlow(
            Query.equal(
                "hostId", userRepository.currentUser.value.getOrThrow().id
            )
        )
    }

    override suspend fun getUsersEvents(): Result<Pair<List<EventAbs>, Boolean>> {
        val query = Query.equal("hostId", userRepository.currentUser.value.getOrThrow().id)
        return getEvents(query, null)
    }

    override suspend fun searchEvents(
        searchQuery: String, userLocation: LatLng
    ): Result<Pair<List<EventAbs>, Boolean>> {
        val query = Query.contains("name", searchQuery)
        return getEvents(query, userLocation)
    }

    override fun searchEventsFlow(
        searchQuery: String, userLocation: LatLng
    ): Flow<Result<List<EventAbs>>> {
        val query = Query.contains("name", searchQuery)
        return getEventsFlow(query, userLocation)
    }

    override suspend fun removeTeamFromEvent(
        event: EventAbs, teamWithPlayers: TeamWithPlayers
    ): Result<Unit> = runCatching {
        val team = teamWithPlayers.team
        val response = functions.createExecution(
            DbConstants.EVENT_MANAGER_FUNCTION, Json.encodeToString(
                EditEventRequest(
                    eventId = event.id,
                    teamId = team.id,
                    isTournament = (event.eventType.name == "TOURNAMENT"),
                    command = "removeParticipant"
                )
            )
        )

        if (response.responseBody.isNotBlank()) {
            val editEventResponse = Json.decodeFromString<EditEventResponse>(response.responseBody)
            return if (editEventResponse.error.isNullOrBlank()) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(editEventResponse.error))
            }
        } else {
            return Result.failure(Exception("Failed to remove team from event"))
        }
    }

    private suspend fun removePlayerFromEvent(event: EventAbs, player: UserData): Result<Unit> = runCatching {
        val response = functions.createExecution(
            DbConstants.EVENT_MANAGER_FUNCTION, Json.encodeToString(
                EditEventRequest(
                    eventId = event.id,
                    userId = player.id,
                    isTournament = (event.eventType.name == "TOURNAMENT"),
                    command = "removeParticipant"
                )
            )
        )

        if (response.responseBody.isNotBlank()) {
            val editEventResponse = Json.decodeFromString<EditEventResponse>(response.responseBody)
            return if (editEventResponse.error.isNullOrBlank()) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(editEventResponse.error))
            }
        } else {
            return Result.failure(Exception("Failed to remove player from event"))
        }
    }

    override suspend fun removeCurrentUserFromEvent(event: EventAbs): Result<Unit> {
        val currentUser = userRepository.currentUser.value.getOrThrow()

        return removePlayerFromEvent(event, currentUser)
    }

    override suspend fun addCurrentUserToEvent(event: EventAbs): Result<Unit> = runCatching {
        val currentUser = userRepository.currentUser.value.getOrThrow()
        val response = functions.createExecution(
            DbConstants.EVENT_MANAGER_FUNCTION, Json.encodeToString(
                EditEventRequest(
                    eventId = event.id,
                    userId = currentUser.id,
                    isTournament = (event.eventType.name == "TOURNAMENT"),
                    command = "addParticipant"
                )
            )
        )

        if (response.responseBody.isNotBlank()) {
            val editEventResponse = Json.decodeFromString<EditEventResponse>(response.responseBody)
            return if (editEventResponse.error.isNullOrBlank()) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(editEventResponse.error))
            }
        } else {
            return Result.failure(Exception("Failed to add user to event"))
        }
    }

    override suspend fun addTeamToEvent(event: EventAbs, team: Team): Result<Unit> = runCatching {
        if (event.waitList.contains(team.id)) {
            throw Exception("Team already in waitlist")
        }

        val response = functions.createExecution(
            DbConstants.EVENT_MANAGER_FUNCTION, Json.encodeToString(
                EditEventRequest(
                    teamId = team.id,
                    eventId = event.id,
                    isTournament = (event.eventType.name == "TOURNAMENT"),
                    command = "addParticipant"
                )
            )
        )

        if (response.responseBody.isNotBlank()) {
            val editEventResponse = Json.decodeFromString<EditEventResponse>(response.responseBody)
            return if (editEventResponse.error.isNullOrBlank()) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(editEventResponse.error))
            }
        } else {
            return Result.failure(Exception("Failed to add team to event"))
        }
    }

    override suspend fun updateLocalEvent(event: EventAbs): Result<Unit> = when (event) {
        is EventImp -> {
            eventRepository.updateLocalEvent(event)
        }

        is Tournament -> {
            tournamentRepository.updateLocalTournament(event)
        }
    }.map {}
}

@Serializable
@OptIn(ExperimentalSerializationApi::class)
data class EditEventRequest(
    @EncodeDefault val task: String = "editEvent",
    val eventId: String,
    val userId: String? = null,
    val teamId: String? = null,
    val isTournament: Boolean,
    val command: String
)

@Serializable
data class EditEventResponse(
    val message: String? = "", val error: String? = ""
)