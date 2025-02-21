package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.Message

@Dao
interface MessageDao {
    @Upsert
    suspend fun upsertMessage(message: Message)

    @Delete
    suspend fun deleteMessage(message: Message)

    @Query("DELETE FROM Message WHERE id = :id")
    suspend fun deleteMessageById(id: String)

    @Query("SELECT * FROM Message WHERE id = :id")
    fun getMessageById(id: String): Message?
}