package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.dataTypes.daos.ChatGroupDao
import com.razumly.mvp.core.data.dataTypes.daos.EventDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.MessageDao
import com.razumly.mvp.core.data.dataTypes.daos.RefundRequestDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private class MessageRepositoryHttp_InMemoryAuthTokenStore(
    private var token: String = "",
) : AuthTokenStore {
    override suspend fun get(): String = token
    override suspend fun set(token: String) { this.token = token }
    override suspend fun clear() { token = "" }
}

private class MessageRepositoryHttp_FakeMessageDao : MessageDao {
    private val messages: MutableMap<String, MessageMVP> = mutableMapOf()

    override suspend fun upsertMessages(messageMVPs: List<MessageMVP>) {
        messageMVPs.forEach { messages[it.id] = it }
    }

    override suspend fun upsertMessage(messageMVP: MessageMVP) {
        messages[messageMVP.id] = messageMVP
    }

    override suspend fun deleteMessage(messageMVP: MessageMVP) {
        messages.remove(messageMVP.id)
    }

    override suspend fun deleteMessages(ids: List<String>) {
        ids.forEach { messages.remove(it) }
    }

    override suspend fun deleteMessageById(id: String) {
        messages.remove(id)
    }

    override suspend fun getMessageById(id: String): MessageMVP? = messages[id]

    override suspend fun getMessagesInChatGroup(chatGroupId: String): List<MessageMVP> =
        messages.values.filter { it.chatId == chatGroupId }
}

private class MessageRepositoryHttp_FakeDatabaseService(
    override val getMessageDao: MessageDao,
) : DatabaseService {
    override val getMatchDao: MatchDao get() = error("unused")
    override val getTeamDao: TeamDao get() = error("unused")
    override val getFieldDao: FieldDao get() = error("unused")
    override val getUserDataDao: UserDataDao get() = error("unused")
    override val getEventDao: EventDao get() = error("unused")
    override val getChatGroupDao: ChatGroupDao get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao get() = error("unused")
}

class MessageRepositoryHttpTest {
    @OptIn(ExperimentalTime::class)
    @Test
    fun createMessage_posts_to_api_and_persists_to_cache() = runTest {
        val tokenStore = MessageRepositoryHttp_InMemoryAuthTokenStore("t123")
        val messageDao = MessageRepositoryHttp_FakeMessageDao()
        val db = MessageRepositoryHttp_FakeDatabaseService(messageDao)

        val engine = MockEngine { request ->
            assertEquals("/api/messages", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "id": "m1",
                      "body": "Hello",
                      "userId": "u1",
                      "chatId": "c1",
                      "sentTime": "2026-02-10T00:00:00Z",
                      "readByIds": ["u1"],
                      "attachmentUrls": []
                    }
                """.trimIndent(),
                status = HttpStatusCode.Created,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = MessageRepository(api, db)

        val message = MessageMVP(
            id = "m1",
            userId = "u1",
            body = "Hello",
            attachmentUrls = emptyList(),
            chatId = "c1",
            readByIds = listOf("u1"),
            sentTime = Instant.parse("2026-02-10T00:00:00Z"),
        )

        repo.createMessage(message).getOrThrow()

        val saved = messageDao.getMessageById("m1")
        assertNotNull(saved)
        assertEquals("Hello", saved.body)
        assertEquals("u1", saved.userId)
        assertEquals("c1", saved.chatId)
    }
}

