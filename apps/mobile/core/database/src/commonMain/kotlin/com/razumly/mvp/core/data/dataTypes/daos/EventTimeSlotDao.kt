package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.EventTimeSlotCacheEntry

@Dao
interface EventTimeSlotDao {
    @Query(
        "SELECT * FROM event_time_slot_cache " +
            "WHERE eventId = :eventId ORDER BY position ASC",
    )
    suspend fun getTimeSlotsByEventId(eventId: String): List<EventTimeSlotCacheEntry>

    @Upsert
    suspend fun upsertTimeSlots(entries: List<EventTimeSlotCacheEntry>)

    @Query("DELETE FROM event_time_slot_cache WHERE eventId = :eventId")
    suspend fun deleteTimeSlotsByEventId(eventId: String)
    @Query("DELETE FROM event_time_slot_cache")
    suspend fun deleteAllTimeSlots()
}
