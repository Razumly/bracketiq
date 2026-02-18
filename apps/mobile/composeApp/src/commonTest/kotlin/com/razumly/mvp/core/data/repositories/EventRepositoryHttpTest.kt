package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
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
import dev.icerock.moko.geo.LatLng
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
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private class EventRepositoryHttp_InMemoryAuthTokenStore(
    private var token: String = "",
) : AuthTokenStore {
    override suspend fun get(): String = token
    override suspend fun set(token: String) { this.token = token }
    override suspend fun clear() { token = "" }
}

private class EventRepositoryHttp_FakeEventDao : EventDao {
    private val events = MutableStateFlow<Map<String, Event>>(emptyMap())

    override suspend fun upsertEvent(game: Event) {
        events.value = events.value + (game.id to game)
    }

    override suspend fun upsertEvents(games: List<Event>) {
        events.value = games.fold(events.value) { acc, event -> acc + (event.id to event) }
    }

    override suspend fun deleteEvent(game: Event) {
        events.value = events.value - game.id
    }

    override suspend fun deleteEventsById(ids: List<String>) {
        events.value = events.value - ids.toSet()
    }

    override suspend fun deleteAllEvents() {
        // Avoid races with repository init cleanup in tests.
    }

    override fun getAllCachedEvents(): Flow<List<Event>> = events.map { it.values.toList() }

    override suspend fun getEventTeamCrossRefsByEventId(eventId: String): List<EventTeamCrossRef> = emptyList()
    override suspend fun upsertEventTeamCrossRefs(crossRefs: List<EventTeamCrossRef>) {}
    override suspend fun deleteEventTeamCrossRefs(crossRefs: List<EventTeamCrossRef>) {}
    override suspend fun getEventUserCrossRefsByEventId(eventId: String): List<EventUserCrossRef> = emptyList()
    override suspend fun deleteEventUserCrossRefs(crossRefs: List<EventUserCrossRef>) {}
    override suspend fun deleteEventById(id: String) { events.value = events.value - id }
    override suspend fun getEventById(id: String): Event? = events.value[id]
    override suspend fun getEventWithRelationsById(id: String): EventWithRelations = error("unused")
    override fun getEventWithRelationsFlow(id: String): Flow<EventWithRelations> = error("unused")
    override suspend fun upsertEventWithRelations(event: Event) { upsertEvent(event) }
    override suspend fun deleteEventWithCrossRefs(eventId: String) { deleteEventById(eventId) }
    override suspend fun deleteEventCrossRefs(eventId: String) {}
    override suspend fun deleteEventUserCrossRefsByEventId(eventId: String) {}
    override suspend fun deleteEventTeamCrossRefsByEventId(eventId: String) {}
}

private class EventRepositoryHttp_FakeUserDataDao : UserDataDao {
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

private class EventRepositoryHttp_FakeTeamDao : TeamDao {
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
    override suspend fun upsertTeamPendingPlayerCrossRef(crossRef: com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef) {}
    override suspend fun upsertTeamPlayerCrossRefs(crossRefs: List<TeamPlayerCrossRef>) {}
    override suspend fun upsertTeamPendingPlayerCrossRefs(crossRefs: List<com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef>) {}
    override suspend fun deleteTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef) {}
    override suspend fun deleteTeamPlayerCrossRefs(crossRefs: List<TeamPlayerCrossRef>) {}
    override suspend fun deleteTeamPendingPlayerCrossRef(crossRef: com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef) {}
    override suspend fun deleteTeamPlayerCrossRefsByTeamId(teamId: String) {}
    override suspend fun deleteTeamPendingPlayerCrossRefsByTeamId(teamId: String) {}
    override suspend fun getTeamWithPlayers(teamId: String): TeamWithPlayers = error("unused")
    override fun getTeamWithPlayersFlow(teamId: String): Flow<TeamWithRelations> = error("unused")
    override suspend fun getTeamsWithPlayers(teamIds: List<String>): List<TeamWithRelations> = error("unused")
    override fun getTeamsWithPlayersFlowByIds(ids: List<String>): Flow<List<TeamWithPlayers>> = flowOf(emptyList())
    override suspend fun upsertTeamWithRelations(team: Team) {}
    override suspend fun upsertTeamsWithRelations(teams: List<Team>) {}
}

private class EventRepositoryHttp_FakeDatabaseService(
    override val getEventDao: EventDao,
    override val getUserDataDao: UserDataDao,
    override val getTeamDao: TeamDao,
) : DatabaseService {
    override val getMatchDao: MatchDao get() = error("unused")
    override val getFieldDao: FieldDao get() = error("unused")
    override val getChatGroupDao: ChatGroupDao get() = error("unused")
    override val getMessageDao: MessageDao get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao get() = error("unused")
}

@OptIn(ExperimentalTime::class)
private fun makeEvent(
    id: String,
    hostId: String,
    userIds: List<String> = emptyList(),
): Event {
    return Event(
        id = id,
        name = "E$id",
        hostId = hostId,
        coordinates = listOf(-80.0, 25.0),
        start = Instant.parse("2026-02-10T00:00:00Z"),
        end = Instant.parse("2026-02-10T01:00:00Z"),
        userIds = userIds,
        teamIds = emptyList(),
    )
}

private fun makeUser(id: String): UserData {
    return UserData(
        firstName = "",
        lastName = "",
        teamIds = emptyList(),
        friendIds = emptyList(),
        friendRequestIds = emptyList(),
        friendRequestSentIds = emptyList(),
        followingIds = emptyList(),
        userName = id,
        hasStripeAccount = false,
        uploadedImages = emptyList(),
        profileImageId = null,
        id = id,
    )
}

private class EventRepositoryHttp_FakeUserRepository(
    initialCurrentUser: UserData,
) : IUserRepository {
    override val currentUser: StateFlow<Result<UserData>> = MutableStateFlow(Result.success(initialCurrentUser))
    override val currentAccount: StateFlow<Result<AuthAccount>> = MutableStateFlow(Result.failure(Exception("unused")))

    var lastGetUsersInput: List<String>? = null
    val requestedUserIds: MutableSet<String> = mutableSetOf()

    override suspend fun getUsers(userIds: List<String>): Result<List<UserData>> {
        lastGetUsersInput = userIds
        requestedUserIds.addAll(userIds.filter(String::isNotBlank))
        return Result.success(userIds.distinct().filter(String::isNotBlank).map(::makeUser))
    }

    override fun getUsersFlow(userIds: List<String>): Flow<Result<List<UserData>>> = flowOf(Result.success(emptyList()))

    override suspend fun login(email: String, password: String): Result<UserData> = error("unused")
    override suspend fun logout(): Result<Unit> = error("unused")
    override suspend fun searchPlayers(search: String): Result<List<UserData>> = error("unused")
    override suspend fun ensureUserByEmail(email: String): Result<UserData> = error("unused")
    override suspend fun listChildren(): Result<List<FamilyChild>> = error("unused")
    override suspend fun resolveChildJoinRequest(
        registrationId: String,
        action: FamilyJoinRequestAction,
    ): Result<FamilyJoinRequestResolution> = error("unused")
    override suspend fun createChildAccount(
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String?,
        relationship: String?,
    ): Result<Unit> = error("unused")

    override suspend fun updateChildAccount(
        childUserId: String,
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String?,
        relationship: String?,
    ): Result<Unit> = error("unused")

    override suspend fun linkChildToParent(
        childEmail: String?,
        childUserId: String?,
        relationship: String?,
    ): Result<Unit> = error("unused")

    override suspend fun createNewUser(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
        userName: String,
        dateOfBirth: String?,
    ): Result<UserData> = error("unused")
    override suspend fun updateUser(user: UserData): Result<UserData> = error("unused")
    override suspend fun updateEmail(email: String, password: String): Result<Unit> = error("unused")
    override suspend fun updatePassword(currentPassword: String, newPassword: String): Result<Unit> = error("unused")
    override suspend fun updateProfile(
        firstName: String,
        lastName: String,
        email: String,
        currentPassword: String,
        newPassword: String,
        userName: String,
    ): Result<Unit> = error("unused")
    override suspend fun getCurrentAccount(): Result<Unit> = error("unused")
    override suspend fun sendFriendRequest(user: UserData): Result<Unit> = error("unused")
    override suspend fun acceptFriendRequest(user: UserData): Result<Unit> = error("unused")
    override suspend fun declineFriendRequest(userId: String): Result<Unit> = error("unused")
    override suspend fun followUser(userId: String): Result<Unit> = error("unused")
    override suspend fun unfollowUser(userId: String): Result<Unit> = error("unused")
    override suspend fun removeFriend(userId: String): Result<Unit> = error("unused")
}

private object EventRepositoryHttp_UnusedTeamRepository : ITeamRepository {
    override fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>> = error("unused")
    override suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers> = error("unused")
    override suspend fun getTeams(ids: List<String>): Result<List<Team>> = error("unused")
    override suspend fun getTeamsWithPlayers(ids: List<String>): Result<List<TeamWithPlayers>> = error("unused")
    override suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit> = error("unused")
    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> = error("unused")
    override suspend fun createTeam(newTeam: Team): Result<Team> = error("unused")
    override suspend fun updateTeam(newTeam: Team): Result<Team> = error("unused")
    override suspend fun deleteTeam(team: TeamWithPlayers): Result<Unit> = error("unused")
    override fun getTeamsWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>> = error("unused")
    override fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>> = error("unused")
    override suspend fun listTeamInvites(userId: String): Result<List<com.razumly.mvp.core.data.dataTypes.Invite>> = error("unused")
    override suspend fun deleteInvite(inviteId: String): Result<Unit> = error("unused")
    override suspend fun acceptTeamInvite(inviteId: String, teamId: String): Result<Unit> = error("unused")
}

class EventRepositoryHttpTest {
    @Test
    fun getEventsInBounds_posts_search_and_persists_to_cache() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(eventDao, EventRepositoryHttp_FakeUserDataDao(), EventRepositoryHttp_FakeTeamDao())
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))

        val engine = MockEngine { request ->
            assertEquals("/api/events/search", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "events": [
                        {
                          "id": "e1",
                          "name": "Event One",
                          "hostId": "h1",
                          "start": "2026-02-10T00:00:00Z",
                          "end": "2026-02-10T01:00:00Z",
                          "coordinates": [-80.0, 25.0],
                          "location": "Miami",
                          "eventType": "EVENT",
                          "userIds": [],
                          "teamIds": []
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val bounds = Bounds(
            north = 0.0,
            east = 0.0,
            south = 0.0,
            west = 0.0,
            center = LatLng(25.0, -80.0),
            radiusMiles = 100.0,
        )

        val result = repo.getEventsInBounds(bounds).getOrThrow()
        assertEquals(1, result.first.size)
        assertTrue(result.second)
        assertEquals("e1", eventDao.getEventById("e1")?.id)
    }

    @Test
    fun participants_add_and_remove_use_endpoint_and_update_cache() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(eventDao, EventRepositoryHttp_FakeUserDataDao(), EventRepositoryHttp_FakeTeamDao())
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))

        val engine = MockEngine { request ->
            assertEquals("/api/events/e1/participants", request.url.encodedPath)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            val json = when (request.method) {
                HttpMethod.Post -> """
                    {
                      "event": {
                        "id": "e1",
                        "name": "Event One",
                        "hostId": "h1",
                        "start": "2026-02-10T00:00:00Z",
                        "end": "2026-02-10T01:00:00Z",
                        "coordinates": [-80.0, 25.0],
                        "userIds": ["u1"],
                        "teamIds": []
                      }
                    }
                """.trimIndent()
                HttpMethod.Delete -> """
                    {
                      "event": {
                        "id": "e1",
                        "name": "Event One",
                        "hostId": "h1",
                        "start": "2026-02-10T00:00:00Z",
                        "end": "2026-02-10T01:00:00Z",
                        "coordinates": [-80.0, 25.0],
                        "userIds": [],
                        "teamIds": []
                      }
                    }
                """.trimIndent()
                else -> error("unexpected method: ${request.method}")
            }

            respond(
                content = json,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val baseEvent = makeEvent(id = "e1", hostId = "h1", userIds = emptyList())

        repo.addCurrentUserToEvent(baseEvent).getOrThrow()
        assertEquals(listOf("u1"), eventDao.getEventById("e1")?.userIds)

        repo.removeCurrentUserFromEvent(baseEvent).getOrThrow()
        assertEquals(emptyList<String>(), eventDao.getEventById("e1")?.userIds)

        // Ensure we refreshed users for host + participant.
        val requested = userRepo.requestedUserIds
        assertTrue("u1" in requested)
        assertTrue("h1" in requested)
    }

    @Test
    fun registerChildForEvent_posts_child_registration_payload() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/events/e1/registrations/child", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "event": {
                        "id": "e1",
                        "name": "Event One",
                        "hostId": "h1",
                        "start": "2026-02-10T00:00:00Z",
                        "end": "2026-02-10T01:00:00Z",
                        "coordinates": [-80.0, 25.0],
                        "userIds": ["child_1"],
                        "teamIds": []
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        repo.registerChildForEvent(eventId = "e1", childUserId = "child_1").getOrThrow()

        assertTrue(capturedBody.contains("\"childId\":\"child_1\""))
    }
}
