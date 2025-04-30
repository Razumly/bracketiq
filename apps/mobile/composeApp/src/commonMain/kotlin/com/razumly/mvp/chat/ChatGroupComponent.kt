package com.razumly.mvp.chat

import com.arkivanov.decompose.ComponentContext

interface ChatGroupComponent {

}

class DefaultChatGroupComponent(componentContext: ComponentContext) : ChatGroupComponent,
    ComponentContext by componentContext {
}