package com.razumly.mvp.core.data.repositories

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.ChatUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.daos.ChatGroupDao
import com.razumly.mvp.core.data.dataTypes.daos.EventDao
import com.razumly.mvp.core.data.dataTypes.daos.EventRegistrationDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.MessageDao
import com.razumly.mvp.core.data.dataTypes.daos.RefundRequestDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.InviteCreateDto
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
import io.ktor.http.content.OutgoingContent
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private class UserRepositoryHttp_InMemoryAuthTokenStore(
    private var token: String = "",
) : AuthTokenStore {
    override suspend fun get(): String = token
    override suspend fun set(token: String) { this.token = token }
    override suspend fun clear() { token = "" }
}

private class UserRepositoryHttp_InMemoryPreferencesDataStore(
    initial: Preferences = emptyPreferences(),
) : DataStore<Preferences> {
    private val mutex = Mutex()
    private val state = MutableStateFlow(initial)

    override val data: Flow<Preferences> = state

    override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences): Preferences {
        return mutex.withLock {
            val updated = transform(state.value)
            state.value = updated
            updated
        }
    }
}

private class UserRepositoryHttp_FakeUserDataDao : UserDataDao {
    override suspend fun upsertUserData(userData: UserData) {}
    override suspend fun upsertUsersData(usersData: List<UserData>) {}
    override suspend fun deleteUsersById(ids: List<String>) {}
    override suspend fun upsertUserEventCrossRef(crossRef: EventUserCrossRef) {}
    override suspend fun upsertUserEventCrossRefs(crossRefs: List<EventUserCrossRef>) {}
    override suspend fun upsertUserTeamCrossRefs(crossRefs: List<TeamPlayerCrossRef>) {}
    override suspend fun deleteUserData(userData: UserData) {}
    override suspend fun deleteTeamCrossRefById(userIds: List<String>) {}
    override suspend fun getUserDataById(id: String): UserData? = null
    override suspend fun getUserDatasById(ids: List<String>): List<UserData> = emptyList()
    override fun getUserDatasByIdFlow(ids: List<String>): Flow<List<UserData>> = flowOf(emptyList())
    override fun getUserFlowById(id: String): Flow<UserData?> = flowOf(null)
    override suspend fun searchUsers(search: String): List<UserData> = emptyList()
}

private class UserRepositoryHttp_FakeChatGroupDao : ChatGroupDao {
    val deletedChatIds = mutableListOf<String>()

    override suspend fun upsertChatGroup(chatGroup: ChatGroup) {}
    override suspend fun upsertChatGroups(chatGroups: List<ChatGroup>) {}
    override suspend fun upsertChatGroupUserCrossRef(crossRef: ChatUserCrossRef) {}
    override suspend fun deleteChatGroup(chatGroup: ChatGroup) {}
    override suspend fun deleteChatGroupUserCrossRef(crossRef: ChatUserCrossRef) {}
    override suspend fun deleteChatGroupUserCrossRefsByChatId(id: String) {}
    override suspend fun deleteChatGroupsByIds(ids: List<String>) {
        deletedChatIds.addAll(ids)
    }
    override fun getChatGroupsFlowByUserId(userId: String): Flow<List<ChatGroupWithRelations>> = flowOf(emptyList())
    override suspend fun getChatGroupsByUserId(userId: String): List<ChatGroup> = emptyList()
    override suspend fun getChatGroupWithRelations(userId: String): ChatGroupWithRelations = error("unused")
    override fun getChatGroupFlowById(id: String): Flow<ChatGroupWithRelations> = flowOf(error("unused"))
}

private class UserRepositoryHttp_UnusedEventDao : EventDao {
    override suspend fun upsertEvent(game: Event) {}
    override suspend fun upsertEvents(games: List<Event>) {}
    override suspend fun deleteEvent(game: Event) {}
    override suspend fun deleteEventsById(ids: List<String>) {}
    override suspend fun deleteAllEvents() {}
    override fun getAllCachedEvents(): Flow<List<Event>> = flowOf(emptyList())
    override suspend fun getEventTeamCrossRefsByEventId(eventId: String): List<EventTeamCrossRef> = emptyList()
    override suspend fun upsertEventTeamCrossRefs(crossRefs: List<EventTeamCrossRef>) {}
    override suspend fun deleteEventTeamCrossRefs(crossRefs: List<EventTeamCrossRef>) {}
    override suspend fun getEventUserCrossRefsByEventId(eventId: String): List<EventUserCrossRef> = emptyList()
    override suspend fun deleteEventUserCrossRefs(crossRefs: List<EventUserCrossRef>) {}
    override suspend fun deleteEventById(id: String) {}
    override suspend fun getEventById(id: String): Event? = null
    override suspend fun getEventsByIds(ids: List<String>): List<Event> = emptyList()
    override suspend fun getEventWithRelationsById(id: String) = error("unused")
    override fun getEventWithRelationsFlow(id: String) = error("unused")
    override suspend fun upsertEventWithRelations(event: Event) {}
    override suspend fun deleteEventWithCrossRefs(eventId: String) {}
    override suspend fun deleteEventCrossRefs(eventId: String) {}
    override suspend fun deleteEventUserCrossRefsByEventId(eventId: String) {}
    override suspend fun deleteEventTeamCrossRefsByEventId(eventId: String) {}
}

private class UserRepositoryHttp_UnusedTeamDao : TeamDao {
    override suspend fun upsertTeam(team: Team) {}
    override suspend fun upsertTeams(teams: List<Team>) {}
    override suspend fun getTeam(teamId: String): Team = error("unused")
    override suspend fun getTeams(teamIds: List<String>): List<Team> = emptyList()
    override suspend fun getTeamsForUser(userId: String): List<Team> = emptyList()
    override fun getTeamsForUserFlow(userId: String): Flow<List<TeamWithPlayers>> = flowOf(emptyList())
    override suspend fun getTeamInvitesForUser(userId: String): List<Team> = emptyList()
    override fun getTeamInvitesForUserFlow(userId: String): Flow<List<TeamWithPlayers>> = flowOf(emptyList())
    override suspend fun deleteTeamsByIds(ids: List<String>) {}
    override suspend fun getTeamPlayerCrossRefsByTeamId(teamId: String): List<TeamPlayerCrossRef> = emptyList()
    override suspend fun deleteTeam(team: Team) {}
    override suspend fun upsertTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef) {}
    override suspend fun upsertTeamPendingPlayerCrossRef(crossRef: TeamPendingPlayerCrossRef) {}
    override suspend fun upsertTeamPlayerCrossRefs(crossRefs: List<TeamPlayerCrossRef>) {}
    override suspend fun upsertTeamPendingPlayerCrossRefs(crossRefs: List<TeamPendingPlayerCrossRef>) {}
    override suspend fun deleteTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef) {}
    override suspend fun deleteTeamPlayerCrossRefs(crossRefs: List<TeamPlayerCrossRef>) {}
    override suspend fun deleteTeamPendingPlayerCrossRef(crossRef: TeamPendingPlayerCrossRef) {}
    override suspend fun deleteTeamPlayerCrossRefsByTeamId(teamId: String) {}
    override suspend fun deleteTeamPendingPlayerCrossRefsByTeamId(teamId: String) {}
    override suspend fun getTeamWithPlayers(teamId: String): TeamWithPlayers = error("unused")
    override fun getTeamWithPlayersFlow(teamId: String): Flow<TeamWithRelations?> = error("unused")
    override suspend fun getTeamsWithPlayers(teamIds: List<String>): List<TeamWithRelations> = emptyList()
    override fun getTeamsWithPlayersFlowByIds(ids: List<String>): Flow<List<TeamWithPlayers>> = flowOf(emptyList())
    override suspend fun upsertTeamWithRelations(team: Team) {}
    override suspend fun upsertTeamsWithRelations(teams: List<Team>) {}
}

private class UserRepositoryHttp_FakeDatabaseService : DatabaseService {
    override val getMatchDao: MatchDao get() = error("unused")
    override val getTeamDao: TeamDao = UserRepositoryHttp_UnusedTeamDao()
    override val getFieldDao: FieldDao get() = error("unused")
    override val getUserDataDao: UserDataDao = UserRepositoryHttp_FakeUserDataDao()
    override val getEventDao: EventDao = UserRepositoryHttp_UnusedEventDao()
    override val getEventRegistrationDao: EventRegistrationDao get() = error("unused")
    override val getChatGroupDao: ChatGroupDao = UserRepositoryHttp_FakeChatGroupDao()
    override val getMessageDao: MessageDao get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao get() = error("unused")
}

private fun outgoingBodyText(content: OutgoingContent): String = when (content) {
    is OutgoingContent.ByteArrayContent -> content.bytes().decodeToString()
    else -> error("Unsupported outgoing content ${content::class.simpleName}")
}

class UserRepositoryHttpTest {
    @Test
    fun getChatTermsConsentState_reads_server_payload() = runTest {
        val engine = MockEngine { request ->
            assertEquals("http://localhost/api/chat/terms-consent", request.url.toString())
            assertEquals(HttpMethod.Get, request.method)
            respond(
                content = """
                    {
                      "accepted": false,
                      "acceptedAt": null,
                      "version": "2026-04-14",
                      "url": "/terms",
                      "summary": ["No tolerance for objectionable content."]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val client = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val prefsStore = UserRepositoryHttp_InMemoryPreferencesDataStore()
        val repository = UserRepository(
            databaseService = UserRepositoryHttp_FakeDatabaseService(),
            api = MvpApiClient(client, "http://localhost", UserRepositoryHttp_InMemoryAuthTokenStore()),
            tokenStore = UserRepositoryHttp_InMemoryAuthTokenStore(),
            currentUserDataSource = CurrentUserDataSource(prefsStore),
        )

        val state = repository.getChatTermsConsentState().getOrThrow()

        assertEquals(false, state.accepted)
        assertEquals("2026-04-14", state.version)
        assertEquals("/terms", state.url)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun acceptChatTermsConsent_updates_cached_current_user_profile() = runTest {
        val engine = MockEngine { request ->
            assertEquals("/api/chat/terms-consent", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            respond(
                content = """
                    {
                      "accepted": true,
                      "acceptedAt": "2026-04-14T12:00:00Z",
                      "version": "2026-04-14",
                      "url": "/terms",
                      "summary": ["No tolerance for objectionable content."]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val client = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val prefsStore = UserRepositoryHttp_InMemoryPreferencesDataStore()
        val repository = UserRepository(
            databaseService = UserRepositoryHttp_FakeDatabaseService(),
            api = MvpApiClient(client, "http://localhost", UserRepositoryHttp_InMemoryAuthTokenStore()),
            tokenStore = UserRepositoryHttp_InMemoryAuthTokenStore(),
            currentUserDataSource = CurrentUserDataSource(prefsStore),
        )
        val state = repository.acceptChatTermsConsent().getOrThrow()

        assertEquals(true, state.accepted)
        assertEquals("2026-04-14", state.version)
        assertEquals("2026-04-14T12:00:00Z", state.acceptedAt)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun blockUser_removes_returned_chats_and_updates_current_user_block_list() = runTest {
        val fakeDatabase = UserRepositoryHttp_FakeDatabaseService()
        val fakeChatGroupDao = fakeDatabase.getChatGroupDao as UserRepositoryHttp_FakeChatGroupDao
        val engine = MockEngine { request ->
            assertEquals("http://localhost/api/users/social/blocked", request.url.toString())
            assertEquals(HttpMethod.Post, request.method)
            respond(
                content = """
                    {
                      "user": {
                        "id": "user_1",
                        "firstName": "Sam",
                        "lastName": "Player",
                        "teamIds": [],
                        "friendIds": [],
                        "friendRequestIds": [],
                        "friendRequestSentIds": [],
                        "followingIds": [],
                        "blockedUserIds": ["user_2"],
                        "hiddenEventIds": [],
                        "userName": "sam_player",
                        "hasStripeAccount": false,
                        "uploadedImages": [],
                        "profileImageId": null,
                        "chatTermsAcceptedAt": null,
                        "chatTermsVersion": null
                      },
                      "removedChatIds": ["chat_1", "chat_2"]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val client = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val prefsStore = UserRepositoryHttp_InMemoryPreferencesDataStore()
        val repository = UserRepository(
            databaseService = fakeDatabase,
            api = MvpApiClient(client, "http://localhost", UserRepositoryHttp_InMemoryAuthTokenStore()),
            tokenStore = UserRepositoryHttp_InMemoryAuthTokenStore(),
            currentUserDataSource = CurrentUserDataSource(prefsStore),
        )
        advanceUntilIdle()
        repository.setCachedCurrentUserProfile(
            UserData(
                firstName = "Sam",
                lastName = "Player",
                teamIds = emptyList(),
                friendIds = listOf("user_2"),
                friendRequestIds = emptyList(),
                friendRequestSentIds = emptyList(),
                followingIds = listOf("user_2"),
                userName = "sam_player",
                hasStripeAccount = false,
                uploadedImages = emptyList(),
                profileImageId = null,
                id = "user_1",
            )
        ).getOrThrow()

        val removedChatIds = repository.blockUser("user_2", leaveSharedChats = true).getOrThrow()
        val cachedUser = repository.currentUser.value.getOrNull()

        assertEquals(listOf("chat_1", "chat_2"), removedChatIds)
        assertEquals(listOf("chat_1", "chat_2"), fakeChatGroupDao.deletedChatIds)
        assertEquals(listOf("user_2"), cachedUser?.blockedUserIds)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun unblockUser_updates_current_user_block_list() = runTest {
        val engine = MockEngine { request ->
            assertEquals("/api/users/social/blocked/user_2", request.url.encodedPath)
            assertEquals(HttpMethod.Delete, request.method)
            respond(
                content = """
                    {
                      "user": {
                        "id": "user_1",
                        "firstName": "Sam",
                        "lastName": "Player",
                        "teamIds": [],
                        "friendIds": [],
                        "friendRequestIds": [],
                        "friendRequestSentIds": [],
                        "followingIds": [],
                        "blockedUserIds": [],
                        "hiddenEventIds": [],
                        "userName": "sam_player",
                        "hasStripeAccount": false,
                        "uploadedImages": [],
                        "profileImageId": null,
                        "chatTermsAcceptedAt": null,
                        "chatTermsVersion": null
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val client = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val prefsStore = UserRepositoryHttp_InMemoryPreferencesDataStore()
        val repository = UserRepository(
            databaseService = UserRepositoryHttp_FakeDatabaseService(),
            api = MvpApiClient(client, "http://localhost", UserRepositoryHttp_InMemoryAuthTokenStore()),
            tokenStore = UserRepositoryHttp_InMemoryAuthTokenStore(),
            currentUserDataSource = CurrentUserDataSource(prefsStore),
        )
        advanceUntilIdle()
        repository.setCachedCurrentUserProfile(
            UserData(
                firstName = "Sam",
                lastName = "Player",
                teamIds = emptyList(),
                friendIds = emptyList(),
                friendRequestIds = emptyList(),
                friendRequestSentIds = emptyList(),
                followingIds = emptyList(),
                blockedUserIds = listOf("user_2"),
                userName = "sam_player",
                hasStripeAccount = false,
                uploadedImages = emptyList(),
                profileImageId = null,
                id = "user_1",
            )
        ).getOrThrow()

        repository.unblockUser("user_2").getOrThrow()
        val cachedUser = repository.currentUser.value.getOrNull()

        assertEquals(emptyList(), cachedUser?.blockedUserIds)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun updateUser_omits_teamIds_from_patch_and_uses_server_memberships() = runTest {
        var requestBody = ""
        val engine = MockEngine { request ->
            assertEquals("/api/users/user_1", request.url.encodedPath)
            assertEquals(HttpMethod.Patch, request.method)
            requestBody = outgoingBodyText(request.body)
            respond(
                content = """
                    {
                      "user": {
                        "id": "user_1",
                        "firstName": "Sam",
                        "lastName": "Player",
                        "teamIds": ["team_server"],
                        "friendIds": [],
                        "friendRequestIds": [],
                        "friendRequestSentIds": [],
                        "followingIds": [],
                        "blockedUserIds": [],
                        "hiddenEventIds": [],
                        "userName": "sam_player",
                        "hasStripeAccount": false,
                        "uploadedImages": [],
                        "profileImageId": null,
                        "chatTermsAcceptedAt": null,
                        "chatTermsVersion": null
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val client = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val prefsStore = UserRepositoryHttp_InMemoryPreferencesDataStore()
        val repository = UserRepository(
            databaseService = UserRepositoryHttp_FakeDatabaseService(),
            api = MvpApiClient(client, "http://localhost", UserRepositoryHttp_InMemoryAuthTokenStore()),
            tokenStore = UserRepositoryHttp_InMemoryAuthTokenStore(),
            currentUserDataSource = CurrentUserDataSource(prefsStore),
        )
        advanceUntilIdle()
        repository.setCachedCurrentUserProfile(
            UserData(
                firstName = "Sam",
                lastName = "Player",
                teamIds = listOf("team_client"),
                friendIds = emptyList(),
                friendRequestIds = emptyList(),
                friendRequestSentIds = emptyList(),
                followingIds = emptyList(),
                userName = "sam_player",
                hasStripeAccount = false,
                uploadedImages = emptyList(),
                profileImageId = null,
                id = "user_1",
            )
        ).getOrThrow()

        val updated = repository.updateUser(
            UserData(
                firstName = "Sam",
                lastName = "Player",
                teamIds = listOf("team_client"),
                friendIds = emptyList(),
                friendRequestIds = emptyList(),
                friendRequestSentIds = emptyList(),
                followingIds = emptyList(),
                userName = "sam_player",
                hasStripeAccount = false,
                uploadedImages = emptyList(),
                profileImageId = null,
                id = "user_1",
            )
        ).getOrThrow()

        assertTrue(!requestBody.contains("\"teamIds\""), "Expected teamIds to be omitted from user PATCH payloads.")
        assertEquals(listOf("team_server"), updated.teamIds)
        assertEquals(listOf("team_server"), repository.currentUser.value.getOrThrow().teamIds)
    }

    @Test
    fun createInvites_posts_replace_staff_types_and_returns_invites() = runTest {
        var requestBody = ""
        val engine = MockEngine { request ->
            assertEquals("http://localhost/api/invites", request.url.toString())
            assertEquals(HttpMethod.Post, request.method)
            requestBody = outgoingBodyText(request.body)
            respond(
                content = """
                    {
                      "invites": [
                        {
                          "type": "STAFF",
                          "email": "ref@example.com",
                          "staffTypes": ["OFFICIAL"],
                          "eventId": "event_1",
                          "userId": "user_1",
                          "id": "invite_1"
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val client = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val prefsStore = UserRepositoryHttp_InMemoryPreferencesDataStore()
        val repository = UserRepository(
            databaseService = UserRepositoryHttp_FakeDatabaseService(),
            api = MvpApiClient(client, "http://localhost", UserRepositoryHttp_InMemoryAuthTokenStore()),
            tokenStore = UserRepositoryHttp_InMemoryAuthTokenStore(),
            currentUserDataSource = CurrentUserDataSource(prefsStore),
        )

        val invites = repository.createInvites(
            listOf(
                InviteCreateDto(
                    type = "STAFF",
                    email = " Ref@example.com ",
                    eventId = "event_1",
                    userId = "user_1",
                    staffTypes = listOf("official"),
                    replaceStaffTypes = true,
                ),
            ),
        ).getOrThrow()

        assertEquals(1, invites.size)
        assertTrue(requestBody.contains("\"replaceStaffTypes\":true"))
        assertTrue(requestBody.contains("\"staffTypes\":[\"OFFICIAL\"]"))
        assertTrue(requestBody.contains("\"email\":\"ref@example.com\""))
    }

    @Test
    fun findEmailMembership_posts_normalized_payload_and_maps_matches() = runTest {
        var requestBody = ""
        val engine = MockEngine { request ->
            assertEquals("http://localhost/api/users/email-membership", request.url.toString())
            assertEquals(HttpMethod.Post, request.method)
            requestBody = outgoingBodyText(request.body)
            respond(
                content = """
                    {
                      "matches": [
                        { "email": "ref@example.com", "userId": "user_1" }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val client = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val prefsStore = UserRepositoryHttp_InMemoryPreferencesDataStore()
        val repository = UserRepository(
            databaseService = UserRepositoryHttp_FakeDatabaseService(),
            api = MvpApiClient(client, "http://localhost", UserRepositoryHttp_InMemoryAuthTokenStore()),
            tokenStore = UserRepositoryHttp_InMemoryAuthTokenStore(),
            currentUserDataSource = CurrentUserDataSource(prefsStore),
        )

        val matches = repository.findEmailMembership(
            emails = listOf(" Ref@example.com ", "ref@example.com"),
            userIds = listOf(" user_1 ", "user_1", "user_2"),
        ).getOrThrow()

        assertEquals(listOf(UserEmailMembershipMatch(email = "ref@example.com", userId = "user_1")), matches)
        assertTrue(requestBody.contains("\"emails\":[\"ref@example.com\"]"))
        assertTrue(requestBody.contains("\"userIds\":[\"user_1\",\"user_2\"]"))
    }
}
