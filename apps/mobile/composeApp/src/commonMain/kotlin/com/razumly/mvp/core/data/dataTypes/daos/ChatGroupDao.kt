package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.ChatUserCrossRef
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

    @Query("DELETE FROM ChatGroup WHERE id IN (:ids)")
    suspend fun deleteChatGroupsByIds(ids: List<String>)

    @Query("SELECT * FROM ChatGroup WHERE userIds LIKE '%' || :userId || '%'")
    fun getChatGroupsFlowByUserId(userIid: String): Flow<List<ChatGroup>>

    @Query("SELECT * FROM ChatGroup WHERE userIds LIKE '%' || :userId || '%'")
    fun getChatGroupsByUserId(userIid: String): List<ChatGroup>

    @Query("SELECT * FROM ChatGroup WHERE id = :id")
    fun getChatGroupFlowById(id: String): Flow<ChatGroupWithRelations>
}