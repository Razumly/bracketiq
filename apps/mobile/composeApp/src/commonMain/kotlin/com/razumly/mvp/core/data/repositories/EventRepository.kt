package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.dtos.EventDTO
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.convert
import io.appwrite.Query
import io.appwrite.extensions.json
import io.appwrite.services.Databases
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

interface IEventRepository : IMVPRepository {
    fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>>
    fun resetCursor()
    suspend fun getEvent(eventId: String): Result<EventWithRelations>
    suspend fun createEvent(newEvent: Event): Result<Event>
    suspend fun updateEvent(newEvent: Event): Result<Event>
    suspend fun updateLocalEvent(newEvent: Event): Result<Event>
    suspend fun getEvents(query: String): Result<List<Event>>
    fun getEventsFlow(query: String): Flow<Result<List<Event>>>
    suspend fun deleteEvent(eventId: String): Result<Unit>
}

class EventRepository(
    private val databaseService: DatabaseService,
    private val database: Databases,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
    private val notificationsRepository: IPushNotificationsRepository
) : IEventRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var lastDocumentId = ""

    init {
        scope.launch {
            databaseService.getEventImpDao.deleteAllEvents()
        }
    }

    override fun resetCursor() {
        lastDocumentId = ""
    }

    override fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>> =
        callbackFlow {
            val localJob = launch {
                databaseService.getEventImpDao.getEventWithRelationsFlow(eventId)
                    .collect { trySend(Result.success(it)) }
            }

            val remoteJob = launch {
                getEvent(eventId).onSuccess { eventWithRelations ->
                    val event = eventWithRelations.event
                    val playersResult = if (event.playerIds.isNotEmpty()) {
                        userRepository.getUsers(event.playerIds)
                    } else Result.success(emptyList())
                    val hostResult = userRepository.getUsers(listOf(event.hostId))
                    val teamsResult = if (event.teamIds.isNotEmpty()) {
                        teamRepository.getTeams(event.teamIds)
                    } else Result.success(emptyList())

                    listOf(playersResult, hostResult, teamsResult).forEach { result ->
                        result.onFailure { error -> trySend(Result.failure(error)) }
                    }

                    insertEventCrossReferences(
                        eventId = eventId,
                        players = playersResult.getOrThrow(),
                        host = hostResult.getOrThrow(),
                        teams = teamsResult.getOrThrow()
                    )
                }.onFailure { error ->
                    trySend(Result.failure(error))
                }
            }

            awaitClose {
                localJob.cancel()
                remoteJob.cancel()
            }
        }

    private suspend fun insertEventCrossReferences(
        eventId: String, players: List<UserData>, host: List<UserData>, teams: List<Team>
    ) {
        databaseService.getEventImpDao.deleteEventCrossRefs(eventId)

        databaseService.getEventImpDao.upsertEventTeamCrossRefs(
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

    override suspend fun getEvent(eventId: String): Result<EventWithRelations> =
        singleResponse(networkCall = {
            database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.EVENT_COLLECTION,
                eventId,
                nestedType = EventDTO::class,
                queries = null
            ).data.toEvent(eventId)
        }, saveCall = { event ->
            databaseService.getEventImpDao.upsertEvent(event)
        }, onReturn = {
            databaseService.getEventImpDao.getEventWithRelationsById(eventId)
        })

    override suspend fun createEvent(newEvent: Event): Result<Event> =
        singleResponse(networkCall = {
            notificationsRepository.createEventTopic(newEvent)
            database.createDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.EVENT_COLLECTION,
                newEvent.id,
                newEvent.toEventDTO(),
                nestedType = EventDTO::class
            ).data.toEvent(newEvent.id)
        }, saveCall = { event ->
            databaseService.getEventImpDao.upsertEvent(event)
        }, onReturn = { event ->
            event
        })

    override suspend fun updateEvent(newEvent: Event): Result<Event> =
        singleResponse(networkCall = {
            database.updateDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.EVENT_COLLECTION,
                newEvent.id,
                newEvent.toEventDTO(),
                nestedType = EventDTO::class
            ).data.toEvent(newEvent.id)
        }, saveCall = { event ->
            databaseService.getEventImpDao.upsertEvent(event)
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
            database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.EVENT_COLLECTION,
                queries = combinedQuery,
                EventDTO::class
            ).documents.map { dtoDoc -> dtoDoc.convert { it.toEvent(dtoDoc.id) }.data }
        },
            getLocalData = { emptyList() },
            saveData = { databaseService.getEventImpDao.upsertEvents(it) },
            deleteData = { })

        if (response.isSuccess) {
            lastDocumentId = response.getOrNull()?.lastOrNull()?.id ?: ""
        }
        return response
    }

    override suspend fun updateLocalEvent(newEvent: Event): Result<Event> {
        databaseService.getEventImpDao.upsertEvent(newEvent)
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

        val localFlow = databaseService.getEventImpDao.getAllCachedEvents().map {
            Result.success(it.filter { event ->
                filterMap(event)
            })
        }
        return localFlow
    }

    override suspend fun deleteEvent(eventId: String): Result<Unit> = runCatching {
        databaseService.getEventImpDao.deleteEventWithCrossRefs(eventId)
    }
}