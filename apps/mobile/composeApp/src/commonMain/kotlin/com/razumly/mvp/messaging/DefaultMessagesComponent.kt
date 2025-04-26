package com.razumly.mvp.messaging

import com.arkivanov.decompose.ComponentContext

class DefaultMessagesComponent(
    componentContext: ComponentContext,
    onEventSelected: (String) -> Unit
    ) : MessagesComponent,
    ComponentContext by componentContext {
}