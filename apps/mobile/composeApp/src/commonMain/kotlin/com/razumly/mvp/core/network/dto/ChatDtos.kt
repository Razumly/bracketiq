package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Serializable
data class ChatGroupApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val name: String? = null,
    val userIds: List<String>? = null,
    val hostId: String? = null,
) {
    fun toChatGroupOrNull(): ChatGroup? {
        val resolvedId = id ?: legacyId
        val resolvedHostId = hostId
        if (resolvedId.isNullOrBlank() || resolvedHostId.isNullOrBlank()) return null
        return ChatGroup(
            id = resolvedId,
            name = name ?: "",
            userIds = userIds ?: emptyList(),
            hostId = resolvedHostId,
        )
    }
}

@Serializable
data class ChatGroupsResponseDto(
    val groups: List<ChatGroupApiDto> = emptyList(),
)

@Serializable
data class CreateChatGroupRequestDto(
    val id: String,
    val name: String? = null,
    val userIds: List<String>,
    val hostId: String,
)

@Serializable
data class UpdateChatGroupRequestDto(
    val name: String? = null,
    val userIds: List<String>? = null,
)

@Serializable
data class MessageApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val body: String? = null,
    val userId: String? = null,
    val chatId: String? = null,
    val sentTime: String? = null,
    val readByIds: List<String>? = null,
    val attachmentUrls: List<String>? = null,
) {
    @OptIn(ExperimentalTime::class)
    fun toMessageOrNull(): MessageMVP? {
        val resolvedId = id ?: legacyId
        val resolvedUserId = userId
        val resolvedBody = body
        val resolvedChatId = chatId
        val resolvedSentTime = sentTime
        if (resolvedId.isNullOrBlank() || resolvedUserId.isNullOrBlank()) return null
        if (resolvedBody.isNullOrBlank() || resolvedChatId.isNullOrBlank()) return null
        if (resolvedSentTime.isNullOrBlank()) return null

        return MessageMVP(
            id = resolvedId,
            userId = resolvedUserId,
            body = resolvedBody,
            attachmentUrls = attachmentUrls ?: emptyList(),
            chatId = resolvedChatId,
            readByIds = readByIds ?: emptyList(),
            sentTime = Instant.parse(resolvedSentTime),
        )
    }
}

@Serializable
data class MessagesResponseDto(
    val messages: List<MessageApiDto> = emptyList(),
)

@Serializable
data class CreateMessageRequestDto(
    val id: String,
    val body: String,
    val userId: String,
    val chatId: String,
    val sentTime: String? = null,
    val readByIds: List<String>? = null,
    val attachmentUrls: List<String>? = null,
)

