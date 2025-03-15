package com.razumly.mvp.Message

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.MVPRepository
import com.razumly.mvp.core.data.dataTypes.EventAbs

class DefaultMessagesComponent(
    componentContext: ComponentContext,
    mvpRepository: MVPRepository,
    onEventSelected: (String) -> Unit
    ) : MessagesComponent,
    ComponentContext by componentContext {
}