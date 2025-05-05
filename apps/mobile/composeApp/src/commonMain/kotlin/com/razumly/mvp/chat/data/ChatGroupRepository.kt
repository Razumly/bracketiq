package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.MVPDatabase
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.ChatUserCrossRef
import com.razumly.mvp.core.data.dataTypes.dtos.MessageMVPDTO
import com.razumly.mvp.core.data.repositories.IMVPRepository
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.Query
import io.appwrite.models.RealtimeSubscription
import io.appwrite.services.Databases
import io.appwrite.services.Realtime
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

interface IChatGroupRepository : IMVPRepository {
    val chatGroupsFlow: Flow<Result<List<ChatGroupWithRelations>>>

    fun getChatGroupFlow(chatGroupId: String): Flow<Result<ChatGroupWithRelations>>
    suspend fun createChatGroup(newChatGroup: ChatGroup): Result<Unit>
    suspend fun updateChatGroup(newChatGroup: ChatGroup): Result<ChatGroup>
    suspend fun deleteUserFromChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit>
    suspend fun addUserToChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit>
}

class ChatGroupRepository(
    private val databases: Databases,
    private val mvpDatabase: MVPDatabase,
    private val userRepository: IUserRepository,
    private val messageRepository: IMessagesRepository,
    private val realtime: Realtime
) : IChatGroupRepository {
    private val _scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _chatGroupMessagesSubscription = MutableStateFlow<RealtimeSubscription?>(null)
    private val _chatGroupsSubscription = MutableStateFlow<RealtimeSubscription?>(null)
    private val _subscriptionList = MutableStateFlow<List<ChatGroup>>(listOf())
    override val chatGroupsFlow = groupsFlow()

    init {
        subscribeToChatGroups()
    }

    private fun subscribeToChatGroups(): Result<Unit> = runCatching {
        val groupChannel = listOf(DbConstants.CHAT_GROUPS_CHANNEL)
        val messageChannel = listOf(DbConstants.MESSAGES_CHANNEL)
        _chatGroupMessagesSubscription.value =
            realtime.subscribe(messageChannel, payloadType = MessageMVPDTO::class) { response ->
                val action = response.events.last().split(".").last()
                response.payload.let { message ->
                    if (!_subscriptionList.value.map { it.id }
                            .contains(message.chatId)) return@subscribe
                    _scope.launch {
                        if (action == "create") {
                            mvpDatabase.getMessageDao.upsertMessage(message.toMessageMVP(message.id))
                        } else if (action == "delete") {
                            mvpDatabase.getMessageDao.deleteMessageById(message.id)
                        }
                    }
                }
            }
        _chatGroupsSubscription.value =
            realtime.subscribe(groupChannel, payloadType = ChatGroup::class) { response ->
                response.payload.let { chatGroup ->
                    if (!_subscriptionList.value.map { it.id }
                            .contains(chatGroup.id)) return@subscribe
                    _scope.launch {
                        mvpDatabase.getChatGroupDao.upsertChatGroupWithRelations(chatGroup)
                    }
                }
            }
    }

    override fun getChatGroupFlow(chatGroupId: String): Flow<Result<ChatGroupWithRelations>> {
        return chatGroupsFlow.map { result ->
            result.fold(onSuccess = { list ->
                val chat = list.find { it.chatGroup.id == chatGroupId }
                if (chat != null) {
                    Result.success(chat)
                } else {
                    Result.failure(Exception("Chat group not found for ID: $chatGroupId"))
                }
            }, onFailure = { error ->
                Result.failure(error)
            })
        }
    }

    private fun groupsFlow(): Flow<Result<List<ChatGroupWithRelations>>> {
        val userId = userRepository.currentUser.value!!.id
        val localFlow =
            mvpDatabase.getChatGroupDao.getChatGroupsFlowByUserId(userId).map { Result.success(it) }

        _scope.launch {
            multiResponse(getRemoteData = {
                databases.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.CHAT_GROUP_COLLECTION,
                    nestedType = ChatGroup::class,
                    queries = listOf(Query.contains("userIds", userId))
                ).documents.map { it.data.copy(id = it.id) }
            }, getLocalData = {
                mvpDatabase.getChatGroupDao.getChatGroupsByUserId(userId)
            }, saveData = {
                _subscriptionList.value = it

                userRepository.getUsers(it.map { chatGroup -> chatGroup.userIds }.flatten())
                it.map { chatGroup -> chatGroup.id }.forEach { chatGroupId ->
                    messageRepository.getMessagesInChatGroup(chatGroupId).onFailure { e ->
                        Napier.e("Failed to get messages for chat group $chatGroupId", e)
                    }
                }
                mvpDatabase.getChatGroupDao.upsertChatGroupsWithRelations(it)
            }, deleteData = {
                mvpDatabase.getChatGroupDao.deleteChatGroupsByIds(it)
            })
        }

        return localFlow
    }

    override suspend fun createChatGroup(newChatGroup: ChatGroup): Result<Unit> =
        singleResponse(networkCall = {
            databases.createDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.CHAT_GROUP_COLLECTION,
                newChatGroup.id,
                newChatGroup,
                nestedType = ChatGroup::class
            ).data
        }, saveCall = { chatGroup ->
            _subscriptionList.value += chatGroup
            mvpDatabase.getChatGroupDao.upsertChatGroupWithRelations(chatGroup)
        }, onReturn = { })

    override suspend fun updateChatGroup(newChatGroup: ChatGroup): Result<ChatGroup> =
        singleResponse(networkCall = {
            databases.updateDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.CHAT_GROUP_COLLECTION,
                newChatGroup.id,
                newChatGroup,
                nestedType = ChatGroup::class
            ).data
        }, saveCall = { chatGroup ->
            mvpDatabase.getChatGroupDao.upsertChatGroupWithRelations(chatGroup)
        }, onReturn = { it })

    override suspend fun deleteUserFromChatGroup(
        chatGroup: ChatGroup, userId: String
    ): Result<Unit> {
        val newChatGroup = chatGroup.copy(userIds = chatGroup.userIds.filter { it != userId })
        mvpDatabase.getChatGroupDao.deleteChatGroupUserCrossRef(
            ChatUserCrossRef(
                chatGroup.id, userId
            )
        )
        return updateChatGroup(newChatGroup).map {}
    }

    override suspend fun addUserToChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit> {
        val newChatGroup = chatGroup.copy(userIds = chatGroup.userIds + userId)
        mvpDatabase.getChatGroupDao.upsertChatGroupUserCrossRef(
            ChatUserCrossRef(
                chatGroup.id, userId
            )
        )
        return updateChatGroup(newChatGroup).map {}
    }

}