package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import kotlinx.coroutines.flow.Flow

interface IEventRepository : IMVPRepository {
    fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>>
    suspend fun getEvent(eventId: String): Result<EventWithRelations>
    suspend fun createEvent(newEvent: EventImp): Result<EventImp>
    suspend fun updateEvent(newEvent: EventImp): Result<EventImp>
    suspend fun getEvents(query: String): Result<List<EventImp>>
    fun getEventsFlow(query: String): Flow<Result<List<EventWithRelations>>>
}