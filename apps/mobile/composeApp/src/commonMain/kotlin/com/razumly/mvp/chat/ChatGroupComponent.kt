package com.razumly.mvp.chat

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.chat.data.IChatGroupRepository
import com.razumly.mvp.chat.data.IMessagesRepository
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

interface ChatGroupComponent {
    val currentUser: StateFlow<UserData?>
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
    private val messagesRepository: IMessagesRepository,
    chatGroupRepository: IChatGroupRepository,
    private val pushNotificationsRepository: IPushNotificationsRepository
) : ChatGroupComponent, ComponentContext by componentContext {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

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

    override val currentUser: StateFlow<UserData?> = userRepository.currentUser

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
                attachmentUrls = listOf(),
                chatId = chatGroup.value.chatGroup.id,
                readByIds = listOf(user.id),
                sentTime = kotlinx.datetime.Clock.System.now()
            )

            scope.launch {
                messagesRepository.createMessage(message).onFailure {
                    _errorState.value = it.message
                }
                pushNotificationsRepository.sendChatGroupNotification(
                    chatGroup.value.chatGroup,
                    "New message from ${user.fullName}",
                    text
                )
                _messageInput.value = ""
            }
        }
    }
}
