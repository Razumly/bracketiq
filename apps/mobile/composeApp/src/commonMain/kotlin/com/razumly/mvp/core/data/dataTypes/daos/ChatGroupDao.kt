package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import kotlinx.coroutines.flow.Flow

@Dao
interface ChatGroupDao {
    @Upsert
    suspend fun upsertChatGroup(chatGroup: ChatGroup)

    @Delete
    suspend fun deleteChatGroup(chatGroup: ChatGroup)

    @Query("DELETE FROM ChatGroup WHERE id = :id")
    suspend fun deleteChatGroupById(id: String)

    @Query("SELECT * FROM ChatGroup WHERE userIds LIKE '%' || :userId || '%'")
    fun getChatGroupsByUserId(userIid: String): List<ChatGroup>

    @Query("SELECT * FROM ChatGroup WHERE id = :id")
    fun getChatGroupFlowById(id: String): Flow<ChatGroupWithRelations>
}