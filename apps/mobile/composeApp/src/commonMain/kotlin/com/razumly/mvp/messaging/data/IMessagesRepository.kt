package com.razumly.mvp.messaging.data

import com.razumly.mvp.core.data.dataTypes.MessageMVP

interface IMessagesRepository {
    suspend fun getMessagesInChatGroup(chatGroupId: String): Result<List<MessageMVP>>
    suspend fun createMessage(newMessage: MessageMVP): Result<Unit>
}