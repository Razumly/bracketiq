package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.EventSignupCacheEntry
import kotlinx.coroutines.flow.Flow

@Dao
interface EventSignupDao {
    @Upsert
    suspend fun upsert(entry: EventSignupCacheEntry)

    @Query("SELECT * FROM event_signup_state WHERE id = :id AND accountId = :accountId")
    suspend fun get(id: String, accountId: String): EventSignupCacheEntry?

    @Query("SELECT * FROM event_signup_state WHERE id = :id AND accountId = :accountId")
    fun observe(id: String, accountId: String): Flow<EventSignupCacheEntry?>

    @Query("DELETE FROM event_signup_state WHERE id = :id AND accountId = :accountId")
    suspend fun delete(id: String, accountId: String)

    @Query("DELETE FROM event_signup_state")
    suspend fun clearAll()
}
