package com.razumly.mvp.chat

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.ChatGroup

interface ChatGroupComponent {

}

class DefaultChatGroupComponent(componentContext: ComponentContext, chatGroup: ChatGroup) : ChatGroupComponent,
    ComponentContext by componentContext {
}