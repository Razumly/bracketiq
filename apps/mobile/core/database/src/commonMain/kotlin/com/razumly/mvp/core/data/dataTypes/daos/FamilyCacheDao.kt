package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.FamilyCacheEntry
import kotlinx.coroutines.flow.Flow

@Dao
interface FamilyCacheDao {
    @Upsert suspend fun upsert(entry: FamilyCacheEntry)
    @Query("SELECT * FROM family_cache WHERE parentId = :parentId")
    fun observe(parentId: String): Flow<FamilyCacheEntry?>
    @Query("SELECT * FROM family_cache WHERE parentId = :parentId")
    suspend fun get(parentId: String): FamilyCacheEntry?
    @Query("DELETE FROM family_cache")
    suspend fun clear()
}
