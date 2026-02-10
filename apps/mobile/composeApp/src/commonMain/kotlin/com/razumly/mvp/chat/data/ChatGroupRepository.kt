package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IMVPRepository
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.util.newId
import io.github.aakira.napier.Napier
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.ChatGroupApiDto
import com.razumly.mvp.core.network.dto.ChatGroupsResponseDto
import com.razumly.mvp.core.network.dto.CreateChatGroupRequestDto
import com.razumly.mvp.core.network.dto.UpdateChatGroupRequestDto
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
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
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
    private val userRepository: IUserRepository,
    private val messageRepository: IMessageRepository,
) : IChatGroupRepository {
    override val chatGroupsFlow = groupsFlow()

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
                val encoded = userId.encodeURLQueryComponent()
                val res = api.get<ChatGroupsResponseDto>("api/chat/groups?userId=$encoded")
                res.groups.mapNotNull { it.toChatGroupOrNull() }
            }, getLocalData = {
                databaseService.getChatGroupDao.getChatGroupsByUserId(userId)
            }, saveData = {
                val currentUserId = userRepository.currentUser.value.getOrThrow().id
                val allUserIds = it.flatMap { group -> group.userIds }.distinct().filter(String::isNotBlank)
                val users = userRepository.getUsers(allUserIds).getOrThrow()

                it.forEach { group ->
                    val otherUsers = users.filter { user -> user.id != currentUserId && group.userIds.contains(user.id) }
                    group.setDisplayName(otherUsers.joinToString(", ") { user -> user.fullName })
                        .setImageUrl(otherUsers.firstOrNull()?.imageUrl)
                }

                it.forEach { group ->
                    messageRepository.getMessagesInChatGroup(group.id).onFailure { e ->
                        Napier.e("Failed to get messages for chat group ${group.id}", e)
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
            api.post<CreateChatGroupRequestDto, ChatGroupApiDto>(
                path = "api/chat/groups",
                body = CreateChatGroupRequestDto(
                    id = newChatGroup.chatGroup.id,
                    name = newChatGroup.chatGroup.name,
                    userIds = newChatGroup.chatGroup.userIds,
                    hostId = newChatGroup.chatGroup.hostId,
                ),
            ).toChatGroupOrNull() ?: error("Create chat group response missing group")
        }, saveCall = { chatGroup ->
            databaseService.getChatGroupDao.upsertChatGroupWithRelations(chatGroup)
            val currentUserId = userRepository.currentUser.value.getOrThrow().id
            val otherUsers = newChatGroup.users.filter { user -> user.id != currentUserId && chatGroup.userIds.contains(user.id) }
            chatGroup.setDisplayName(otherUsers.joinToString(", ") { user -> user.fullName })
                .setImageUrl(otherUsers.firstOrNull()?.imageUrl)
        }, onReturn = { })

    override suspend fun updateChatGroup(newChatGroup: ChatGroup): Result<ChatGroup> =
        singleResponse(networkCall = {
            api.patch<UpdateChatGroupRequestDto, ChatGroupApiDto>(
                path = "api/chat/groups/${newChatGroup.id}",
                body = UpdateChatGroupRequestDto(
                    name = newChatGroup.name,
                    userIds = newChatGroup.userIds,
                ),
            ).toChatGroupOrNull() ?: error("Update chat group response missing group")
        }, saveCall = { chatGroup ->
            databaseService.getChatGroupDao.upsertChatGroupWithRelations(chatGroup)
        }, onReturn = { it })

    override suspend fun deleteUserFromChatGroup(
        chatGroup: ChatGroup, userId: String
    ): Result<Unit> {
        val newChatGroup = chatGroup.copy(userIds = chatGroup.userIds.filter { it != userId })
        return updateChatGroup(newChatGroup).map {}
    }

    override suspend fun addUserToChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit> {
        val newChatGroup = chatGroup.copy(userIds = (chatGroup.userIds + userId).distinct())
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
                    id = newId(),
                    name = "${currentUser.firstName} & ${otherUser.firstName}",
                    userIds = listOf(currentUserId, otherUserId),
                    hostId = currentUserId,
                ), users = listOf(currentUser, otherUser), messages = listOf()
            )

            createChatGroup(newChatGroup).getOrThrow()

            newChatGroup
        }
}
