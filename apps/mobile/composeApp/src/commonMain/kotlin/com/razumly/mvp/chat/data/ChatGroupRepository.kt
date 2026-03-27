package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IMVPRepository
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.ChatGroupApiDto
import com.razumly.mvp.core.network.dto.ChatMuteRequestDto
import com.razumly.mvp.core.network.dto.ChatMuteResponseDto
import com.razumly.mvp.core.network.dto.ChatGroupsResponseDto
import com.razumly.mvp.core.network.dto.CreateChatGroupRequestDto
import com.razumly.mvp.core.network.dto.UpdateChatGroupRequestDto
import io.github.aakira.napier.Napier
import io.ktor.http.encodeURLPathPart
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

interface IChatGroupRepository : IMVPRepository {
    val chatGroupsFlow: Flow<Result<List<ChatGroupWithRelations>>>
    val chatSummariesFlow: Flow<Map<String, ChatGroupSummary>>
    fun getUnreadMessageCountFlow(userId: String): Flow<Int>

    fun getChatGroupFlow(
        user: UserData?, chatGroup: ChatGroupWithRelations?
    ): Flow<Result<ChatGroupWithRelations>>

    suspend fun refreshChatGroupsAndMessages(): Result<Unit>
    suspend fun createChatGroup(newChatGroup: ChatGroupWithRelations): Result<Unit>
    suspend fun updateChatGroup(newChatGroup: ChatGroup): Result<ChatGroup>
    suspend fun deleteChatGroup(chatGroupId: String): Result<Unit>
    suspend fun deleteUserFromChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit>
    suspend fun addUserToChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit>
    suspend fun getCurrentUserMuteStatus(chatGroupId: String): Result<Boolean>
    suspend fun setCurrentUserMuteStatus(chatGroupId: String, muted: Boolean): Result<Boolean>
}

class ChatGroupRepository(
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
    private val userRepository: IUserRepository,
    private val messageRepository: IMessageRepository,
    private val teamRepository: ITeamRepository,
) : IChatGroupRepository {
    private val _chatSummaries = kotlinx.coroutines.flow.MutableStateFlow<Map<String, ChatGroupSummary>>(emptyMap())
    override val chatGroupsFlow = groupsFlow()
    override val chatSummariesFlow: Flow<Map<String, ChatGroupSummary>> = _chatSummaries
    override fun getUnreadMessageCountFlow(userId: String): Flow<Int> =
        kotlinx.coroutines.flow.combine(
            databaseService.getChatGroupDao.getChatGroupsFlowByUserId(userId),
            chatSummariesFlow,
        ) { chatGroups, summaries ->
            if (summaries.isNotEmpty()) {
                summaries.values.sumOf { summary -> summary.unreadCount }
            } else {
                countUnreadMessages(chatGroups, userId)
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
            refreshChatGroupsAndMessagesForUser(userId).onFailure { trySend(Result.failure(it)) }
        }

        awaitClose {
            localJob.cancel()
            remoteJob.cancel()
        }
    }

    override suspend fun refreshChatGroupsAndMessages(): Result<Unit> {
        val userId = userRepository.currentUser.value.getOrThrow().id
        return refreshChatGroupsAndMessagesForUser(userId).map {}
    }

    private suspend fun refreshChatGroupsAndMessagesForUser(userId: String): Result<List<ChatGroup>> =
        multiResponse(
            getRemoteData = {
                val encoded = userId.encodeURLQueryComponent()
                val res = api.get<ChatGroupsResponseDto>("api/chat/groups?userId=$encoded")
                val summaries = res.groups.mapNotNull { groupDto ->
                    val groupId = groupDto.id ?: groupDto.legacyId
                    val summary = groupDto.toSummaryOrNull()
                    if (groupId.isNullOrBlank() || summary == null) {
                        null
                    } else {
                        groupId to summary
                    }
                }.toMap()
                _chatSummaries.value = summaries
                res.groups.mapNotNull { it.toChatGroupOrNull() }
            },
            getLocalData = {
                databaseService.getChatGroupDao.getChatGroupsByUserId(userId)
            },
            saveData = { chatGroups ->
                val allUserIds = chatGroups
                    .flatMap { group -> group.userIds }
                    .distinct()
                    .filter(String::isNotBlank)
                val users = userRepository.getUsers(allUserIds).getOrThrow()
                val teamsById = loadTeamsById(
                    chatGroups.mapNotNull(::resolveTeamId)
                )

                chatGroups.forEach { group ->
                    val otherUsers = users.filter { user -> user.id != userId && group.userIds.contains(user.id) }
                    val team = resolveTeamId(group)?.let(teamsById::get)
                    group.setDisplayName(resolveDisplayName(group, otherUsers, team))
                        .setImageUrl(resolveImageUrl(group, otherUsers, team))
                }

                databaseService.getChatGroupDao.upsertChatGroupsWithRelations(chatGroups)
            },
            deleteData = {
                databaseService.getChatGroupDao.deleteChatGroupsByIds(it)
            },
        )

    override suspend fun createChatGroup(newChatGroup: ChatGroupWithRelations): Result<Unit> =
        singleResponse(networkCall = {
            api.post<CreateChatGroupRequestDto, ChatGroupApiDto>(
                path = "api/chat/groups",
                body = CreateChatGroupRequestDto(
                    id = newChatGroup.chatGroup.id,
                    name = newChatGroup.chatGroup.name.asMeaningfulValue(),
                    userIds = newChatGroup.chatGroup.userIds,
                    hostId = newChatGroup.chatGroup.hostId,
                ),
            ).toChatGroupOrNull() ?: error("Create chat group response missing group")
        }, saveCall = { chatGroup ->
            val currentUserId = userRepository.currentUser.value.getOrThrow().id
            val otherUsers = newChatGroup.users.filter { user -> user.id != currentUserId && chatGroup.userIds.contains(user.id) }
            val team = loadTeamForChatGroup(chatGroup)
            chatGroup.setDisplayName(resolveDisplayName(chatGroup, otherUsers, team))
                .setImageUrl(resolveImageUrl(chatGroup, otherUsers, team))
            databaseService.getChatGroupDao.upsertChatGroupWithRelations(chatGroup)
        }, onReturn = { })

    override suspend fun updateChatGroup(newChatGroup: ChatGroup): Result<ChatGroup> =
        singleResponse(networkCall = {
            api.patch<UpdateChatGroupRequestDto, ChatGroupApiDto>(
                path = "api/chat/groups/${newChatGroup.id}",
                body = UpdateChatGroupRequestDto(
                    name = newChatGroup.name.asMeaningfulValue(),
                    userIds = newChatGroup.userIds,
                ),
            ).toChatGroupOrNull() ?: error("Update chat group response missing group")
        }, saveCall = { chatGroup ->
            val currentUserId = userRepository.currentUser.value.getOrThrow().id
            val users = userRepository.getUsers(chatGroup.userIds).getOrElse { emptyList() }
            val otherUsers = users.filter { user -> user.id != currentUserId && chatGroup.userIds.contains(user.id) }
            val team = loadTeamForChatGroup(chatGroup)
            chatGroup.setDisplayName(resolveDisplayName(chatGroup, otherUsers, team))
                .setImageUrl(resolveImageUrl(chatGroup, otherUsers, team))

            if (users.isNotEmpty()) {
                databaseService.getUserDataDao.upsertUsersData(users)
            }
            databaseService.getChatGroupDao.upsertChatGroupWithRelations(chatGroup)
        }, onReturn = { it })

    override suspend fun deleteChatGroup(chatGroupId: String): Result<Unit> = runCatching {
        val normalizedId = chatGroupId.trim().takeIf(String::isNotBlank) ?: error("Chat group id cannot be blank.")
        api.deleteNoResponse("api/chat/groups/${normalizedId.encodeURLPathPart()}")
        databaseService.getChatGroupDao.deleteChatGroupsByIds(listOf(normalizedId))
    }

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

    override suspend fun getCurrentUserMuteStatus(chatGroupId: String): Result<Boolean> = runCatching {
        val normalizedId = chatGroupId.trim().takeIf(String::isNotBlank) ?: error("Chat group id cannot be blank.")
        api.get<ChatMuteResponseDto>(
            "api/chat/groups/${normalizedId.encodeURLPathPart()}/mute"
        ).muted
    }

    override suspend fun setCurrentUserMuteStatus(chatGroupId: String, muted: Boolean): Result<Boolean> = runCatching {
        val normalizedId = chatGroupId.trim().takeIf(String::isNotBlank) ?: error("Chat group id cannot be blank.")
        api.post<ChatMuteRequestDto, ChatMuteResponseDto>(
            path = "api/chat/groups/${normalizedId.encodeURLPathPart()}/mute",
            body = ChatMuteRequestDto(muted = muted),
        ).muted
    }

    private fun resolveDisplayName(
        chatGroup: ChatGroup,
        otherUsers: List<UserData>,
        team: Team?,
    ): String {
        val participantNames = otherUsers
            .mapNotNull { user -> user.fullName.asMeaningfulValue() }
            .distinct()
            .joinToString(", ")
            .asMeaningfulValue()
        return chatGroup.name.asMeaningfulValue()
            ?: team?.displayName.asMeaningfulValue()
            ?: participantNames
            ?: chatGroup.displayName.asMeaningfulValue()
            ?: "Unknown chat"
    }

    private fun resolveImageUrl(
        chatGroup: ChatGroup,
        otherUsers: List<UserData>,
        team: Team?,
    ): String? {
        if (resolveTeamId(chatGroup) != null) {
            return team?.imageUrl.asMeaningfulValue()
                ?: chatGroup.imageUrl.asMeaningfulValue()
        }

        return otherUsers
            .asSequence()
            .mapNotNull { user -> user.imageUrl.asMeaningfulValue() }
            .firstOrNull()
            ?: chatGroup.imageUrl.asMeaningfulValue()
    }

    private suspend fun loadTeamForChatGroup(chatGroup: ChatGroup): Team? {
        val teamId = resolveTeamId(chatGroup) ?: return null
        return loadTeamsById(listOf(teamId))[teamId]
    }

    private suspend fun loadTeamsById(teamIds: List<String>): Map<String, Team> {
        val normalizedIds = teamIds
            .mapNotNull { teamId -> teamId.asMeaningfulValue() }
            .distinct()
        if (normalizedIds.isEmpty()) {
            return emptyMap()
        }

        val teams = teamRepository.getTeams(normalizedIds)
            .onFailure { error ->
                Napier.w("Failed to load chat team metadata for ${normalizedIds.size} ids.", error)
            }
            .getOrElse { emptyList() }

        return teams.associateBy { team -> team.id }
    }

    private fun resolveTeamId(chatGroup: ChatGroup): String? =
        chatGroup.teamId.asMeaningfulValue()
            ?: chatGroup.id.toTeamChatIdOrNull()

    private fun String.toTeamChatIdOrNull(): String? =
        this
            .takeIf { value -> value.startsWith("team:", ignoreCase = true) }
            ?.substringAfter("team:")
            .asMeaningfulValue()

    private fun String?.asMeaningfulValue(): String? =
        this
            ?.trim()
            ?.takeIf { value -> value.isNotEmpty() && !value.equals("null", ignoreCase = true) }

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
