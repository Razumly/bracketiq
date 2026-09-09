package com.razumly.mvp.core.data

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.db.MVPDatabaseService
import kotlinx.coroutines.runBlocking
import kotlin.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MessageDaoBehaviorTest {

    @Test
    fun given_sameTimestampCachedMessages_when_messageDaoOrders_then_sortsById() = runBlocking {
        val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(
            InstrumentationRegistry.getInstrumentation().targetContext,
        ).allowMainThreadQueries().build()

        try {
            database.getMessageDao.upsertMessages(
                listOf(
                    MessageMVP(
                        id = "message_z",
                        userId = "user_1",
                        body = "later",
                        attachmentUrls = emptyList(),
                        chatId = "chat_1",
                        readByIds = emptyList(),
                        sentTime = Instant.parse("2026-07-12T12:01:00Z"),
                    ),
                    MessageMVP(
                        id = "message_b",
                        userId = "user_1",
                        body = "tie second",
                        attachmentUrls = emptyList(),
                        chatId = "chat_1",
                        readByIds = emptyList(),
                        sentTime = Instant.parse("2026-07-12T12:00:00Z"),
                    ),
                    MessageMVP(
                        id = "message_a",
                        userId = "user_2",
                        body = "tie first",
                        attachmentUrls = emptyList(),
                        chatId = "chat_1",
                        readByIds = emptyList(),
                        sentTime = Instant.parse("2026-07-12T12:00:00Z"),
                    ),
                    MessageMVP(
                        id = "other_chat",
                        userId = "user_1",
                        body = "ignore",
                        attachmentUrls = emptyList(),
                        chatId = "chat_2",
                        readByIds = emptyList(),
                        sentTime = Instant.parse("2026-07-12T11:59:00Z"),
                    ),
                ),
            )

            assertEquals(
                listOf("message_a", "message_b", "message_z"),
                database.getMessageDao.getMessagesInChatGroup("chat_1").map { message -> message.id },
            )
        } finally {
            database.close()
        }
    }
}
