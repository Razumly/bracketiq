package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import kotlinx.coroutines.flow.Flow

/** Owns canonical Room reads and writes for the event-detail facade boundary. */
internal class EventRoomStore(
    private val databaseService: DatabaseService,
) {
    fun observeEventWithRelations(eventId: String): Flow<EventWithRelations?> =
        databaseService.getEventDao.getEventWithRelationsFlow(eventId)

    suspend fun getEvent(eventId: String): Event? =
        databaseService.getEventDao.getEventById(eventId)

    suspend fun cacheAndReadEvent(
        event: Event,
        expectedEventId: String,
    ): Event {
        databaseService.getEventDao.upsertEvent(event)
        return databaseService.getEventDao.getEventById(expectedEventId)
            ?: throw IllegalStateException("Event $expectedEventId not cached")
    }

    suspend fun evictEvent(eventId: String) {
        databaseService.getEventDao.deleteEventWithCrossRefs(eventId)
    }
}
