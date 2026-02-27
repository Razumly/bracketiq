package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
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
    override fun getTeamWithPlayersFlow(teamId: String): Flow<TeamWithRelations?> = error("unused")
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
        maxParticipants = 10,
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
    override suspend fun isCurrentUserChild(minorAgeThreshold: Int): Result<Boolean> = error("unused")
    override suspend fun listChildren(): Result<List<FamilyChild>> = error("unused")
    override suspend fun listPendingChildJoinRequests(): Result<List<FamilyJoinRequest>> = error("unused")
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
        profileSelection: SignupProfileSelection?,
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
    override suspend fun createTeamInvite(
        teamId: String,
        userId: String,
        createdBy: String,
        inviteType: String,
    ): Result<Unit> = error("unused")
    override suspend fun deleteInvite(inviteId: String): Result<Unit> = error("unused")
    override suspend fun acceptTeamInvite(inviteId: String, teamId: String): Result<Unit> = error("unused")
}

class EventRepositoryHttpTest {
    @Test
    fun getEventTemplatesByHostFlow_requests_template_state_and_returns_templates() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))

        val engine = MockEngine { request ->
            assertEquals("/api/events", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("h1", request.url.parameters["hostId"])
            assertEquals("TEMPLATE", request.url.parameters["state"])
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "events": [
                        {
                          "id": "tmpl_1",
                          "name": "Template One",
                          "hostId": "h1",
                          "state": "TEMPLATE",
                          "start": "2026-02-10T00:00:00Z",
                          "end": "2026-02-10T01:00:00Z",
                          "coordinates": [-80.0, 25.0],
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

        val templates = repo.getEventTemplatesByHostFlow("h1")
            .first { flowResult ->
                flowResult.getOrNull()?.any { event -> event.id == "tmpl_1" } == true
            }
            .getOrThrow()

        assertEquals(1, templates.size)
        assertEquals("tmpl_1", templates.first().id)
        assertEquals("TEMPLATE", templates.first().state)
    }

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
        assertFalse(result.second)
        assertEquals("e1", eventDao.getEventById("e1")?.id)
    }

    @Test
    fun getEventsInBounds_posts_search_with_date_filters_when_provided() = runTest {
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
            assertEquals("/api/events/search", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """{ "events": [] }""",
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
        val from = Instant.parse("2025-02-01T00:00:00Z")
        val to = Instant.parse("2025-02-28T23:59:59Z")

        repo.getEventsInBounds(bounds = bounds, dateFrom = from, dateTo = to).getOrThrow()

        assertTrue(capturedBody.contains("\"dateFrom\":\"2025-02-01T00:00:00Z\""))
        assertTrue(capturedBody.contains("\"dateTo\":\"2025-02-28T23:59:59Z\""))
    }

    @Test
    fun getEventsInBounds_uses_limit_offset_and_reports_hasMore_from_page_size() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val capturedBodies = mutableListOf<String>()

        val engine = MockEngine { request ->
            assertEquals("/api/events/search", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            val body = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()
            capturedBodies += body

            val responseJson = when {
                body.contains("\"offset\":0") -> {
                    """
                        {
                          "events": [
                            {
                              "id": "e1",
                              "name": "Event One",
                              "hostId": "h1",
                              "start": "2026-02-10T00:00:00Z",
                              "end": "2026-02-10T01:00:00Z",
                              "coordinates": [-80.0, 25.0],
                              "eventType": "EVENT",
                              "userIds": [],
                              "teamIds": []
                            },
                            {
                              "id": "e2",
                              "name": "Event Two",
                              "hostId": "h1",
                              "start": "2026-02-11T00:00:00Z",
                              "end": "2026-02-11T01:00:00Z",
                              "coordinates": [-80.0, 25.0],
                              "eventType": "EVENT",
                              "userIds": [],
                              "teamIds": []
                            }
                          ]
                        }
                    """.trimIndent()
                }

                body.contains("\"offset\":2") -> {
                    """
                        {
                          "events": [
                            {
                              "id": "e3",
                              "name": "Event Three",
                              "hostId": "h1",
                              "start": "2026-02-12T00:00:00Z",
                              "end": "2026-02-12T01:00:00Z",
                              "coordinates": [-80.0, 25.0],
                              "eventType": "EVENT",
                              "userIds": [],
                              "teamIds": []
                            }
                          ]
                        }
                    """.trimIndent()
                }

                else -> """{ "events": [] }"""
            }

            respond(
                content = responseJson,
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

        val firstPage = repo.getEventsInBounds(
            bounds = bounds,
            limit = 2,
            offset = 0,
            includeDistanceFilter = false,
        ).getOrThrow()
        val secondPage = repo.getEventsInBounds(
            bounds = bounds,
            limit = 2,
            offset = 2,
            includeDistanceFilter = false,
        ).getOrThrow()

        assertEquals(2, firstPage.first.size)
        assertTrue(firstPage.second)
        assertEquals(1, secondPage.first.size)
        assertFalse(secondPage.second)
        assertTrue(capturedBodies.first().contains("\"limit\":2"))
        assertTrue(capturedBodies.first().contains("\"offset\":0"))
        assertTrue(capturedBodies.last().contains("\"offset\":2"))
    }

    @Test
    fun searchEvents_posts_query_with_small_suggestion_limit() = runTest {
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
            assertEquals("/api/events/search", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "events": [
                        {
                          "id": "event_1",
                          "name": "Test League",
                          "hostId": "host_1",
                          "start": "2026-02-10T00:00:00Z",
                          "end": "2026-02-10T01:00:00Z",
                          "coordinates": [-80.0, 25.0],
                          "eventType": "LEAGUE",
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

        val (events, hasMore) = repo.searchEvents("test league", LatLng(25.0, -80.0)).getOrThrow()

        assertTrue(capturedBody.contains("\"query\":\"test league\""))
        assertTrue(capturedBody.contains("\"limit\":8"))
        assertEquals(1, events.size)
        assertFalse(hasMore)
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

        val baseEvent = makeEvent(id = "e1", hostId = "h1", userIds = emptyList()).copy(
            teamSignup = false,
        )

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
    fun addCurrentUserToEvent_uses_free_agents_endpoint_for_team_signup_events() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var capturedPath = ""

        val engine = MockEngine { request ->
            capturedPath = request.url.encodedPath
            assertEquals(HttpMethod.Post, request.method)
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
                        "userIds": [],
                        "freeAgentIds": ["u1"],
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

        val teamSignupEvent = makeEvent(id = "e1", hostId = "h1", userIds = emptyList())

        repo.addCurrentUserToEvent(teamSignupEvent).getOrThrow()

        assertEquals("/api/events/e1/free-agents", capturedPath)
        assertEquals(listOf("u1"), eventDao.getEventById("e1")?.freeAgentIds)
        assertEquals(emptyList<String>(), eventDao.getEventById("e1")?.userIds)
    }

    @Test
    fun addCurrentUserToEvent_posts_selected_division_and_returns_parent_approval_state() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u_minor"))

        val divisionAId = "e1__division__m_skill_b"
        val divisionBId = "e1__division__f_skill_a"
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/events/e1/participants", request.url.encodedPath)
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
                        "userIds": [],
                        "teamIds": []
                      },
                      "requiresParentApproval": true
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val event = Event(
            id = "e1",
            name = "Event One",
            hostId = "h1",
            coordinates = listOf(-80.0, 25.0),
            start = Instant.parse("2026-02-10T00:00:00Z"),
            end = Instant.parse("2026-02-10T01:00:00Z"),
            maxParticipants = 16,
            teamSignup = false,
            registrationByDivisionType = true,
            divisions = listOf(divisionAId, divisionBId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionAId,
                    key = "m_skill_b",
                    name = "Men B",
                    divisionTypeId = "b",
                    divisionTypeName = "B",
                    ratingType = "SKILL",
                    gender = "M",
                ),
                DivisionDetail(
                    id = divisionBId,
                    key = "f_skill_a",
                    name = "Women A",
                    divisionTypeId = "a",
                    divisionTypeName = "A",
                    ratingType = "SKILL",
                    gender = "F",
                ),
            ),
        )

        val result = repo.addCurrentUserToEvent(
            event = event,
            preferredDivisionId = divisionBId,
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"divisionId\":\"$divisionBId\""))
        assertTrue(capturedBody.contains("\"divisionTypeId\":\"a\""))
        assertTrue(capturedBody.contains("\"divisionTypeKey\":\"f_skill_a\""))
        assertTrue(result.requiresParentApproval)
        assertFalse(result.joinedWaitlist)
    }

    @Test
    fun addCurrentUserToEvent_uses_division_capacity_for_waitlist_routing_in_multi_division_events() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u_new"))

        val divisionOpenId = "e1__division__open"
        val divisionAdvancedId = "e1__division__advanced"
        var capturedPath = ""

        val engine = MockEngine { request ->
            capturedPath = request.url.encodedPath
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
                        "userIds": ["existing_user", "existing_user_2"],
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

        val event = Event(
            id = "e1",
            name = "Event One",
            hostId = "h1",
            coordinates = listOf(-80.0, 25.0),
            start = Instant.parse("2026-02-10T00:00:00Z"),
            end = Instant.parse("2026-02-10T01:00:00Z"),
            maxParticipants = 30,
            teamSignup = false,
            singleDivision = false,
            userIds = listOf("existing_user", "existing_user_2"),
            divisions = listOf(divisionOpenId, divisionAdvancedId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionOpenId,
                    key = "open",
                    name = "Open",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    maxParticipants = 8,
                ),
                DivisionDetail(
                    id = divisionAdvancedId,
                    key = "advanced",
                    name = "Advanced",
                    divisionTypeId = "advanced",
                    divisionTypeName = "Advanced",
                    ratingType = "SKILL",
                    gender = "C",
                    maxParticipants = 2,
                ),
            ),
        )

        repo.addCurrentUserToEvent(
            event = event,
            preferredDivisionId = divisionAdvancedId,
        ).getOrThrow()

        assertEquals("/api/events/e1/waitlist", capturedPath)
    }

    @Test
    fun addTeamToEvent_posts_selected_division_payload() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val divisionAId = "e1__division__m_skill_b"
        val divisionBId = "e1__division__f_skill_a"
        var capturedPath = ""
        var capturedBody = ""

        val team = Team(
            division = "open",
            name = "Team One",
            captainId = "u1",
            managerId = "u1",
            playerIds = listOf("u1"),
            teamSize = 2,
            id = "t1",
            divisionTypeId = "a",
            divisionTypeName = "A",
            skillDivisionTypeId = "a",
            skillDivisionTypeName = "A",
            ageDivisionTypeId = "open",
            ageDivisionTypeName = "Open",
            divisionGender = "F",
        )

        val teamRepository = object : ITeamRepository by EventRepositoryHttp_UnusedTeamRepository {
            override suspend fun getTeams(ids: List<String>): Result<List<Team>> {
                return Result.success(
                    if (ids.contains(team.id)) {
                        listOf(team)
                    } else {
                        emptyList()
                    }
                )
            }
        }

        val engine = MockEngine { request ->
            capturedPath = request.url.encodedPath
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
                        "userIds": [],
                        "teamIds": ["t1"]
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, teamRepository, userRepo)

        val event = Event(
            id = "e1",
            name = "Event One",
            hostId = "h1",
            coordinates = listOf(-80.0, 25.0),
            start = Instant.parse("2026-02-10T00:00:00Z"),
            end = Instant.parse("2026-02-10T01:00:00Z"),
            maxParticipants = 24,
            teamSignup = true,
            singleDivision = false,
            divisions = listOf(divisionAId, divisionBId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionAId,
                    key = "m_skill_b",
                    name = "Men B",
                    divisionTypeId = "b",
                    divisionTypeName = "B",
                    ratingType = "SKILL",
                    gender = "M",
                ),
                DivisionDetail(
                    id = divisionBId,
                    key = "f_skill_a",
                    name = "Women A",
                    divisionTypeId = "a",
                    divisionTypeName = "A",
                    ratingType = "SKILL",
                    gender = "F",
                ),
            ),
        )

        repo.addTeamToEvent(
            event = event,
            team = team,
            preferredDivisionId = divisionBId,
        ).getOrThrow()

        assertEquals("/api/events/e1/participants", capturedPath)
        assertTrue(capturedBody.contains("\"teamId\":\"t1\""))
        assertTrue(capturedBody.contains("\"divisionId\":\"$divisionBId\""))
        assertTrue(capturedBody.contains("\"divisionTypeId\":\"a\""))
        assertTrue(capturedBody.contains("\"divisionTypeKey\":\"f_skill_a\""))
        assertEquals(listOf("t1"), eventDao.getEventById("e1")?.teamIds)
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
                      "registration": {
                        "id": "reg_1",
                        "status": "PENDINGCONSENT",
                        "consentStatus": "child_email_required"
                      },
                      "consent": {
                        "status": "child_email_required",
                        "requiresChildEmail": true
                      },
                      "warnings": [
                        "Under-13 child profile is missing email; child signature cannot be completed until email is added."
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

        val result = repo.registerChildForEvent(eventId = "e1", childUserId = "child_1").getOrThrow()

        assertTrue(capturedBody.contains("\"childId\":\"child_1\""))
        assertEquals("PENDINGCONSENT", result.registrationStatus)
        assertEquals("child_email_required", result.consentStatus)
        assertTrue(result.requiresChildEmail)
        assertTrue(result.warnings.isNotEmpty())
    }

    @Test
    fun registerChildForEvent_posts_waitlist_payload_when_join_waitlist_requested() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var capturedPath = ""
        var capturedBody = ""

        val engine = MockEngine { request ->
            capturedPath = request.url.encodedPath
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
                        "userIds": [],
                        "teamIds": [],
                        "waitListIds": ["child_1"]
                      },
                      "requiresParentApproval": false
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val result = repo.registerChildForEvent(
            eventId = "e1",
            childUserId = "child_1",
            joinWaitlist = true,
        ).getOrThrow()

        assertEquals("/api/events/e1/waitlist", capturedPath)
        assertTrue(capturedBody.contains("\"userId\":\"child_1\""))
        assertEquals("WAITLISTED", result.registrationStatus)
        assertTrue(result.joinedWaitlist)
        assertFalse(result.requiresParentApproval)
        assertEquals(listOf("child_1"), eventDao.getEventById("e1")?.waitListIds)
    }

    @Test
    fun getLeagueDivisionStandings_requests_division_query_and_maps_response() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))

        val engine = MockEngine { request ->
            assertEquals("/api/events/e1/standings", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("e1__division__advanced", request.url.parameters["divisionId"])
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "division": {
                        "divisionId": "e1__division__advanced",
                        "divisionName": "Advanced",
                        "standingsConfirmedAt": "2026-02-24T12:00:00.000Z",
                        "standingsConfirmedBy": "host_1",
                        "standings": [
                          {
                            "position": 1,
                            "teamId": "team_1",
                            "teamName": "Team One",
                            "wins": 3,
                            "losses": 0,
                            "draws": 0,
                            "goalsFor": 9,
                            "goalsAgainst": 2,
                            "goalDifference": 7,
                            "matchesPlayed": 3,
                            "basePoints": 9,
                            "finalPoints": 10,
                            "pointsDelta": 1
                          }
                        ],
                        "validation": {
                          "mappingErrors": [],
                          "capacityErrors": []
                        }
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

        val result = repo.getLeagueDivisionStandings(
            eventId = "e1",
            divisionId = "e1__division__advanced",
        ).getOrThrow()

        assertEquals("e1__division__advanced", result.divisionId)
        assertEquals("Advanced", result.divisionName)
        assertEquals("host_1", result.standingsConfirmedBy)
        assertEquals(1, result.rows.size)
        assertEquals("team_1", result.rows.first().teamId)
        assertEquals(10.0, result.rows.first().finalPoints)
        assertEquals(1.0, result.rows.first().pointsDelta)
    }

    @Test
    fun confirmLeagueDivisionStandings_posts_confirm_payload_and_maps_result() = runTest {
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
            assertEquals("/api/events/e1/standings/confirm", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "division": {
                        "divisionId": "e1__division__advanced",
                        "divisionName": "Advanced",
                        "standingsConfirmedAt": "2026-02-24T12:00:00.000Z",
                        "standingsConfirmedBy": "host_1",
                        "standings": [],
                        "validation": {
                          "mappingErrors": [],
                          "capacityErrors": []
                        }
                      },
                      "applyReassignment": false,
                      "reassignedPlayoffDivisionIds": [],
                      "seededTeamIds": []
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val result = repo.confirmLeagueDivisionStandings(
            eventId = "e1",
            divisionId = "e1__division__advanced",
            applyReassignment = false,
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"divisionId\":\"e1__division__advanced\""))
        assertTrue(capturedBody.contains("\"applyReassignment\":false"))
        assertFalse(result.applyReassignment)
        assertEquals("e1__division__advanced", result.division.divisionId)
    }
}
