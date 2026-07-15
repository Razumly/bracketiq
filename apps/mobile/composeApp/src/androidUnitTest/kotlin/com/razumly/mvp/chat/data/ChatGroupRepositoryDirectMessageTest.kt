package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.daos.ChatGroupDao
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.configureMvpHttpClient
import com.razumly.mvp.core.network.dto.CreateChatGroupRequestDto
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.headersOf
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class ChatGroupRepositoryDirectMessageTest {
    @Test
    fun directMessage_postsOnce_acrossRoomEmissions_andUsesCanonicalServerChatId() = runTest {
        val currentUser = user(id = CURRENT_USER_ID, firstName = "Current")
        val otherUser = user(id = OTHER_USER_ID, firstName = "Other")
        val localDuplicate = ChatGroupWithRelations(
            chatGroup = ChatGroup(
                id = LOCAL_CHAT_ID,
                name = "Cached direct message",
                userIds = listOf(CURRENT_USER_ID, OTHER_USER_ID),
                hostId = CURRENT_USER_ID,
            ),
            users = listOf(currentUser, otherUser),
            messages = emptyList(),
        )
        val roomGroups = MutableSharedFlow<List<ChatGroupWithRelations>>(
            replay = 1,
            extraBufferCapacity = 8,
        )
        assertTrue(roomGroups.tryEmit(listOf(localDuplicate)))

        val chatGroupDao = mockk<ChatGroupDao>(relaxed = true)
        every { chatGroupDao.getChatGroupsFlowByUserId(CURRENT_USER_ID) } returns
            roomGroups
        coEvery { chatGroupDao.getChatGroupsByUserId(CURRENT_USER_ID) } returns
            listOf(localDuplicate.chatGroup)
        val persistedChatGroups = mutableListOf<ChatGroup>()
        val canonicalPersisted = CompletableDeferred<Unit>()
        coEvery { chatGroupDao.upsertChatGroupWithRelations(any()) } answers {
            val persisted = firstArg<ChatGroup>()
            persistedChatGroups += persisted
            roomGroups.tryEmit(
                listOf(
                    ChatGroupWithRelations(
                        chatGroup = persisted,
                        users = listOf(currentUser, otherUser),
                        messages = emptyList(),
                    )
                )
            )
            canonicalPersisted.complete(Unit)
        }

        val databaseService = mockk<DatabaseService>(relaxed = true)
        every { databaseService.getChatGroupDao } returns chatGroupDao

        val userRepository = mockk<IUserRepository>()
        every { userRepository.currentUser } returns
            MutableStateFlow(Result.success(currentUser))
        coEvery { userRepository.getUsers(any(), any()) } answers {
            val requestedIds = firstArg<List<String>>()
            Result.success(listOf(currentUser, otherUser).filter { it.id in requestedIds })
        }

        val firstPostRequest = CompletableDeferred<CreateChatGroupRequestDto>()
        val secondPostObserved = CompletableDeferred<Unit>()
        var postCount = 0
        var failCanonicalPost = false
        val engine = MockEngine { request ->
            when (request.method) {
                HttpMethod.Get -> {
                    assertEquals("/api/chat/groups", request.url.encodedPath)
                    respondJson("""{"groups": []}""")
                }

                HttpMethod.Post -> {
                    postCount += 1
                    assertEquals("/api/chat/groups", request.url.encodedPath)
                    val postedRequest = jsonMVP.decodeFromString<CreateChatGroupRequestDto>(
                        (request.body as OutgoingContent.ByteArrayContent).bytes().decodeToString(),
                    )
                    if (postCount == 1) {
                        firstPostRequest.complete(postedRequest)
                    } else {
                        secondPostObserved.complete(Unit)
                    }
                    if (failCanonicalPost) {
                        respondJson(
                            """{"error":"offline"}""",
                            status = HttpStatusCode.ServiceUnavailable,
                        )
                    } else {
                        respondJson(
                            """
                            {
                              "id": "$CANONICAL_CHAT_ID",
                              "name": "Current & Other",
                              "userIds": ["$CURRENT_USER_ID", "$OTHER_USER_ID"],
                              "hostId": "$CURRENT_USER_ID"
                            }
                            """.trimIndent(),
                            status = HttpStatusCode.Created,
                        )
                    }
                }

                else -> error("Unexpected ${request.method.value} ${request.url.encodedPath}")
            }
        }
        val http = HttpClient(engine) { configureMvpHttpClient() }

        try {
            val repository = ChatGroupRepository(
                api = MvpApiClient(
                    http = http,
                    baseUrl = "http://example.test",
                    tokenStore = EmptyAuthTokenStore,
                ),
                databaseService = databaseService,
                userRepository = userRepository,
                messageRepository = mockk<IMessageRepository>(relaxed = true),
                teamRepository = mockk<ITeamRepository>(relaxed = true),
            )

            val resolvedIds = mutableListOf<String>()
            val collection = launch(UnconfinedTestDispatcher(testScheduler)) {
                repository.getChatGroupFlow(
                    messageUserId = OTHER_USER_ID,
                    chatId = null,
                ).collect { result ->
                    result.getOrNull()?.let { resolvedIds += it.chatGroup.id }
                }
            }
            advanceUntilIdle()
            val posted = firstPostRequest.await()
            canonicalPersisted.await()
            advanceUntilIdle()

            assertEquals(listOf(CURRENT_USER_ID, OTHER_USER_ID), posted.userIds)
            assertNotEquals(LOCAL_CHAT_ID, posted.id)
            assertEquals(LOCAL_CHAT_ID, resolvedIds.first())
            assertEquals(CANONICAL_CHAT_ID, resolvedIds.last())
            assertNotEquals(posted.id, resolvedIds.last())
            assertEquals(
                listOf(CANONICAL_CHAT_ID),
                persistedChatGroups.map(ChatGroup::id),
            )
            assertEquals(1, postCount)

            // Simulate both a stale duplicate invalidation and a later
            // canonical Room refresh. Neither may trigger another POST.
            assertTrue(
                roomGroups.tryEmit(
                    listOf(
                        localDuplicate.copy(
                            chatGroup = localDuplicate.chatGroup.copy(name = "Stale cached direct message")
                        )
                    )
                )
            )
            assertTrue(
                roomGroups.tryEmit(
                    listOf(
                        ChatGroupWithRelations(
                            chatGroup = persistedChatGroups.single().copy(name = "Canonical refresh"),
                            users = listOf(currentUser, otherUser),
                            messages = emptyList(),
                        )
                    )
                )
            )
            advanceUntilIdle()

            assertEquals(1, postCount)
            assertEquals(CANONICAL_CHAT_ID, resolvedIds.last())
            collection.cancel()

            // A new collector gets one new canonical attempt, but a failed
            // attempt must keep serving the cached canonical conversation.
            failCanonicalPost = true
            val offlineResults = mutableListOf<Result<ChatGroupWithRelations>>()
            val offlineCollection = launch(UnconfinedTestDispatcher(testScheduler)) {
                repository.getChatGroupFlow(
                    messageUserId = OTHER_USER_ID,
                    chatId = null,
                ).collect { result -> offlineResults += result }
            }
            advanceUntilIdle()
            secondPostObserved.await()
            advanceUntilIdle()

            assertEquals(2, postCount)
            assertTrue(offlineResults.isNotEmpty())
            assertTrue(offlineResults.all { result -> result.isSuccess })
            assertEquals(
                setOf(CANONICAL_CHAT_ID),
                offlineResults.mapNotNull { it.getOrNull()?.chatGroup?.id }.toSet(),
            )
            offlineCollection.cancel()
        } finally {
            http.close()
        }
    }

    private fun user(id: String, firstName: String) = UserData(
        firstName = firstName,
        lastName = "Tester",
        teamIds = emptyList(),
        friendIds = emptyList(),
        friendRequestIds = emptyList(),
        friendRequestSentIds = emptyList(),
        followingIds = emptyList(),
        userName = firstName.lowercase(),
        hasStripeAccount = false,
        uploadedImages = emptyList(),
        id = id,
    )

    private fun io.ktor.client.engine.mock.MockRequestHandleScope.respondJson(
        body: String,
        status: HttpStatusCode = HttpStatusCode.OK,
    ) = respond(
        content = body,
        status = status,
        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
    )

    private object EmptyAuthTokenStore : AuthTokenStore {
        override suspend fun get(): String = ""
        override suspend fun set(token: String) = Unit
        override suspend fun clear() = Unit
    }

    private companion object {
        const val CURRENT_USER_ID = "user-current"
        const val OTHER_USER_ID = "user-other"
        const val LOCAL_CHAT_ID = "chat-local-duplicate"
        const val CANONICAL_CHAT_ID = "chat-server-canonical"
    }
}
