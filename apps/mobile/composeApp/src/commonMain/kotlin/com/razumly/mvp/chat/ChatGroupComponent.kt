package com.razumly.mvp.chat

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.chat.data.IChatGroupRepository
import com.razumly.mvp.chat.data.IMessageRepository
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import io.appwrite.ID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock

interface ChatGroupComponent {
    val currentUser: UserData
    val messageInput: StateFlow<String>
    val chatGroup: StateFlow<ChatGroupWithRelations>
    val errorState: StateFlow<String?>

    fun onMessageInputChange(newText: String)
    fun sendMessage()
}


class DefaultChatGroupComponent(
    componentContext: ComponentContext,
    private val chatGroupInit: ChatGroupWithRelations,
    userRepository: IUserRepository,
    private val messagesRepository: IMessageRepository,
    chatGroupRepository: IChatGroupRepository,
    private val pushNotificationsRepository: IPushNotificationsRepository
) : ChatGroupComponent, ComponentContext by componentContext {

    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    private val _errorState = MutableStateFlow<String?>(null)
    override val errorState = _errorState.asStateFlow()

    override val chatGroup = chatGroupRepository.getChatGroupFlow(chatGroupInit.chatGroup.id).map { result ->
        val chatGroup = result.getOrElse {
            _errorState.value = it.message
            chatGroupInit
        }
        chatGroup.copy(messages = chatGroup.messages.sortedBy { it.sentTime })
    }.stateIn(scope, SharingStarted.Eagerly, chatGroupInit)

    private val _messageInput = MutableStateFlow("")
    override val messageInput: StateFlow<String> = _messageInput

    override val currentUser = userRepository.currentUser.value.getOrThrow()

    override fun onMessageInputChange(newText: String) {
        _messageInput.value = newText
    }

    override fun sendMessage() {
        val text = _messageInput.value.trim()
        _messageInput.value = ""
        if (text.isNotBlank()) {
            val message = MessageMVP(
                id = ID.unique(),
                userId = currentUser.id,
                body = text,
                attachmentUrls = listOf(),
                chatId = chatGroup.value.chatGroup.id,
                readByIds = listOf(currentUser.id),
                sentTime = Clock.System.now()
            )

            scope.launch {
                messagesRepository.createMessage(message).onFailure {
                    _errorState.value = it.message
                }
                pushNotificationsRepository.sendChatGroupNotification(
                    chatGroup.value.chatGroup.id,
                    "New message from ${currentUser.fullName}",
                    text
                ).onFailure {
                    _errorState.value = it.message
                }
            }
        }
    }
}
