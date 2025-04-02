package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.MVPDatabase
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.dtos.EventDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toEvent
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.convert
import io.appwrite.services.Databases
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

class EventRepository(
    private val mvpDatabase: MVPDatabase,
    private val database: Databases,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
): IEventRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    override fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>> {
        val localFlow = mvpDatabase.getEventImpDao.getEventWithRelationsFlow(eventId)
            .map { Result.success(it) }
        scope.launch{
            getEvent(eventId)
            userRepository.getUsersOfEvent(eventId)
            teamRepository.getTeamsOfEventFlow(eventId)
        }
        return localFlow
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
            mvpDatabase.getEventImpDao.upsertEvent(event)
        }, onReturn = {
            mvpDatabase.getEventImpDao.getEventWithRelationsById(eventId)
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
            mvpDatabase.getEventImpDao.upsertEvent(event)
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
            mvpDatabase.getEventImpDao.upsertEvent(event)
        }, onReturn = { event ->
            event
        })

    override suspend fun getEvents(query: String): Result<List<EventImp>> =
        multiResponse(
            getRemoteData = {
                database.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.EVENT_COLLECTION,
                    queries = listOf(query),
                    EventDTO::class
                ).documents.map { dtoDoc -> dtoDoc.convert { it.toEvent(dtoDoc.id) }.data }
            },
            getLocalData = {
                listOf()
            },
            saveData = { mvpDatabase.getEventImpDao.upsertEvents(it) },
            deleteData = { events -> mvpDatabase.getEventImpDao.deleteEventsById(events) }
        )

    override fun getEventsFlow(query: String): Flow<Result<List<EventWithRelations>>> {
        val localFlow = mvpDatabase.getEventImpDao.getAllCachedEvents()
            .map { Result.success(it) }

        scope.launch {
            getEvents(query)
        }
        return localFlow
    }
}