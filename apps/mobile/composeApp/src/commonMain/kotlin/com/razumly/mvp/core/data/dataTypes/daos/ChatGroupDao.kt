package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.ChatGroup

@Dao
interface ChatGroupDao {
    @Upsert
    suspend fun upsertChatGroup(chatGroup: ChatGroup)

    @Delete
    suspend fun deleteChatGroup(chatGroup: ChatGroup)

    @Query("DELETE FROM ChatGroup WHERE id = :id")
    suspend fun deleteChatGroupById(id: String)

    @Query("SELECT * FROM ChatGroup WHERE id = :id")
    fun getChatGroupById(id: String): ChatGroup?
}