package com.razumly.mvp.core.data.repositories

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
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
import io.ktor.http.content.OutgoingContent
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

private class UserRepositoryAuth_InMemoryAuthTokenStore(
    private var token: String = "",
) : AuthTokenStore {
    override suspend fun get(): String = token
    override suspend fun set(token: String) { this.token = token }
    override suspend fun clear() { token = "" }
}

private class InMemoryPreferencesDataStore(
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

private class FakeUserDataDao : UserDataDao {
    private val users = MutableStateFlow<Map<String, UserData>>(emptyMap())

    override suspend fun upsertUserData(userData: UserData) {
        users.value = users.value + (userData.id to userData)
    }

    override suspend fun upsertUsersData(usersData: List<UserData>) {
        users.value = usersData.fold(users.value) { acc, user -> acc + (user.id to user) }
    }

    override suspend fun deleteUsersById(ids: List<String>) {
        users.value = users.value - ids.toSet()
    }

    override suspend fun upsertUserEventCrossRef(crossRef: EventUserCrossRef) {}
    override suspend fun upsertUserEventCrossRefs(crossRefs: List<EventUserCrossRef>) {}
    override suspend fun upsertUserTeamCrossRefs(crossRefs: List<TeamPlayerCrossRef>) {}

    override suspend fun deleteUserData(userData: UserData) {
        users.value = users.value - userData.id
    }

    override suspend fun deleteTeamCrossRefById(userIds: List<String>) {}

    override suspend fun getUserDataById(id: String): UserData? = users.value[id]

    override suspend fun getUserDatasById(ids: List<String>): List<UserData> = ids.mapNotNull { users.value[it] }

    override fun getUserDatasByIdFlow(ids: List<String>): Flow<List<UserData>> {
        val deduped = ids.distinct()
        return users.map { map -> deduped.mapNotNull { map[it] } }
    }

    override fun getUserFlowById(id: String): Flow<UserData?> = users.map { it[id] }

    override suspend fun searchUsers(search: String): List<UserData> {
        val term = search.lowercase()
        return users.value.values.filter {
            it.userName.lowercase().contains(term) ||
                it.firstName.lowercase().contains(term) ||
                it.lastName.lowercase().contains(term)
        }
    }
}

private class UserRepositoryAuth_FakeDatabaseService(
    override val getUserDataDao: UserDataDao,
) : DatabaseService {
    override val getMatchDao: MatchDao get() = error("unused")
    override val getTeamDao: TeamDao get() = error("unused")
    override val getFieldDao: FieldDao get() = error("unused")
    override val getEventDao: EventDao get() = error("unused")
    override val getChatGroupDao: ChatGroupDao get() = error("unused")
    override val getMessageDao: MessageDao get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao get() = error("unused")
}

class UserRepositoryAuthTest {
    @Test
    fun login_stores_token_and_sets_current_user_and_account() = runTest {
        val tokenStore = UserRepositoryAuth_InMemoryAuthTokenStore("")
        val userDao = FakeUserDataDao()
        val db = UserRepositoryAuth_FakeDatabaseService(userDao)
        val prefsStore = InMemoryPreferencesDataStore()
        val currentUserDataSource = CurrentUserDataSource(prefsStore)

        val engine = MockEngine { request ->
            assertEquals("/api/auth/login", request.url.encodedPath)
            respond(
                content = """
                    {
                      "user": { "id":"u1", "email":"u1@example.com", "name":"U1" },
                      "session": { "userId":"u1", "isAdmin":false },
                      "token":"t123",
                      "profile": {
                        "id":"u1",
                        "firstName":"A",
                        "lastName":"B",
                        "userName":"ab",
                        "teamIds":[],
                        "friendIds":[],
                        "friendRequestIds":[],
                        "friendRequestSentIds":[],
                        "followingIds":[],
                        "uploadedImages":[],
                        "hasStripeAccount":false
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }

        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = UserRepository(db, api, tokenStore, currentUserDataSource)

        val user = repo.login("u1@example.com", "password123").getOrThrow()
        assertEquals("u1", user.id)
        assertEquals("t123", tokenStore.get())
        assertEquals("u1", currentUserDataSource.getUserId().first())

        val account = repo.currentAccount.value.getOrThrow()
        assertEquals("u1", account.id)
        assertEquals("u1@example.com", account.email)
    }

    @Test
    fun loginWithGoogleIdToken_stores_token_and_sets_current_user_and_account() = runTest {
        val tokenStore = UserRepositoryAuth_InMemoryAuthTokenStore("")
        val userDao = FakeUserDataDao()
        val db = UserRepositoryAuth_FakeDatabaseService(userDao)
        val prefsStore = InMemoryPreferencesDataStore()
        val currentUserDataSource = CurrentUserDataSource(prefsStore)

        val engine = MockEngine { request ->
            assertEquals("/api/auth/google/mobile", request.url.encodedPath)
            respond(
                content = """
                    {
                      "user": { "id":"u_google", "email":"google@example.com", "name":"Google User" },
                      "session": { "userId":"u_google", "isAdmin":false },
                      "token":"google_token_123",
                      "profile": {
                        "id":"u_google",
                        "firstName":"Google",
                        "lastName":"User",
                        "userName":"google_user",
                        "teamIds":[],
                        "friendIds":[],
                        "friendRequestIds":[],
                        "friendRequestSentIds":[],
                        "followingIds":[],
                        "uploadedImages":[],
                        "hasStripeAccount":false
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }

        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = UserRepository(db, api, tokenStore, currentUserDataSource)

        val user = repo.loginWithGoogleIdToken("id_token_value").getOrThrow()
        assertEquals("u_google", user.id)
        assertEquals("google_token_123", tokenStore.get())
        assertEquals("u_google", currentUserDataSource.getUserId().first())

        val account = repo.currentAccount.value.getOrThrow()
        assertEquals("u_google", account.id)
        assertEquals("google@example.com", account.email)
    }

    @Test
    fun createNewUser_includes_date_of_birth_in_register_payload() = runTest {
        val tokenStore = UserRepositoryAuth_InMemoryAuthTokenStore("")
        val userDao = FakeUserDataDao()
        val db = UserRepositoryAuth_FakeDatabaseService(userDao)
        val prefsStore = InMemoryPreferencesDataStore()
        val currentUserDataSource = CurrentUserDataSource(prefsStore)
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/auth/register", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()
            respond(
                content = """
                    {
                      "user": { "id":"u_signup", "email":"signup@example.com", "name":"Signup User" },
                      "session": { "userId":"u_signup", "isAdmin":false },
                      "token":"signup_token",
                      "profile": {
                        "id":"u_signup",
                        "firstName":"Sign",
                        "lastName":"Up",
                        "userName":"signup_user",
                        "teamIds":[],
                        "friendIds":[],
                        "friendRequestIds":[],
                        "friendRequestSentIds":[],
                        "followingIds":[],
                        "uploadedImages":[],
                        "hasStripeAccount":false
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = UserRepository(db, api, tokenStore, currentUserDataSource)

        val created = repo.createNewUser(
            email = "signup@example.com",
            password = "password123",
            firstName = "Sign",
            lastName = "Up",
            userName = "signup_user",
            dateOfBirth = "2008-05-02",
        ).getOrThrow()

        assertEquals("u_signup", created.id)
        assertEquals("signup_token", tokenStore.get())
        assertEquals(true, capturedBody.contains("\"dateOfBirth\":\"2008-05-02\""))
    }

    @Test
    fun ensureUserByEmail_returns_public_user_and_persists_to_cache() = runTest {
        val tokenStore = UserRepositoryAuth_InMemoryAuthTokenStore("t123")
        val userDao = FakeUserDataDao()
        val db = UserRepositoryAuth_FakeDatabaseService(userDao)
        val prefsStore = InMemoryPreferencesDataStore()
        val currentUserDataSource = CurrentUserDataSource(prefsStore)

        val engine = MockEngine { request ->
            assertEquals("/api/users/ensure", request.url.encodedPath)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            respond(
                content = """
                    {
                      "user": {
                        "id":"u2",
                        "firstName":"Invited",
                        "lastName":"User",
                        "userName":"invited_user",
                        "teamIds":[],
                        "friendIds":[],
                        "friendRequestIds":[],
                        "friendRequestSentIds":[],
                        "followingIds":[],
                        "uploadedImages":[],
                        "hasStripeAccount":false
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }

        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = UserRepository(db, api, tokenStore, currentUserDataSource)

        val ensured = repo.ensureUserByEmail("u2@example.com").getOrThrow()
        assertEquals("u2", ensured.id)
        assertEquals("u2", userDao.getUserDataById("u2")?.id)
    }

    @Test
    fun listChildren_gets_and_maps_family_children() = runTest {
        val tokenStore = UserRepositoryAuth_InMemoryAuthTokenStore("t123")
        val userDao = FakeUserDataDao()
        val db = UserRepositoryAuth_FakeDatabaseService(userDao)
        val prefsStore = InMemoryPreferencesDataStore()
        val currentUserDataSource = CurrentUserDataSource(prefsStore)

        val engine = MockEngine { request ->
            assertEquals("/api/family/children", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            respond(
                content = """
                    {
                      "children": [
                        {
                          "userId": "child_1",
                          "firstName": "Kid",
                          "lastName": "One",
                          "dateOfBirth": "2015-04-12T00:00:00.000Z",
                          "age": 10,
                          "linkStatus": "active",
                          "email": null,
                          "hasEmail": false
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = UserRepository(db, api, tokenStore, currentUserDataSource)

        val children = repo.listChildren().getOrThrow()

        assertEquals(1, children.size)
        assertEquals("child_1", children.first().userId)
        assertEquals("Kid", children.first().firstName)
        assertEquals("active", children.first().linkStatus)
    }

    @Test
    fun createChildAccount_posts_to_family_children_endpoint() = runTest {
        val tokenStore = UserRepositoryAuth_InMemoryAuthTokenStore("t123")
        val userDao = FakeUserDataDao()
        val db = UserRepositoryAuth_FakeDatabaseService(userDao)
        val prefsStore = InMemoryPreferencesDataStore()
        val currentUserDataSource = CurrentUserDataSource(prefsStore)

        val engine = MockEngine { request ->
            assertEquals("/api/family/children", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            respond(
                content = """{"childUserId":"child_2","linkId":"link_1","status":"active"}""",
                status = HttpStatusCode.Created,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = UserRepository(db, api, tokenStore, currentUserDataSource)

        val result = repo.createChildAccount(
            firstName = "Kid",
            lastName = "Two",
            dateOfBirth = "2016-01-20",
            email = "kid.two@example.com",
            relationship = "parent",
        )

        assertEquals(true, result.isSuccess)
    }

    @Test
    fun updateChildAccount_patches_family_child_endpoint() = runTest {
        val tokenStore = UserRepositoryAuth_InMemoryAuthTokenStore("t123")
        val userDao = FakeUserDataDao()
        val db = UserRepositoryAuth_FakeDatabaseService(userDao)
        val prefsStore = InMemoryPreferencesDataStore()
        val currentUserDataSource = CurrentUserDataSource(prefsStore)

        val engine = MockEngine { request ->
            assertEquals("/api/family/children/child_2", request.url.encodedPath)
            assertEquals(HttpMethod.Patch, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            respond(
                content = """{}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = UserRepository(db, api, tokenStore, currentUserDataSource)

        val result = repo.updateChildAccount(
            childUserId = "child_2",
            firstName = "Kid",
            lastName = "Two",
            dateOfBirth = "2016-01-20",
            email = "kid.two@example.com",
            relationship = "parent",
        )

        assertEquals(true, result.isSuccess)
    }

    @Test
    fun linkChildToParent_without_email_or_id_fails_fast() = runTest {
        val tokenStore = UserRepositoryAuth_InMemoryAuthTokenStore("t123")
        val userDao = FakeUserDataDao()
        val db = UserRepositoryAuth_FakeDatabaseService(userDao)
        val prefsStore = InMemoryPreferencesDataStore()
        val currentUserDataSource = CurrentUserDataSource(prefsStore)

        val engine = MockEngine { request ->
            error("Request should not be made: ${request.url}")
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = UserRepository(db, api, tokenStore, currentUserDataSource)

        val result = repo.linkChildToParent(
            childEmail = " ",
            childUserId = null,
            relationship = "parent",
        )

        assertEquals(true, result.isFailure)
    }
}
