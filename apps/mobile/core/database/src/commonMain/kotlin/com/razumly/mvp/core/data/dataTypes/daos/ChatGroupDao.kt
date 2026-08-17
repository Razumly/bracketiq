package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupMembershipRelations
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.ChatUserCrossRef
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

@Dao
interface ChatGroupDao {
    @Upsert
    suspend fun upsertChatGroupRow(chatGroup: ChatGroup)

    @Upsert
    suspend fun upsertChatGroupRows(chatGroups: List<ChatGroup>)

    @Transaction
    suspend fun upsertChatGroup(chatGroup: ChatGroup) {
        upsertChatGroupWithRelations(chatGroup)
    }

    @Transaction
    suspend fun upsertChatGroups(chatGroups: List<ChatGroup>) {
        upsertChatGroupsWithRelations(chatGroups)
    }

    @Upsert
    suspend fun upsertChatGroupUserCrossRef(crossRef: ChatUserCrossRef)

    @Delete
    suspend fun deleteChatGroup(chatGroup: ChatGroup)

    @Delete
    suspend fun deleteChatGroupUserCrossRef(crossRef: ChatUserCrossRef)

    @Query("DELETE FROM chat_user_cross_ref WHERE chatId = :id")
    suspend fun deleteChatGroupUserCrossRefsByChatId(id: String)

    @Query("SELECT * FROM chat_user_cross_ref WHERE chatId = :id")
    suspend fun getChatGroupUserCrossRefsByChatId(id: String): List<ChatUserCrossRef>

    @Transaction
    suspend fun upsertChatGroupsWithRelations(chatGroups: List<ChatGroup>) {
        chatGroups.forEach { chatGroup -> upsertChatGroupWithRelations(chatGroup) }
    }

    @Transaction
    suspend fun upsertChatGroupWithRelations(chatGroup: ChatGroup) {
        upsertChatGroupRow(chatGroup)
        deleteChatGroupUserCrossRefsByChatId(chatGroup.id)
        chatGroup.userIds.distinct().forEach { userId ->
            upsertChatGroupUserCrossRef(ChatUserCrossRef(chatGroup.id, userId))
        }
    }

    @Query("DELETE FROM ChatGroup WHERE id IN (:ids)")
    suspend fun deleteChatGroupsByIds(ids: List<String>)

    @Transaction
    @Query(
        """
        SELECT ChatGroup.* FROM ChatGroup
        INNER JOIN chat_user_cross_ref ON ChatGroup.id = chat_user_cross_ref.chatId
        WHERE chat_user_cross_ref.userId = :userId
        """,
    )
    fun getChatGroupRelationsFlowByUserId(userId: String): Flow<List<ChatGroupWithRelations>>

    fun getChatGroupsFlowByUserId(userId: String): Flow<List<ChatGroupWithRelations>> =
        getChatGroupRelationsFlowByUserId(userId).map { groups ->
            groups.map(ChatGroupWithRelations::withCanonicalMembership)
        }

    @Transaction
    @Query(
        """
        SELECT ChatGroup.* FROM ChatGroup
        INNER JOIN chat_user_cross_ref ON ChatGroup.id = chat_user_cross_ref.chatId
        WHERE chat_user_cross_ref.userId = :userId
        """,
    )
    suspend fun getChatGroupMembershipRelationsByUserId(userId: String): List<ChatGroupMembershipRelations>

    suspend fun getChatGroupsByUserId(userId: String): List<ChatGroup> =
        getChatGroupMembershipRelationsByUserId(userId).map(ChatGroupMembershipRelations::toDomain)

    @Transaction
    @Query(
        """
        SELECT ChatGroup.* FROM ChatGroup
        INNER JOIN chat_user_cross_ref ON ChatGroup.id = chat_user_cross_ref.chatId
        WHERE chat_user_cross_ref.userId = :userId
        LIMIT 1
        """,
    )
    suspend fun getChatGroupRelationsByUserId(userId: String): ChatGroupWithRelations

    suspend fun getChatGroupWithRelations(userId: String): ChatGroupWithRelations =
        getChatGroupRelationsByUserId(userId).withCanonicalMembership()

    @Transaction
    @Query("SELECT * FROM ChatGroup WHERE id = :id")
    fun getChatGroupRelationsFlowById(id: String): Flow<ChatGroupWithRelations>

    fun getChatGroupFlowById(id: String): Flow<ChatGroupWithRelations> =
        getChatGroupRelationsFlowById(id).map(ChatGroupWithRelations::withCanonicalMembership)
}
