package com.razumly.mvp.chat

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.chat.data.ChatGroupSummary
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.chat.data.IChatGroupRepository
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.util.newId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

interface ChatListComponent {
    val newChat: StateFlow<ChatGroupWithRelations>
    val selectedChat: StateFlow<ChatGroup?>
    val chatGroups: StateFlow<List<ChatGroupWithRelations>>
    val chatSummaries: StateFlow<Map<String, ChatGroupSummary>>
    val errorState: StateFlow<String?>
    val suggestedPlayers: StateFlow<List<UserData>>
    val currentUser: UserData
    val friends: StateFlow<List<UserData>>

    fun onChatSelected(chat: ChatGroupWithRelations)
    fun onChatCreated()
    fun updateNewChatField(update: ChatGroup.() -> ChatGroup)
    fun addUserToNewChat(user: UserData)
    fun removeUserFromNewChat(user: UserData)
    fun searchPlayers(query: String)
}

class DefaultChatListComponent(
    componentContext: ComponentContext,
    private val chatGroupRepository: IChatGroupRepository,
    private val userRepository: IUserRepository,
    private val navigationHandler: INavigationHandler,
) : ChatListComponent,
    ComponentContext by componentContext {
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    private val currentUserState = userRepository.currentUser
        .map { result -> result.getOrNull() ?: UserData() }
        .stateIn(scope, SharingStarted.Eagerly, UserData())
    override val currentUser: UserData
        get() = currentUserState.value

    private fun createEmptyDraftChat(currentUserId: String): ChatGroupWithRelations {
        val normalizedUserId = currentUserId.trim()
        val hostId = normalizedUserId.ifBlank { "" }
        val memberIds = if (normalizedUserId.isBlank()) emptyList() else listOf(normalizedUserId)
        return ChatGroupWithRelations(
            ChatGroup(newId(), "", memberIds, hostId),
            users = listOf(),
            messages = listOf(),
        )
    }

    private val _newChat = MutableStateFlow(
        createEmptyDraftChat(currentUser.id)
    )
    override val newChat = _newChat.asStateFlow()

    private val _selectedChat = MutableStateFlow<ChatGroup?>(null)
    override val selectedChat = _selectedChat.asStateFlow()

    private val _errorState = MutableStateFlow<String?>(null)
    override val errorState = _errorState.asStateFlow()

    private val _suggestedPlayers = MutableStateFlow<List<UserData>>(listOf())
    override val suggestedPlayers = _suggestedPlayers.asStateFlow()

    private val _friends = MutableStateFlow<List<UserData>>(listOf())
    override val friends = _friends.asStateFlow()

    override val chatGroups = chatGroupRepository.chatGroupsFlow.map { result ->
        result.getOrElse {
            _errorState.value = it.userMessage()
            emptyList()
        }
    }.stateIn(scope, SharingStarted.Eagerly, listOf())
    override val chatSummaries = chatGroupRepository.chatSummariesFlow
        .stateIn(scope, SharingStarted.Eagerly, emptyMap())

    init {
        scope.launch {
            currentUserState
                .map { user -> user.friendIds }
                .distinctUntilChanged()
                .collect { friendIds ->
                    _friends.value = if (friendIds.isEmpty()) {
                        emptyList()
                    } else {
                        userRepository.getUsers(friendIds).getOrElse {
                            _errorState.value = it.userMessage()
                            emptyList()
                        }
                    }
                }
        }
        scope.launch {
            currentUserState
                .map { user -> user.id.trim() }
                .distinctUntilChanged()
                .collect { currentUserId ->
                    if (currentUserId.isBlank()) return@collect

                    val currentDraft = _newChat.value
                    val normalizedUserIds = currentDraft.chatGroup.userIds
                        .map { userId -> userId.trim() }
                        .filter(String::isNotBlank)
                    val shouldHydrateDraft =
                        currentDraft.chatGroup.hostId.isBlank() || !normalizedUserIds.contains(currentUserId)
                    if (!shouldHydrateDraft) return@collect

                    _newChat.value = currentDraft.copy(
                        chatGroup = currentDraft.chatGroup.copy(
                            hostId = currentUserId,
                            userIds = (normalizedUserIds + currentUserId).distinct(),
                        )
                    )
                }
        }
    }

    override fun onChatSelected(chat: ChatGroupWithRelations) {
        navigationHandler.navigateToChat(chat = chat)
    }

    override fun updateNewChatField(update: ChatGroup.() -> ChatGroup) {
        _newChat.value = newChat.value.copy(chatGroup = newChat.value.chatGroup.update())
    }

    override fun onChatCreated() {
        scope.launch {
            val currentUserId = currentUser.id.trim()
            if (currentUserId.isBlank()) {
                _errorState.value = "Unable to create chat until your user profile is loaded."
                return@launch
            }

            val normalizedUserIds = (newChat.value.chatGroup.userIds + currentUserId)
                .map { userId -> userId.trim() }
                .filter(String::isNotBlank)
                .distinct()
            val chatToCreate = newChat.value.copy(
                chatGroup = newChat.value.chatGroup.copy(
                    userIds = normalizedUserIds,
                    hostId = currentUserId,
                ),
                users = newChat.value.users
                    .filterNot { it.id == currentUserId }
                    .distinctBy { it.id }
            )

            val created = chatGroupRepository.createChatGroup(chatToCreate)
            if (created.isFailure) {
                _errorState.value = created.exceptionOrNull()?.userMessage()
                return@launch
            }
            chatGroupRepository.refreshChatGroupsAndMessages().onFailure {
                _errorState.value = it.userMessage()
            }
            _newChat.value = createEmptyDraftChat(currentUserId)
        }
    }

    override fun addUserToNewChat(user: UserData) {
        if (user.id == currentUser.id) {
            return
        }
        val newChatGroup = _newChat.value.chatGroup
        if (newChatGroup.userIds.contains(user.id)) {
            return
        }
        _newChat.value = _newChat.value.copy(
            chatGroup = newChatGroup.copy(userIds = (newChatGroup.userIds + user.id).distinct()),
            users = (_newChat.value.users + user).distinctBy { it.id }
        )
    }

    override fun removeUserFromNewChat(user: UserData) {
        if (user.id == currentUser.id) {
            return
        }
        if (!_newChat.value.chatGroup.userIds.contains(user.id)) {
            return
        }
        val newChatGroup = _newChat.value.chatGroup
        _newChat.value = _newChat.value.copy(
            chatGroup = newChatGroup.copy(userIds = newChatGroup.userIds - user.id),
            users = _newChat.value.users - user
        )
    }

    override fun searchPlayers(query: String) {
        scope.launch {
            _suggestedPlayers.value = userRepository.searchPlayers(search = query).getOrElse {
                _errorState.value = it.userMessage()
                emptyList()
            }.filterNot { user ->
                currentUser.id == user.id
            }
        }
    }
}
