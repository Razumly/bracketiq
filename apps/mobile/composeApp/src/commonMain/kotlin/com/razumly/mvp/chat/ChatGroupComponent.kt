package com.razumly.mvp.chat

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.chat.data.IMessagesRepository
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import io.appwrite.ID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

interface ChatGroupComponent {
    val messages: StateFlow<List<MessageMVP>>
    val currentUser: StateFlow<UserData?>
    val messageInput: StateFlow<String>

    fun onMessageInputChange(newText: String)
    fun sendMessage()
}


class DefaultChatGroupComponent(
    componentContext: ComponentContext,
    private val chatGroup: ChatGroup,
    private val userRepository: IUserRepository,
    private val messagesRepository: IMessagesRepository,
    private val pushNotificationsRepository: IPushNotificationsRepository
) : ChatGroupComponent, ComponentContext by componentContext {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _messages = MutableStateFlow<List<MessageMVP>>(emptyList())
    override val messages: StateFlow<List<MessageMVP>> = _messages

    private val _messageInput = MutableStateFlow("")
    override val messageInput: StateFlow<String> = _messageInput

    override val currentUser: StateFlow<UserData?> = userRepository.currentUser

    init {
        scope.launch {
            messagesRepository.getMessagesInChatGroup(chatGroup.id)
                .onSuccess { _messages.value = it }
                .onFailure { /* Handle error */ }
        }
    }

    override fun onMessageInputChange(newText: String) {
        _messageInput.value = newText
    }

    override fun sendMessage() {
        val user = currentUser.value ?: return
        val text = _messageInput.value.trim()
        if (text.isNotBlank()) {
            val message = MessageMVP(
                id = ID.unique(),
                userId = user.id,
                body = text,
                attachmentUrls = "",
                chatId = chatGroup.id,
                readByIds = listOf(user.id)
            )

            scope.launch {
                messagesRepository.createMessage(message)
                pushNotificationsRepository.sendChatGroupNotification(
                    chatGroup,
                    "New message from ${user.fullName}",
                    text
                )
                _messages.value += message
                _messageInput.value = ""
            }
        }
    }
}
