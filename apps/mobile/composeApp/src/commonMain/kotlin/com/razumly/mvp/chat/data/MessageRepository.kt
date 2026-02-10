package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.CreateMessageRequestDto
import com.razumly.mvp.core.network.dto.MessageApiDto
import com.razumly.mvp.core.network.dto.MessagesResponseDto

interface IMessageRepository {
    suspend fun getMessagesInChatGroup(chatGroupId: String): Result<List<MessageMVP>>
    suspend fun createMessage(newMessage: MessageMVP): Result<Unit>
}

class MessageRepository(
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
) : IMessageRepository {
    override suspend fun getMessagesInChatGroup(chatGroupId: String): Result<List<MessageMVP>> =
        multiResponse(getRemoteData = {
            api.get<MessagesResponseDto>("api/chat/groups/$chatGroupId/messages?limit=100&order=asc")
                .messages.mapNotNull { it.toMessageOrNull() }
        }, getLocalData = {
            databaseService.getMessageDao.getMessagesInChatGroup(chatGroupId)
        }, saveData = {
            databaseService.getMessageDao.upsertMessages(it)
        }, deleteData = { databaseService.getMessageDao.deleteMessages(it) })

    override suspend fun createMessage(newMessage: MessageMVP): Result<Unit> =
        singleResponse(networkCall = {
            api.post<CreateMessageRequestDto, MessageApiDto>(
                path = "api/messages",
                body = CreateMessageRequestDto(
                    id = newMessage.id,
                    body = newMessage.body,
                    userId = newMessage.userId,
                    chatId = newMessage.chatId,
                    sentTime = newMessage.sentTime.toString(),
                    readByIds = newMessage.readByIds,
                    attachmentUrls = newMessage.attachmentUrls,
                ),
            ).toMessageOrNull() ?: error("Create message response missing message")
        }, saveCall = {
            databaseService.getMessageDao.upsertMessages(listOf(it))
        }, onReturn = {})
}
