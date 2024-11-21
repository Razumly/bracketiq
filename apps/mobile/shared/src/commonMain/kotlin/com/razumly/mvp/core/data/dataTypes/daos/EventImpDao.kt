package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.EventImp

@Dao
interface EventImpDao {
    @Upsert
    suspend fun upsertEvent(event: EventImp)

    @Delete
    suspend fun deleteEvent(event: EventImp)

    @Query("SELECT * FROM EventImp WHERE id = :id")
    suspend fun getEventById(id: String): EventImp?
}