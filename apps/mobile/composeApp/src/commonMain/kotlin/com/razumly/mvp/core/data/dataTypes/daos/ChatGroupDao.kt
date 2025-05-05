package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.ChatUserCrossRef
import io.github.aakira.napier.Napier
import kotlinx.coroutines.flow.Flow

@Dao
interface ChatGroupDao {
    @Upsert
    suspend fun upsertChatGroup(chatGroup: ChatGroup)

    @Upsert
    suspend fun upsertChatGroups(chatGroups: List<ChatGroup>)

    @Upsert
    suspend fun upsertChatGroupUserCrossRef(crossRef: ChatUserCrossRef)

    @Delete
    suspend fun deleteChatGroup(chatGroup: ChatGroup)

    @Delete
    suspend fun deleteChatGroupUserCrossRef(crossRef: ChatUserCrossRef)

    @Query("DELETE FROM chat_user_cross_ref WHERE chatId == :id")
    suspend fun deleteChatGroupUserCrossRefsByChatId(id: String)

    suspend fun upsertChatGroupsWithRelations(chatGroups: List<ChatGroup>) {
        chatGroups.forEach { chatGroup ->
            upsertChatGroupWithRelations(chatGroup)
        }
    }

    suspend fun upsertChatGroupWithRelations(chatGroup: ChatGroup) {
        upsertChatGroup(chatGroup)
        try {
            deleteChatGroupUserCrossRefsByChatId(chatGroup.id)
        } catch (e: Exception) {
            Napier.e("deleteChatGroupUserCrossRefsByChatId", e)
        }
        chatGroup.userIds.forEach { userId ->
            try {
                upsertChatGroupUserCrossRef(ChatUserCrossRef(chatGroup.id, userId))
            } catch (e: Exception) {
                Napier.e("Failed to add chat group user crossRef for chat: ${chatGroup.id}", e)
            }
        }
    }

    @Query("DELETE FROM ChatGroup WHERE id IN (:ids)")
    suspend fun deleteChatGroupsByIds(ids: List<String>)

    @Query("SELECT * FROM ChatGroup WHERE userIds LIKE '%' || :userId || '%'")
    fun getChatGroupsFlowByUserId(userId: String): Flow<List<ChatGroupWithRelations>>

    @Query("SELECT * FROM ChatGroup WHERE userIds LIKE '%' || :userId || '%'")
    suspend fun getChatGroupsByUserId(userId: String): List<ChatGroup>

    @Query("SELECT * FROM ChatGroup WHERE id = :id")
    fun getChatGroupFlowById(id: String): Flow<ChatGroupWithRelations>
}