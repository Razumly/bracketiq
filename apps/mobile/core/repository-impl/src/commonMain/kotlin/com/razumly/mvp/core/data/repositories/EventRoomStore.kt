package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.toEventTimeSlotCacheEntry
import kotlinx.coroutines.flow.Flow

/**
 * Accepted registrations are monotonic server facts. Protected match history is authoritative
 * when the response includes the editor capability projection, such as after match deletion.
 */
internal fun mergePersistedEventEditorLocks(
    incoming: Event,
    cached: Event?,
    protectedHistoryAuthoritative: Boolean = false,
): Event {
    val registrationUnitLocked = incoming.registrationUnitLocked ||
        cached?.registrationUnitLocked == true
    val eventTypeHasProtectedHistory = if (protectedHistoryAuthoritative) {
        incoming.eventTypeHasProtectedHistory
    } else {
        incoming.eventTypeHasProtectedHistory ||
            cached?.eventTypeHasProtectedHistory == true
    }
    val eventTypeLocked = if (protectedHistoryAuthoritative) {
        incoming.eventTypeLocked ||
            registrationUnitLocked ||
            eventTypeHasProtectedHistory
    } else {
        incoming.eventTypeLocked ||
            cached?.eventTypeLocked == true ||
            eventTypeHasProtectedHistory
    }
    return incoming.copy(
        eventTypeLocked = eventTypeLocked,
        registrationUnitLocked = registrationUnitLocked,
        eventTypeHasProtectedHistory = eventTypeHasProtectedHistory,
    )
}

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

    suspend fun cacheEvent(
        event: Event,
        protectedHistoryAuthoritative: Boolean = false,
    ) {
        val cachedEvent = databaseService.getEventDao.getEventById(event.id)
        databaseService.getEventDao.upsertEvent(
            mergePersistedEventEditorLocks(
                incoming = event,
                cached = cachedEvent,
                protectedHistoryAuthoritative = protectedHistoryAuthoritative,
            ),
        )
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
        protectedHistoryAuthoritative: Boolean = false,
    ): Event {
        val cachedEvent = databaseService.getEventDao.getEventById(event.id)
        databaseService.getEventDao.upsertEvent(
            mergePersistedEventEditorLocks(
                incoming = event,
                cached = cachedEvent,
                protectedHistoryAuthoritative = protectedHistoryAuthoritative,
            ),
        )
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
