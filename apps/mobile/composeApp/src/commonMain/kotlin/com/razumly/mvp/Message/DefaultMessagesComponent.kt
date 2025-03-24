package com.razumly.mvp.Message

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.EventAbs

class DefaultMessagesComponent(
    componentContext: ComponentContext,
    onEventSelected: (String) -> Unit
    ) : MessagesComponent,
    ComponentContext by componentContext {
}