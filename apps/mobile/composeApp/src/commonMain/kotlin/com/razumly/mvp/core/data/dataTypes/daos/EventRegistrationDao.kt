package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import kotlinx.coroutines.flow.Flow

@Dao
interface EventRegistrationDao {

    @Upsert
    suspend fun upsertRegistrations(registrations: List<EventRegistrationCacheEntry>)

    @Query("SELECT * FROM current_user_event_registrations WHERE eventId = :eventId")
    fun observeRegistrationsForEvent(eventId: String): Flow<List<EventRegistrationCacheEntry>>

    @Query("SELECT * FROM current_user_event_registrations WHERE eventId = :eventId")
    suspend fun getRegistrationsForEvent(eventId: String): List<EventRegistrationCacheEntry>

    @Query("DELETE FROM current_user_event_registrations")
    suspend fun clearAll()
}
