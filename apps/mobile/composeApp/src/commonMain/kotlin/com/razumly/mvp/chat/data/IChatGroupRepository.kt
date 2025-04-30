package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.repositories.IMVPRepository
import kotlinx.coroutines.flow.Flow

interface IChatGroupRepository : IMVPRepository {
    fun getChatGroupFlow(chatGroupId: String): Flow<Result<ChatGroupWithRelations>>
    suspend fun createChatGroup(newChatGroup: ChatGroup): Result<Unit>
    suspend fun updateChatGroup(newChatGroup: ChatGroup): Result<ChatGroup>
    suspend fun deleteUserFromChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit>
    suspend fun addUserToChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit>
}