package com.razumly.mvp.chat

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.chat.data.IChatGroupRepository
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.UserData
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

interface ChatListComponent {
    val newChat: StateFlow<ChatGroup>
    val selectedChat: StateFlow<ChatGroup?>
    val chatGroups: StateFlow<List<ChatGroup>>
    val errorState: StateFlow<String?>
    val suggestedPlayers: StateFlow<List<UserData>>
    val currentUser: UserData
    val friends: StateFlow<List<UserData>>

    fun onChatSelected(chat: ChatGroup)
    fun onChatCreated()
    fun updateNewChatField(update: ChatGroup.() -> ChatGroup)
    fun searchPlayers(query: String)
}

class DefaultChatListComponent(
    componentContext: ComponentContext,
    private val onNavigateToChat: (ChatGroup) -> Unit,
    private val chatGroupRepository: IChatGroupRepository,
    private val userRepository: IUserRepository,
) : ChatListComponent,
    ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _newChat = MutableStateFlow(ChatGroup(ID.unique(), "", emptyList()))
    override val newChat = _newChat.asStateFlow()

    private val _selectedChat = MutableStateFlow<ChatGroup?>(null)
    override val selectedChat = _selectedChat.asStateFlow()

    private val _errorState = MutableStateFlow<String?>(null)
    override val errorState = _errorState.asStateFlow()

    private val _suggestedPlayers = MutableStateFlow<List<UserData>>(listOf())
    override val suggestedPlayers = _suggestedPlayers.asStateFlow()

    private val _friends = MutableStateFlow<List<UserData>>(listOf())
    override val friends = _friends.asStateFlow()

    override val currentUser = userRepository.currentUser.value!!

    init {
        scope.launch {
            _friends.value = currentUser.friendIds.let { friends ->
                userRepository.getUsers(friends).getOrElse {
                    _errorState.value = it.message
                    emptyList()
                }
            }
        }
    }

    override val chatGroups = chatGroupRepository.getChatGroupsFlow().map { result ->
        result.getOrElse {
            _errorState.value = it.message
            emptyList()
        }
    }.stateIn(scope, SharingStarted.Eagerly, listOf())

    override fun onChatSelected(chat: ChatGroup) {
        onNavigateToChat(chat)
    }

    override fun updateNewChatField(update: ChatGroup.() -> ChatGroup) {
        _newChat.value = newChat.value.update()
    }

    override fun onChatCreated() {
        scope.launch {
            chatGroupRepository.createChatGroup(newChat.value)
        }
    }

    override fun searchPlayers(query: String) {
        scope.launch {
            _suggestedPlayers.value = userRepository.searchPlayers(search = query).getOrElse {
                _errorState.value = it.message
                emptyList()
            }.filterNot { user ->
                currentUser.id == user.id
            }
        }
    }
}
