package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.MVPDatabase
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.ChatUserCrossRef
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.Query
import io.appwrite.services.Databases
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

class ChatGroupRepository(
    private val databases: Databases,
    private val mvpDatabase: MVPDatabase,
    private val messagesRepository: IMessagesRepository,
    private val userRepository: IUserRepository
): IChatGroupRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    override fun getChatGroupFlow(chatGroupId: String): Flow<Result<ChatGroupWithRelations>> {
        val localFlow = mvpDatabase.getChatGroupDao.getChatGroupFlowById(chatGroupId)
            .map { Result.success(it) }
        scope.launch{
            singleResponse(
                networkCall = {
                    databases.getDocument(
                        DbConstants.DATABASE_NAME,
                        DbConstants.CHAT_GROUP_COLLECTION,
                        chatGroupId,
                        nestedType = ChatGroup::class
                    ).data
                },
                saveCall = { chatGroup ->
                    mvpDatabase.getChatGroupDao.upsertChatGroup(chatGroup)
                    messagesRepository.getMessagesInChatGroup(chatGroupId)
                },
                onReturn = { it }
            )
        }
        return localFlow
    }

    override fun getChatGroupsFlow(): Flow<Result<List<ChatGroup>>> {
        val userId = userRepository.currentUser.value!!.id
        val localFlow = mvpDatabase.getChatGroupDao.getChatGroupsFlowByUserId(userId)
            .map { Result.success(it) }

        scope.launch{
            multiResponse(
                getRemoteData = {
                    databases.listDocuments(
                        DbConstants.DATABASE_NAME,
                        DbConstants.CHAT_GROUP_COLLECTION,
                        nestedType = ChatGroup::class,
                        queries = listOf(Query.contains("userIds", userId))
                    ).documents.map { it.data }
                },
                getLocalData = {
                    mvpDatabase.getChatGroupDao.getChatGroupsByUserId(userId)
                },
                saveData = {
                    mvpDatabase.getChatGroupDao.upsertChatGroups(it)
                },
                deleteData = {
                    mvpDatabase.getChatGroupDao.deleteChatGroupsByIds(it)
                }
            )
        }

        return localFlow
    }

    override suspend fun createChatGroup(newChatGroup: ChatGroup): Result<Unit> = singleResponse(
        networkCall = {
            databases.createDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.CHAT_GROUP_COLLECTION,
                newChatGroup.id,
                newChatGroup,
                nestedType = ChatGroup::class
            ).data
        },
        saveCall = { chatGroup ->
            mvpDatabase.getChatGroupDao.upsertChatGroup(chatGroup)
        },
        onReturn = { }
    )

    override suspend fun updateChatGroup(newChatGroup: ChatGroup): Result<ChatGroup> = singleResponse(
        networkCall = {
            databases.updateDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.CHAT_GROUP_COLLECTION,
                newChatGroup.id,
                newChatGroup,
                nestedType = ChatGroup::class
            ).data
        },
        saveCall = { chatGroup ->
            mvpDatabase.getChatGroupDao.upsertChatGroup(chatGroup)
        },
        onReturn = { it }
    )

    override suspend fun deleteUserFromChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit> {
        val newChatGroup = chatGroup.copy(userIds = chatGroup.userIds.filter { it != userId })
        mvpDatabase.getChatGroupDao.deleteChatGroupUserCrossRef(ChatUserCrossRef(chatGroup.id, userId))
        return updateChatGroup(newChatGroup).map {}
    }

    override suspend fun addUserToChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit> {
        val newChatGroup = chatGroup.copy(userIds = chatGroup.userIds + userId)
        mvpDatabase.getChatGroupDao.upsertChatGroupUserCrossRef(ChatUserCrossRef(chatGroup.id, userId))
        return updateChatGroup(newChatGroup).map {}
    }

}