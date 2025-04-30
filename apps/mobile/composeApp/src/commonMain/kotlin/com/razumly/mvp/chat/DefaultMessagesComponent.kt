package com.razumly.mvp.chat

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.value.Value
import com.razumly.mvp.chat.MessagesComponent.Child
import com.razumly.mvp.chat.MessagesComponent.Config
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable

interface MessagesComponent {
    val childStack: Value<ChildStack<Config, Child>>
    val newChat: StateFlow<ChatGroup>
    val selectedChat: StateFlow<ChatGroup?>
    val chatGroups: StateFlow<List<ChatGroup>>

    fun onChatSelected(chat: ChatGroup)
    fun onChatCreated(chat: ChatGroup)

    sealed class Child {
        data object ChatList : Child()
        data object Chat : Child()
    }

    @Serializable
    sealed class Config {
        @Serializable
        data object ChatList: Config()
        @Serializable
        data object Chat: Config()
    }
}

class DefaultMessagesComponent(
    componentContext: ComponentContext,
    ) : MessagesComponent,
    ComponentContext by componentContext {
    private val navigation = StackNavigation<Config>()
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override val childStack = childStack(
        source = navigation,
        initialConfiguration = Config.ChatList,
        serializer = Config.serializer(),
        handleBackButton = true,
        childFactory = ::createChild
    )

    private fun createChild(
        config: Config,
        componentContext: ComponentContext
    ): Child = when (config) {
        is Config.Chat -> Child.Chat
        is Config.ChatList -> Child.ChatList
    }
}
