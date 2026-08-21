package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.toEventTimeSlotCacheEntry
import kotlinx.coroutines.flow.Flow

/** Owns canonical Room reads and writes for the event-detail facade boundary. */
internal class EventRoomStore(
    private val databaseService: DatabaseService,
) {
    fun observeEventWithRelations(eventId: String): Flow<EventWithRelations?> =
        databaseService.getEventDao.getEventWithRelationsFlow(eventId)

    suspend fun getEvent(eventId: String): Event? =
        databaseService.getEventDao.getEventById(eventId)

    suspend fun getEventWithRelations(eventId: String): EventWithRelations =
        databaseService.getEventDao.getEventWithRelationsById(eventId)

    suspend fun cacheEvent(event: Event) {
        databaseService.getEventDao.upsertEvent(event)
    }

    suspend fun cacheEventTimeSlots(
        eventId: String,
        timeSlots: List<TimeSlot>,
    ) {
        val normalizedEventId = eventId.trim()
        require(normalizedEventId.isNotBlank()) { "Event id is required." }
        databaseService.getEventTimeSlotDao.deleteTimeSlotsByEventId(normalizedEventId)
        if (timeSlots.isNotEmpty()) {
            databaseService.getEventTimeSlotDao.upsertTimeSlots(
                timeSlots.mapIndexed { position, timeSlot ->
                    timeSlot.toEventTimeSlotCacheEntry(
                        eventId = normalizedEventId,
                        position = position,
                    )
                },
            )
        }
    }

    suspend fun cacheAndReadEvent(
        event: Event,
        expectedEventId: String,
    ): Event {
        databaseService.getEventDao.upsertEvent(event)
        return databaseService.getEventDao.getEventById(expectedEventId)
            ?: throw IllegalStateException("Event $expectedEventId not cached")
    }

    suspend fun evictEvent(eventId: String) {
        databaseService.withTransaction {
            databaseService.getEventDao.deleteEventWithCrossRefs(eventId)
            databaseService.getEventTimeSlotDao.deleteTimeSlotsByEventId(eventId)
        }
    }
}
