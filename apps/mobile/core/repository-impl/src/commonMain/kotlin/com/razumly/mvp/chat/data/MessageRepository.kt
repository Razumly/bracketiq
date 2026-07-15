package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.CreateMessageRequestDto
import com.razumly.mvp.core.network.dto.MessageApiDto
import com.razumly.mvp.core.network.dto.MessagesResponseDto
import io.ktor.http.encodeURLPathPart

interface IMessageRepository {
    suspend fun getMessagesInChatGroup(chatGroupId: String): Result<List<MessageMVP>>
    suspend fun getMessageHistoryPage(
        chatGroupId: String,
        index: Int = 0,
        limit: Int = 100,
    ): Result<MessageHistoryPage> = getMessagesInChatGroup(chatGroupId).map { messages ->
        MessageHistoryPage(
            messages = messages,
            nextIndex = messages.size,
            hasMore = false,
        )
    }
    suspend fun createMessage(newMessage: MessageMVP): Result<Unit>
    suspend fun markMessagesRead(chatGroupId: String, userId: String): Result<Unit>
}

data class MessageHistoryPage(
    val messages: List<MessageMVP>,
    val nextIndex: Int,
    val hasMore: Boolean,
)

class MessageRepository(
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
) : IMessageRepository {
    override suspend fun getMessagesInChatGroup(chatGroupId: String): Result<List<MessageMVP>> {
        val remotePage = getMessageHistoryPage(chatGroupId = chatGroupId)
        if (remotePage.isSuccess) {
            return remotePage.map { page -> page.messages }
        }
        return runCatching {
            databaseService.getMessageDao.getMessagesInChatGroup(chatGroupId)
                .sortedWith(
                    compareBy<MessageMVP> { message -> message.sentTime }
                        .thenBy { message -> message.id },
                )
        }
    }

    override suspend fun getMessageHistoryPage(
        chatGroupId: String,
        index: Int,
        limit: Int,
    ): Result<MessageHistoryPage> = runCatching {
        val normalizedChatId = chatGroupId.trim().takeIf(String::isNotBlank)
            ?: error("Chat group id cannot be blank.")
        val normalizedIndex = index.coerceAtLeast(0)
        val normalizedLimit = limit.coerceIn(1, 100)
        val response = api.get<MessagesResponseDto>(
            "api/chat/groups/${normalizedChatId.encodeURLPathPart()}/messages" +
                "?limit=$normalizedLimit&index=$normalizedIndex&order=desc",
        )
        val messages = response.messages
            .mapNotNull { message -> message.toMessageOrNull() }
            .sortedWith(
                compareBy<MessageMVP> { message -> message.sentTime }
                    .thenBy { message -> message.id },
            )
        if (messages.isNotEmpty()) {
            databaseService.getMessageDao.upsertMessages(messages)
        }
        MessageHistoryPage(
            messages = messages,
            nextIndex = response.pagination.nextIndex.coerceAtLeast(normalizedIndex + messages.size),
            hasMore = response.pagination.hasMore,
        )
    }

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

        api.postNoResponse("api/chat/groups/${normalizedChatId.encodeURLPathPart()}/messages/read")

        if (unreadMessages.isNotEmpty()) {
            val readMessages = unreadMessages.map { message ->
                message.copy(readByIds = (message.readByIds + normalizedUserId).distinct())
            }
            databaseService.getMessageDao.upsertMessages(readMessages)
        }
    }
}
