package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.MatchRosterCacheEntry
import kotlinx.coroutines.flow.Flow

@Dao
interface MatchRosterDao {
    @Upsert
    suspend fun upsert(entry: MatchRosterCacheEntry)

    @Query("SELECT * FROM match_roster_cache WHERE accountId = :accountId AND eventId = :eventId AND matchId = :matchId")
    fun observe(accountId: String, eventId: String, matchId: String): Flow<MatchRosterCacheEntry?>

    @Query("DELETE FROM match_roster_cache WHERE accountId = :accountId AND eventId = :eventId AND matchId = :matchId")
    suspend fun delete(accountId: String, eventId: String, matchId: String)

    @Query("DELETE FROM match_roster_cache")
    suspend fun clearAll()
}
