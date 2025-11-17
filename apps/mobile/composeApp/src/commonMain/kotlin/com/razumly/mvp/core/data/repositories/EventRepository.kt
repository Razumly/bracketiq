package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.dtos.EventDTO
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.toEventDTO
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.calcDistance
import com.razumly.mvp.core.util.convert
import dev.icerock.moko.geo.LatLng
import io.appwrite.Query
import io.appwrite.extensions.json
import io.appwrite.services.Functions
import io.appwrite.services.TablesDB
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.Contextual
import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

interface IEventRepository : IMVPRepository {
    fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>>
    fun resetCursor()
    suspend fun getEvent(eventId: String): Result<Event>
    suspend fun createEvent(newEvent: Event): Result<Event>
    suspend fun updateEvent(newEvent: Event): Result<Event>
    suspend fun updateLocalEvent(newEvent: Event): Result<Event>
    suspend fun getEvents(query: String): Result<List<Event>>
    fun getEventsFlow(query: String): Flow<Result<List<Event>>>
    fun getEventsInBoundsFlow(bounds: Bounds): Flow<Result<List<Event>>>
    suspend fun getEventsInBounds(bounds: Bounds): Result<Pair<List<Event>, Boolean>>
    fun searchEventsFlow(searchQuery: String, userLocation: LatLng): Flow<Result<List<Event>>>
    suspend fun searchEvents(
        searchQuery: String,
        userLocation: LatLng
    ): Result<Pair<List<Event>, Boolean>>
    fun getEventsByHostFlow(hostId: String): Flow<Result<List<Event>>>
    suspend fun deleteEvent(eventId: String): Result<Unit>
    suspend fun addCurrentUserToEvent(event: Event): Result<Unit>
    suspend fun addTeamToEvent(event: Event, team: Team): Result<Unit>
    suspend fun removeTeamFromEvent(event: Event, teamWithPlayers: TeamWithPlayers): Result<Unit>
    suspend fun removeCurrentUserFromEvent(event: Event): Result<Unit>
}

class EventRepository(
    private val databaseService: DatabaseService,
    private val tablesDb: TablesDB,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
    private val notificationsRepository: IPushNotificationsRepository,
    private val functions: Functions,
) : IEventRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var lastDocumentId = ""

    init {
        scope.launch {
            databaseService.getEventDao.deleteAllEvents()
        }
    }

    override fun resetCursor() {
        lastDocumentId = ""
    }

    override fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>> =
        callbackFlow {
            val localJob = launch {
                databaseService.getEventDao.getEventWithRelationsFlow(eventId)
                    .collect { local ->
                        trySend(Result.success(local))
                    }
            }

            val remoteJob = launch {
                getEvent(eventId).onFailure { error ->
                    trySend(Result.failure(error))
                }
            }

            awaitClose {
                localJob.cancel()
                remoteJob.cancel()
            }
        }

    private suspend fun fetchRemoteEvent(eventId: String): Event {
        val event = tablesDb.getRow<EventDTO>(
            databaseId = DbConstants.DATABASE_NAME,
            tableId = DbConstants.EVENT_TABLE,
            rowId = eventId,
            nestedType = EventDTO::class
        ).data.toEvent(eventId)

        val players = if (event.playerIds.isNotEmpty()) {
            userRepository.getUsers(event.playerIds).getOrThrow()
        } else {
            emptyList()
        }
        val host = userRepository.getUsers(listOf(event.hostId)).getOrThrow()
        val teams = if (event.teamIds.isNotEmpty()) {
            teamRepository.getTeams(event.teamIds).getOrThrow()
        } else {
            emptyList()
        }

        insertEventCrossReferences(
            eventId = eventId,
            players = players,
            host = host,
            teams = teams
        )

        return event
    }

    private suspend fun insertEventCrossReferences(
        eventId: String, players: List<UserData>, host: List<UserData>, teams: List<Team>
    ) {
        databaseService.getEventDao.deleteEventCrossRefs(eventId)

        databaseService.getEventDao.upsertEventTeamCrossRefs(
            teams.map { EventTeamCrossRef(it.id, eventId) })
        databaseService.getUserDataDao.upsertUserEventCrossRefs(
            (players).map { EventUserCrossRef(it.id, eventId) })
        databaseService.getTeamDao.upsertTeamPlayerCrossRefs(
            teams.flatMap { team ->
                team.playerIds.map { playerId ->
                    TeamPlayerCrossRef(team.id, playerId)
                }
            })
    }

    override suspend fun getEvent(eventId: String): Result<Event> =
        singleResponse(networkCall = {
            fetchRemoteEvent(eventId)
        }, saveCall = { event ->
            databaseService.getEventDao.upsertEvent(event)
        }, onReturn = {
            databaseService.getEventDao.getEventById(eventId)
                ?: throw IllegalStateException("Event $eventId not cached")
        })

    override suspend fun createEvent(newEvent: Event): Result<Event> =
        singleResponse(networkCall = {
            notificationsRepository.createEventTopic(newEvent)
            tablesDb.createRow<EventDTO>(
                databaseId = DbConstants.DATABASE_NAME,
                tableId = DbConstants.EVENT_TABLE,
                rowId = newEvent.id,
                data = newEvent.toEventDTO(),
                nestedType = EventDTO::class
            ).data.toEvent(newEvent.id)
        }, saveCall = { event ->
            databaseService.getEventDao.upsertEvent(event)
        }, onReturn = { event ->
            event
        })

    override suspend fun updateEvent(newEvent: Event): Result<Event> =
        singleResponse(networkCall = {
            tablesDb.updateRow<EventDTO>(
                databaseId = DbConstants.DATABASE_NAME,
                tableId = DbConstants.EVENT_TABLE,
                rowId = newEvent.id,
                data = newEvent.toEventDTO(),
                nestedType = EventDTO::class
            ).data.toEvent(newEvent.id)
        }, saveCall = { event ->
            databaseService.getEventDao.upsertEvent(event)
        }, onReturn = { event ->
            event
        })

    override suspend fun getEvents(query: String): Result<List<Event>> {
        val combinedQuery = if (lastDocumentId.isNotEmpty()) {
            listOf(query, Query.cursorAfter(lastDocumentId))
        } else {
            listOf(query)
        }
        val response = multiResponse(
            getRemoteData = {
            tablesDb.listRows<EventDTO>(
                databaseId = DbConstants.DATABASE_NAME,
                tableId = DbConstants.EVENT_TABLE,
                queries = combinedQuery,
                nestedType = EventDTO::class
            ).rows.map { dtoRow -> dtoRow.convert { it.toEvent(dtoRow.id) }.data }
        },
            getLocalData = { emptyList() },
            saveData = { databaseService.getEventDao.upsertEvents(it) },
            deleteData = { })

        if (response.isSuccess) {
            lastDocumentId = response.getOrNull()?.lastOrNull()?.id ?: ""
        }
        return response
    }

    override suspend fun updateLocalEvent(newEvent: Event): Result<Event> {
        databaseService.getEventDao.upsertEvent(newEvent)
        return Result.success(newEvent)
    }

    override fun getEventsFlow(query: String): Flow<Result<List<Event>>> {
        val queryMap = json.decodeFromString<Map<String, @Contextual Any>>(query)
        val filterMap = if (queryMap.containsValue("equal")) {
            { event: Event ->
                (queryMap["values"] as List<*>).first() == event.hostId
            }
        } else {
            { event: Event -> true }
        }

        val localFlow = databaseService.getEventDao.getAllCachedEvents().map {
            Result.success(it.filter { event ->
                filterMap(event)
            })
        }
        return localFlow
    }

    override fun getEventsInBoundsFlow(bounds: Bounds): Flow<Result<List<Event>>> {
        val query = buildBoundsQuery(bounds)
        return getEventsFlow(query).map { result ->
            result.map { events ->
                events.sortedBy { calcDistance(bounds.center, LatLng(it.lat, it.long)) }
            }
        }
    }

    override suspend fun getEventsInBounds(bounds: Bounds): Result<Pair<List<Event>, Boolean>> {
        val query = buildBoundsQuery(bounds)
        return getEvents(query).map { events ->
            Pair(
                events.sortedBy { calcDistance(bounds.center, LatLng(it.lat, it.long)) },
                false
            )
        }
    }

    override fun searchEventsFlow(
        searchQuery: String,
        userLocation: LatLng
    ): Flow<Result<List<Event>>> {
        val query = Query.contains("name", searchQuery)
        return getEventsFlow(query).map { result ->
            result.map { events ->
                events.sortedBy { calcDistance(userLocation, LatLng(it.lat, it.long)) }
            }
        }
    }

    override suspend fun searchEvents(
        searchQuery: String,
        userLocation: LatLng
    ): Result<Pair<List<Event>, Boolean>> {
        val query = Query.contains("name", searchQuery)
        return getEvents(query).map { events ->
            Pair(
                events.sortedBy { calcDistance(userLocation, LatLng(it.lat, it.long)) },
                false
            )
        }
    }

    override fun getEventsByHostFlow(hostId: String): Flow<Result<List<Event>>> =
        getEventsFlow(Query.equal("hostId", hostId))

    override suspend fun addCurrentUserToEvent(event: Event): Result<Unit> =
        runCatching {
            val currentUser = userRepository.currentUser.value.getOrThrow()
            executeEventEdit(
                EditEventRequest(
                    eventId = event.id,
                    userId = currentUser.id,
                    isTournament = event.eventType == EventType.TOURNAMENT,
                    command = "addParticipant"
                )
            )
        }

    override suspend fun addTeamToEvent(event: Event, team: Team): Result<Unit> =
        runCatching {
            if (event.waitList.contains(team.id)) {
                throw Exception("Team already in waitlist")
            }
            executeEventEdit(
                EditEventRequest(
                    eventId = event.id,
                    teamId = team.id,
                    isTournament = event.eventType == EventType.TOURNAMENT,
                    command = "addParticipant"
                )
            )
        }

    override suspend fun removeTeamFromEvent(
        event: Event,
        teamWithPlayers: TeamWithPlayers
    ): Result<Unit> =
        runCatching {
            executeEventEdit(
                EditEventRequest(
                    eventId = event.id,
                    teamId = teamWithPlayers.team.id,
                    isTournament = event.eventType == EventType.TOURNAMENT,
                    command = "removeParticipant"
                )
            )
        }

    override suspend fun removeCurrentUserFromEvent(event: Event): Result<Unit> {
        val currentUser = userRepository.currentUser.value.getOrThrow()
        return removePlayerFromEvent(event, currentUser.id)
    }

    override suspend fun deleteEvent(eventId: String): Result<Unit> = runCatching {
        databaseService.getEventDao.deleteEventWithCrossRefs(eventId)
    }

    private fun buildBoundsQuery(bounds: Bounds): String {
        val distanceMeters = bounds.radiusMiles * 1609.34
        return Query.distanceLessThan(
            DbConstants.COORDINATES_ATTRIBUTE,
            listOf(bounds.center.longitude, bounds.center.latitude),
            distanceMeters
        )
    }

    private suspend fun executeEventEdit(request: EditEventRequest) {
        val response = functions.createExecution(
            DbConstants.EVENT_MANAGER_FUNCTION,
            Json.encodeToString(request)
        )
        val result = Json.decodeFromString<EditEventResponse>(response.responseBody)
        if (!result.error.isNullOrBlank()) {
            throw Exception(result.error)
        }
    }

    private suspend fun removePlayerFromEvent(event: Event, userId: String): Result<Unit> =
        runCatching {
            executeEventEdit(
                EditEventRequest(
                    eventId = event.id,
                    userId = userId,
                    isTournament = event.eventType == EventType.TOURNAMENT,
                    command = "removeParticipant"
                )
            )
        }
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

@kotlinx.serialization.Serializable
data class EditEventResponse(
    val message: String? = "",
    val error: String? = ""
)
