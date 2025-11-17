package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.ChatUserCrossRef
import com.razumly.mvp.core.data.dataTypes.dtos.MessageMVPDTO
import com.razumly.mvp.core.data.repositories.IMVPRepository
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.ID
import io.appwrite.Query
import io.appwrite.models.RealtimeSubscription
import io.appwrite.services.TablesDB
import io.appwrite.services.Realtime
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

interface IChatGroupRepository : IMVPRepository {
    val chatGroupsFlow: Flow<Result<List<ChatGroupWithRelations>>>

    fun getChatGroupFlow(
        user: UserData?, chatGroup: ChatGroupWithRelations?
    ): Flow<Result<ChatGroupWithRelations>>

    suspend fun createChatGroup(newChatGroup: ChatGroupWithRelations): Result<Unit>
    suspend fun updateChatGroup(newChatGroup: ChatGroup): Result<ChatGroup>
    suspend fun deleteUserFromChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit>
    suspend fun addUserToChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit>
}

class ChatGroupRepository(
    private val tablesDb: TablesDB,
    private val databaseService: DatabaseService,
    private val userRepository: IUserRepository,
    private val messageRepository: IMessageRepository,
    private val realtime: Realtime,
    private val pushNotificationsRepository: IPushNotificationsRepository
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
                            databaseService.getMessageDao.upsertMessage(message.toMessageMVP(message.id))
                        } else if (action == "delete") {
                            databaseService.getMessageDao.deleteMessageById(message.id)
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
                        userRepository.getUsers(chatGroup.userIds)
                        databaseService.getChatGroupDao.upsertChatGroupWithRelations(chatGroup)
                    }
                }
            }
    }

    override fun getChatGroupFlow(
        user: UserData?, chatGroup: ChatGroupWithRelations?
    ): Flow<Result<ChatGroupWithRelations>> {
        return chatGroupsFlow.map { result ->
            result.fold(onSuccess = { list ->
                user?.let { findOrCreateDirectMessage(it.id) }
                    ?: list.find { it.chatGroup.id == chatGroup?.chatGroup?.id }
                        ?.let { foundChatGroup ->
                            Result.success(foundChatGroup)
                        } ?: Result.failure(Exception("Chat group not found"))
            }, onFailure = { error ->
                Result.failure(error)
            })
        }
    }

    private fun groupsFlow(): Flow<Result<List<ChatGroupWithRelations>>> = callbackFlow {
        val userId = userRepository.currentUser.value.getOrThrow().id
        val localJob = launch {
            databaseService.getChatGroupDao.getChatGroupsFlowByUserId(userId)
                .collect { trySend(Result.success(it)) }
        }
        val remoteJob = launch {
            multiResponse(getRemoteData = {
                tablesDb.listRows<ChatGroup>(
                    DbConstants.DATABASE_NAME,
                    DbConstants.CHAT_GROUP_TABLE,
                    queries = listOf(Query.contains("userIds", userId)),
                    nestedType = ChatGroup::class
                ).rows.map {
                    it.data.copy(id = it.id)
                }
            }, getLocalData = {
                databaseService.getChatGroupDao.getChatGroupsByUserId(userId)
            }, saveData = {
                _subscriptionList.value = it

                val users =
                    userRepository.getUsers(it.map { chatGroup -> chatGroup.userIds }.flatten())
                        .getOrThrow()
                it.map { chatGroup ->
                    chatGroup.setDisplayName(users.filter { user ->
                        user.id != userRepository.currentUser.value.getOrThrow().id && chatGroup.userIds.contains(user.id)
                    }.joinToString(", ") { user -> user.fullName }).setImageUrl(
                        users.first { user ->
                            user.id != userRepository.currentUser.value.getOrThrow().id
                        }.imageUrl
                    )
                    chatGroup.id
                }.forEach { chatGroupId ->
                    messageRepository.getMessagesInChatGroup(chatGroupId).onFailure { e ->
                        Napier.e("Failed to get messages for chat group $chatGroupId", e)
                    }
                }
                databaseService.getChatGroupDao.upsertChatGroupsWithRelations(it)
            }, deleteData = {
                databaseService.getChatGroupDao.deleteChatGroupsByIds(it)
            }).onFailure { trySend(Result.failure(it)) }
        }

        awaitClose {
            localJob.cancel()
            remoteJob.cancel()
        }
    }

    override suspend fun createChatGroup(newChatGroup: ChatGroupWithRelations): Result<Unit> =
        singleResponse(networkCall = {
            tablesDb.createRow<ChatGroup>(
                databaseId = DbConstants.DATABASE_NAME,
                tableId = DbConstants.CHAT_GROUP_TABLE,
                rowId = newChatGroup.chatGroup.id,
                data = newChatGroup.chatGroup,
                nestedType = ChatGroup::class
            ).data.copy(id = newChatGroup.chatGroup.id)
        }, saveCall = { chatGroup ->
            databaseService.getChatGroupDao.upsertChatGroupWithRelations(chatGroup)
            chatGroup.setDisplayName(newChatGroup.users.filter { user ->
                user.id != userRepository.currentUser.value.getOrThrow().id && chatGroup.userIds.contains(user.id)
            }.joinToString(", ") { user -> user.fullName }).setImageUrl(
                newChatGroup.users.first {
                    it.id != userRepository.currentUser.value.getOrThrow().id
                }.imageUrl
            )
            pushNotificationsRepository.createChatGroupTopic(chatGroup).onSuccess {
                chatGroup.userIds.forEach { userId ->
                    pushNotificationsRepository.subscribeUserToChatGroup(userId, chatGroup.id)
                        .getOrThrow()
                }
            }.onFailure {
                Napier.e("Failed to create chat group topic", it)
                tablesDb.deleteRow(
                    databaseId = DbConstants.DATABASE_NAME,
                    tableId = DbConstants.CHAT_GROUP_TABLE,
                    rowId = chatGroup.id
                )
                throw it
            }
            _subscriptionList.value += chatGroup
        }, onReturn = { })

    override suspend fun updateChatGroup(newChatGroup: ChatGroup): Result<ChatGroup> =
        singleResponse(networkCall = {
            tablesDb.updateRow<ChatGroup>(
                databaseId = DbConstants.DATABASE_NAME,
                tableId = DbConstants.CHAT_GROUP_TABLE,
                rowId = newChatGroup.id,
                data = newChatGroup,
                nestedType = ChatGroup::class
            ).data
        }, saveCall = { chatGroup ->
            databaseService.getChatGroupDao.upsertChatGroupWithRelations(chatGroup)
        }, onReturn = { it })

    override suspend fun deleteUserFromChatGroup(
        chatGroup: ChatGroup, userId: String
    ): Result<Unit> {
        val newChatGroup = chatGroup.copy(userIds = chatGroup.userIds.filter { it != userId })
        databaseService.getChatGroupDao.deleteChatGroupUserCrossRef(
            ChatUserCrossRef(
                chatGroup.id, userId
            )
        )
        pushNotificationsRepository.sendUserNotification(
            userId, "You left the chat", chatGroup.name
        )
        return updateChatGroup(newChatGroup).map {}
    }

    override suspend fun addUserToChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit> {
        val newChatGroup = chatGroup.copy(userIds = chatGroup.userIds + userId)
        databaseService.getChatGroupDao.upsertChatGroupUserCrossRef(
            ChatUserCrossRef(
                chatGroup.id, userId
            )
        )
        return updateChatGroup(newChatGroup).map {}
    }

    private suspend fun findOrCreateDirectMessage(otherUserId: String): Result<ChatGroupWithRelations> =
        runCatching {
            val currentUserId = userRepository.currentUser.value.getOrThrow().id

            val existingChats = chatGroupsFlow.first().getOrThrow()
            val existingDM = existingChats.find { chatGroup ->
                chatGroup.chatGroup.userIds.size == 2 && chatGroup.chatGroup.userIds.contains(
                    otherUserId
                ) && chatGroup.chatGroup.userIds.contains(
                    currentUserId
                )
            }

            if (existingDM != null) {
                return@runCatching existingChats.find { it.chatGroup.id == existingDM.chatGroup.id }
                    ?: throw Exception("Chat group not found")
            }

            // Create new DM chat
            val otherUser = userRepository.getUsers(listOf(otherUserId)).getOrThrow().first()
            val currentUser = userRepository.currentUser.value.getOrThrow()

            val newChatGroup = ChatGroupWithRelations(
                chatGroup = ChatGroup(
                    id = ID.unique(),
                    name = "${currentUser.firstName} & ${otherUser.firstName}",
                    userIds = listOf(currentUserId, otherUserId),
                    hostId = currentUserId,
                ), users = listOf(currentUser, otherUser), messages = listOf()
            )

            createChatGroup(newChatGroup).getOrThrow()

            databaseService.getChatGroupDao.getChatGroupWithRelations(newChatGroup.chatGroup.id)
        }
}
