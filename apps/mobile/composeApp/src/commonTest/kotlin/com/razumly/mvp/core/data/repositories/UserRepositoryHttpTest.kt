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
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef
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
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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
    override val getChatGroupDao: ChatGroupDao get() = error("unused")
    override val getMessageDao: MessageDao get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao get() = error("unused")
}

private fun outgoingBodyText(content: OutgoingContent): String = when (content) {
    is OutgoingContent.ByteArrayContent -> content.bytes().decodeToString()
    else -> error("Unsupported outgoing content ${content::class.simpleName}")
}

class UserRepositoryHttpTest {
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
                          "staffTypes": ["REFEREE"],
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
                    staffTypes = listOf("referee"),
                    replaceStaffTypes = true,
                ),
            ),
        ).getOrThrow()

        assertEquals(1, invites.size)
        assertTrue(requestBody.contains("\"replaceStaffTypes\":true"))
        assertTrue(requestBody.contains("\"staffTypes\":[\"REFEREE\"]"))
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
