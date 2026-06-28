package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.EventParticipantManagementCacheEntry
import kotlinx.coroutines.flow.Flow

@Dao
interface EventParticipantManagementDao {

    @Upsert
    suspend fun upsertEntries(entries: List<EventParticipantManagementCacheEntry>)

    @Query(
        """
        SELECT * FROM event_participant_management_entries
        WHERE eventId = :eventId
          AND cacheSlotId = :cacheSlotId
          AND cacheOccurrenceDate = :cacheOccurrenceDate
        ORDER BY section, sortOrder
        """,
    )
    fun observeEntries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): Flow<List<EventParticipantManagementCacheEntry>>

    @Query(
        """
        SELECT * FROM event_participant_management_entries
        WHERE eventId = :eventId
          AND cacheSlotId = :cacheSlotId
          AND cacheOccurrenceDate = :cacheOccurrenceDate
        ORDER BY section, sortOrder
        """,
    )
    suspend fun getEntries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): List<EventParticipantManagementCacheEntry>

    @Query(
        """
        DELETE FROM event_participant_management_entries
        WHERE eventId = :eventId
          AND cacheSlotId = :cacheSlotId
          AND cacheOccurrenceDate = :cacheOccurrenceDate
        """,
    )
    suspend fun deleteEntries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    )

    @Query("DELETE FROM event_participant_management_entries")
    suspend fun clearAll()

    @Transaction
    suspend fun replaceEntries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
        entries: List<EventParticipantManagementCacheEntry>,
    ) {
        deleteEntries(eventId, cacheSlotId, cacheOccurrenceDate)
        if (entries.isNotEmpty()) {
            upsertEntries(entries)
        }
    }
}
