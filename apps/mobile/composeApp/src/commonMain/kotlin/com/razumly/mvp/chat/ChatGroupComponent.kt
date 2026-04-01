package com.razumly.mvp.chat

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.chat.data.IChatGroupRepository
import com.razumly.mvp.chat.data.IMessageRepository
import com.razumly.mvp.chat.data.isUnreadFor
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.util.newId
import io.github.aakira.napier.Napier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

interface ChatGroupComponent {
    val currentUser: UserData
    val messageInput: StateFlow<String>
    val chatGroup: StateFlow<ChatGroupWithRelations?>
    val errorState: StateFlow<String?>
    val suggestedPlayers: StateFlow<List<UserData>>
    val friends: StateFlow<List<UserData>>
    val isChatMuted: StateFlow<Boolean>

    fun onBack()
    fun onMessageInputChange(newText: String)
    fun sendMessage()
    fun deleteChat()
    fun leaveChat()
    fun searchPlayers(query: String)
    fun addUserToChat(user: UserData)
    fun removeUserFromChat(user: UserData)
    fun toggleChatMute()
}


@OptIn(ExperimentalTime::class)
class DefaultChatGroupComponent(
    componentContext: ComponentContext,
    private val userRepository: IUserRepository,
    private val chatGroupRepository: IChatGroupRepository,
    messageUser: UserData?,
    initialChatGroup: ChatGroupWithRelations?,
    private val messagesRepository: IMessageRepository,
    private val pushNotificationsRepository: IPushNotificationsRepository,
    private val navigationHandler: INavigationHandler,
) : ChatGroupComponent, ComponentContext by componentContext {

    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    private val _errorState = MutableStateFlow<String?>(null)
    override val errorState = _errorState.asStateFlow()
    private val _suggestedPlayers = MutableStateFlow<List<UserData>>(listOf())
    override val suggestedPlayers = _suggestedPlayers.asStateFlow()
    private val _friends = MutableStateFlow<List<UserData>>(listOf())
    override val friends = _friends.asStateFlow()
    private val _isChatMuted = MutableStateFlow(false)
    override val isChatMuted: StateFlow<Boolean> = _isChatMuted.asStateFlow()

    override val chatGroup =
        chatGroupRepository.getChatGroupFlow(messageUser, initialChatGroup).map { result ->
            val chatGroup = result.getOrElse {
                _errorState.value = it.userMessage()
                null
            }
            chatGroup?.copy(messages = chatGroup.messages.sortedBy { it.sentTime })
        }.stateIn(scope, SharingStarted.Eagerly, null)

    private val _messageInput = MutableStateFlow("")
    override val messageInput: StateFlow<String> = _messageInput

    private val currentUserState = userRepository.currentUser
        .map { result -> result.getOrNull() ?: UserData() }
        .stateIn(scope, SharingStarted.Eagerly, UserData())
    override val currentUser: UserData
        get() = currentUserState.value
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
            chatGroup
                .map { it?.chatGroup?.id?.trim().orEmpty() }
                .distinctUntilChanged()
                .collect { chatId ->
                    pushNotificationsRepository.setActiveChat(chatId.ifBlank { null })
                    if (chatId.isBlank()) {
                        _isChatMuted.value = false
                        return@collect
                    }
                    chatGroupRepository.getCurrentUserMuteStatus(chatId).onSuccess { muted ->
                        _isChatMuted.value = muted
                    }.onFailure {
                        _errorState.value = it.userMessage()
                        _isChatMuted.value = false
                    }
                }
        }
        scope.launch {
            chatGroup
                .map { group ->
                    group?.chatGroup?.id?.trim().orEmpty()
                }
                .distinctUntilChanged()
                .collect { chatId ->
                    if (chatId.isBlank()) return@collect
                    messagesRepository.getMessagesInChatGroup(chatId).onFailure { error ->
                        Napier.w("Failed to load messages for opened chat $chatId: ${error.message}")
                    }
                }
        }
        scope.launch {
            combine(chatGroup, currentUserState) { group, user ->
                val chatId = group?.chatGroup?.id?.trim().orEmpty()
                val currentUserId = user.id.trim()
                val unreadSignature = group
                    ?.messages
                    ?.asSequence()
                    ?.filter { message -> message.isUnreadFor(currentUserId) }
                    ?.map { message -> message.id.ifBlank { "${message.userId}-${message.sentTime}" } }
                    ?.sorted()
                    ?.joinToString("|")
                    .orEmpty()
                ChatUnreadSnapshot(
                    chatId = chatId,
                    currentUserId = currentUserId,
                    unreadSignature = unreadSignature,
                )
            }
                .distinctUntilChanged()
                .collect { snapshot ->
                    if (snapshot.chatId.isBlank() ||
                        snapshot.currentUserId.isEmpty() ||
                        snapshot.unreadSignature.isEmpty()
                    ) {
                        return@collect
                    }
                    markCurrentChatMessagesRead(snapshot.chatId, snapshot.currentUserId)
                }
        }
    }

    override fun onBack() {
        pushNotificationsRepository.setActiveChat(null)
        navigationHandler.navigateBack()
    }

    override fun onMessageInputChange(newText: String) {
        _messageInput.value = newText
    }

    override fun sendMessage() {
        val text = _messageInput.value.trim()
        _messageInput.value = ""
        if (text.isNotBlank()) {
            chatGroup.value ?: return
            val message = MessageMVP(
                id = newId(),
                userId = currentUser.id,
                body = text,
                attachmentUrls = listOf(),
                chatId = chatGroup.value!!.chatGroup.id,
                readByIds = listOf(currentUser.id),
                sentTime = Clock.System.now()
            )

            scope.launch {
                val createResult = messagesRepository.createMessage(message)
                if (createResult.isFailure) {
                    _errorState.value = createResult.exceptionOrNull()?.userMessage()
                    return@launch
                }
                pushNotificationsRepository.sendChatGroupNotification(
                    chatGroup.value!!.chatGroup.id, "New message from ${currentUser.fullName}", text
                ).onFailure {
                    _errorState.value = it.userMessage()
                }
            }
        }
    }

    override fun deleteChat() {
        val currentChat = chatGroup.value?.chatGroup ?: return
        if (currentChat.hostId != currentUser.id) {
            _errorState.value = "Only the host can delete this chat."
            return
        }
        scope.launch {
            chatGroupRepository.deleteChatGroup(currentChat.id).onSuccess {
                pushNotificationsRepository.setActiveChat(null)
                navigationHandler.navigateBack()
            }.onFailure {
                _errorState.value = it.userMessage("Failed to delete chat.")
            }
        }
    }

    override fun leaveChat() {
        val currentChat = chatGroup.value?.chatGroup ?: return
        if (currentChat.hostId == currentUser.id) {
            _errorState.value = "Host cannot leave chat. Delete it instead."
            return
        }
        scope.launch {
            chatGroupRepository.deleteUserFromChatGroup(currentChat, currentUser.id).onSuccess {
                pushNotificationsRepository.setActiveChat(null)
                navigationHandler.navigateBack()
            }.onFailure {
                _errorState.value = it.userMessage("Failed to leave chat.")
            }
        }
    }

    override fun searchPlayers(query: String) {
        scope.launch {
            _suggestedPlayers.value = userRepository.searchPlayers(query).getOrElse {
                _errorState.value = it.userMessage()
                emptyList()
            }.filterNot { user -> user.id == currentUser.id }
        }
    }

    override fun addUserToChat(user: UserData) {
        val currentChat = chatGroup.value?.chatGroup ?: return
        if (currentChat.hostId != currentUser.id) {
            _errorState.value = "Only the host can manage people."
            return
        }
        if (currentChat.userIds.contains(user.id)) return

        scope.launch {
            chatGroupRepository.addUserToChatGroup(currentChat, user.id).onFailure {
                _errorState.value = it.userMessage("Failed to add user to chat.")
            }
        }
    }

    override fun removeUserFromChat(user: UserData) {
        val currentChat = chatGroup.value?.chatGroup ?: return
        if (currentChat.hostId != currentUser.id) {
            _errorState.value = "Only the host can manage people."
            return
        }
        if (user.id == currentUser.id) {
            _errorState.value = "Host cannot remove themselves from the chat."
            return
        }
        if (!currentChat.userIds.contains(user.id)) return

        scope.launch {
            chatGroupRepository.deleteUserFromChatGroup(currentChat, user.id).onFailure {
                _errorState.value = it.userMessage("Failed to remove user from chat.")
            }
        }
    }

    override fun toggleChatMute() {
        val currentChat = chatGroup.value?.chatGroup ?: return
        val nextMuted = !isChatMuted.value
        scope.launch {
            chatGroupRepository.setCurrentUserMuteStatus(currentChat.id, nextMuted).onSuccess { muted ->
                _isChatMuted.value = muted
            }.onFailure {
                _errorState.value = it.userMessage("Failed to update mute setting.")
            }
        }
    }

    private suspend fun markCurrentChatMessagesRead(chatId: String, currentUserId: String) {
        messagesRepository.markMessagesRead(chatId, currentUserId).onFailure { error ->
            Napier.w("Failed to mark messages as read for chat $chatId: ${error.message}")
        }
        chatGroupRepository.refreshChatGroupsAndMessages().onFailure { error ->
            Napier.w("Failed to refresh chat summaries after mark-read for chat $chatId: ${error.message}")
        }
    }

    private data class ChatUnreadSnapshot(
        val chatId: String,
        val currentUserId: String,
        val unreadSignature: String,
    )
}
