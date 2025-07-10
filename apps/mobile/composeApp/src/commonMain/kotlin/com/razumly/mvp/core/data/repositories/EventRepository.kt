package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.dtos.EventDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toEvent
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.convert
import io.appwrite.Query
import io.appwrite.services.Databases
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

interface IEventRepository : IMVPRepository {
    fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>>
    fun resetCursor()
    suspend fun getEvent(eventId: String): Result<EventWithRelations>
    suspend fun createEvent(newEvent: EventImp): Result<EventImp>
    suspend fun updateEvent(newEvent: EventImp): Result<EventImp>
    suspend fun getEvents(query: String): Result<List<EventImp>>
    fun getEventsFlow(query: String): Flow<Result<List<EventImp>>>
}

class EventRepository(
    private val databaseService: DatabaseService,
    private val database: Databases,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
): IEventRepository {
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
        val localFlow = launch {databaseService.getEventImpDao.getEventWithRelationsFlow(eventId)
            .collect {
                trySend(Result.success(it))
            }
        }
        val remoteFlow = launch{
            getEvent(eventId).onSuccess { result ->
                val playersDeferred = if (result.event.playerIds.isNotEmpty()) {
                    async { userRepository.getUsers(result.event.playerIds) }
                } else { async { Result.success(emptyList()) } }
                val hostDeferred = async { userRepository.getUsers(listOf(result.event.hostId)) }
                val teamsDeferred = if (result.event.teamIds.isNotEmpty()) {
                    async { teamRepository.getTeams(result.event.teamIds) }
                } else { async { Result.success(emptyList()) } }

                val playersResult = playersDeferred.await()
                val hostResult = hostDeferred.await()
                val teamsResult = teamsDeferred.await()

                listOf(
                    playersResult, hostResult, teamsResult
                ).forEach { res ->
                    res.onFailure { error ->
                        trySend(Result.failure(error))
                    }
                }
                databaseService.getTeamDao.upsertEventTeamCrossRefs(teamsResult.getOrThrow().map {
                    EventTeamCrossRef(
                        it.id, eventId
                    )
                })
                databaseService.getUserDataDao.upsertUserEventCrossRefs(playersResult.getOrThrow().map {
                    EventUserCrossRef(
                        it.id, eventId
                    )
                })
                databaseService.getUserDataDao.upsertUserEventCrossRefs(hostResult.getOrThrow().map {
                    EventUserCrossRef(
                        it.id, eventId
                    )
                })
                databaseService.getTeamDao.upsertTeamPlayerCrossRefs(teamsResult.getOrThrow().map {
                    it.playerIds.map { playerId ->
                        TeamPlayerCrossRef(
                            it.id, playerId
                        )
                    }
                }.flatten())
            }
        }

        awaitClose {
            localFlow.cancel()
            remoteFlow.cancel()
        }
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

    override suspend fun createEvent(newEvent: EventImp): Result<EventImp> =
        singleResponse(networkCall = {
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

    override suspend fun updateEvent(newEvent: EventImp): Result<EventImp> =
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

    override suspend fun getEvents(query: String): Result<List<EventImp>> {
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
            deleteData = { }
        )

        if (response.isSuccess) {
            lastDocumentId = response.getOrNull()?.lastOrNull()?.id ?: ""
        }
        return response
    }

    override fun getEventsFlow(query: String): Flow<Result<List<EventImp>>> {
        val localFlow = databaseService.getEventImpDao.getAllCachedEvents()
            .map { Result.success(it) }
        return localFlow
    }
}