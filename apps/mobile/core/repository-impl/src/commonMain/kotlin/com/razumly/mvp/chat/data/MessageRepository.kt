package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.CreateMessageRequestDto
import com.razumly.mvp.core.network.dto.MessageApiDto
import com.razumly.mvp.core.network.dto.MessagesResponseDto
import io.ktor.http.encodeURLPathPart

interface IMessageRepository {
    suspend fun getMessagesInChatGroup(chatGroupId: String): Result<List<MessageMVP>>
    suspend fun createMessage(newMessage: MessageMVP): Result<Unit>
    suspend fun markMessagesRead(chatGroupId: String, userId: String): Result<Unit>
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

    override suspend fun markMessagesRead(chatGroupId: String, userId: String): Result<Unit> = runCatching {
        val normalizedChatId = chatGroupId.trim().takeIf(String::isNotBlank)
            ?: error("Chat group id cannot be blank.")
        val normalizedUserId = userId.trim().takeIf(String::isNotBlank)
            ?: error("User id cannot be blank.")

        val unreadMessages = databaseService.getMessageDao.getMessagesInChatGroup(normalizedChatId)
            .filter { message -> message.isUnreadFor(normalizedUserId) }

        if (unreadMessages.isNotEmpty()) {
            val readMessages = unreadMessages.map { message ->
                message.copy(readByIds = (message.readByIds + normalizedUserId).distinct())
            }
            databaseService.getMessageDao.upsertMessages(readMessages)
        }

        api.postNoResponse("api/chat/groups/${normalizedChatId.encodeURLPathPart()}/messages/read")
    }
}
