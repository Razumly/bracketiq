package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
class UnreadMessagesTest {
    private val currentUserId = "user-1"

    @Test
    fun countUnreadMessages_onlyCountsUnreadMessagesFromOtherUsers() {
        val messages = listOf(
            message(
                id = "m-1",
                userId = "user-2",
                chatId = "chat-1",
                readByIds = emptyList(),
            ),
            message(
                id = "m-2",
                userId = "user-2",
                chatId = "chat-1",
                readByIds = listOf(currentUserId),
            ),
            message(
                id = "m-3",
                userId = currentUserId,
                chatId = "chat-1",
                readByIds = listOf(currentUserId),
            ),
        )

        assertEquals(1, countUnreadMessages(messages, currentUserId))
    }

    @Test
    fun countUnreadMessages_aggregatesAcrossChatGroups() {
        val groupOne = ChatGroupWithRelations(
            chatGroup = ChatGroup(
                id = "chat-1",
                name = "Chat One",
                userIds = listOf(currentUserId, "user-2"),
                hostId = currentUserId,
            ),
            users = emptyList(),
            messages = listOf(
                message(
                    id = "m-1",
                    userId = "user-2",
                    chatId = "chat-1",
                    readByIds = emptyList(),
                ),
                message(
                    id = "m-2",
                    userId = "user-2",
                    chatId = "chat-1",
                    readByIds = listOf(currentUserId),
                ),
            ),
        )
        val groupTwo = ChatGroupWithRelations(
            chatGroup = ChatGroup(
                id = "chat-2",
                name = "Chat Two",
                userIds = listOf(currentUserId, "user-3"),
                hostId = currentUserId,
            ),
            users = emptyList(),
            messages = listOf(
                message(
                    id = "m-3",
                    userId = "user-3",
                    chatId = "chat-2",
                    readByIds = emptyList(),
                ),
            ),
        )

        assertEquals(2, countUnreadMessages(listOf(groupOne, groupTwo), currentUserId))
    }

    private fun message(
        id: String,
        userId: String,
        chatId: String,
        readByIds: List<String>,
    ): MessageMVP = MessageMVP(
        id = id,
        userId = userId,
        body = "message $id",
        attachmentUrls = emptyList(),
        chatId = chatId,
        readByIds = readByIds,
        sentTime = Instant.fromEpochMilliseconds(1),
    )
}
