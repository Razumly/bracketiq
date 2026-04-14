package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
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
    val deleteEventsByIdCalls = mutableListOf<List<String>>()
    val deleteEventsWithCrossRefsCalls = mutableListOf<List<String>>()
    val deleteEventWithCrossRefsCalls = mutableListOf<String>()

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
        deleteEventsByIdCalls += ids
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
    override suspend fun getEventsByIds(ids: List<String>): List<Event> = ids.mapNotNull(events.value::get)
    override suspend fun getEventWithRelationsById(id: String): EventWithRelations = error("unused")
    override fun getEventWithRelationsFlow(id: String): Flow<EventWithRelations> = error("unused")
    override suspend fun upsertEventWithRelations(event: Event) { upsertEvent(event) }
    override suspend fun deleteEventWithCrossRefs(eventId: String) {
        deleteEventWithCrossRefsCalls += eventId
        deleteEventById(eventId)
    }
    override suspend fun deleteEventsWithCrossRefs(eventIds: List<String>) {
        deleteEventsWithCrossRefsCalls += eventIds
        eventIds.forEach { deleteEventWithCrossRefs(it) }
    }
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
    override val getEventRegistrationDao: EventRegistrationDao get() = error("unused")
    override val getChatGroupDao: ChatGroupDao get() = error("unused")
    override val getMessageDao: MessageDao get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao get() = error("unused")
}

@OptIn(ExperimentalTime::class)
@Suppress("SameParameterValue")
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
    private val currentUserState = MutableStateFlow(Result.success(initialCurrentUser))
    override val currentUser: StateFlow<Result<UserData>> = currentUserState
    override val currentAccount: StateFlow<Result<AuthAccount>> = MutableStateFlow(Result.failure(Exception("unused")))

    var lastGetUsersInput: List<String>? = null
    val requestedUserIds: MutableSet<String> = mutableSetOf()

    override suspend fun getUsers(
        userIds: List<String>,
        visibilityContext: UserVisibilityContext,
    ): Result<List<UserData>> {
        lastGetUsersInput = userIds
        requestedUserIds.addAll(userIds.filter(String::isNotBlank))
        return Result.success(userIds.distinct().filter(String::isNotBlank).map(::makeUser))
    }

    override fun getUsersFlow(
        userIds: List<String>,
        visibilityContext: UserVisibilityContext,
    ): Flow<Result<List<UserData>>> = flowOf(Result.success(emptyList()))

    override suspend fun login(email: String, password: String): Result<UserData> = error("unused")
    override suspend fun logout(): Result<Unit> = error("unused")
    override suspend fun deleteAccount(confirmationText: String): Result<Unit> = error("unused")
    override suspend fun searchPlayers(search: String): Result<List<UserData>> = error("unused")
    override suspend fun ensureUserByEmail(email: String): Result<UserData> = error("unused")
    override suspend fun createInvites(invites: List<com.razumly.mvp.core.network.dto.InviteCreateDto>): Result<List<com.razumly.mvp.core.data.dataTypes.Invite>> = error("unused")
    override suspend fun deleteInvite(inviteId: String): Result<Unit> = error("unused")
    override suspend fun findEmailMembership(
        emails: List<String>,
        userIds: List<String>,
    ): Result<List<UserEmailMembershipMatch>> = error("unused")
    override suspend fun listInvites(userId: String, type: String?): Result<List<com.razumly.mvp.core.data.dataTypes.Invite>> = error("unused")
    override suspend fun acceptInvite(inviteId: String): Result<Unit> = error("unused")
    override suspend fun declineInvite(inviteId: String): Result<Unit> = error("unused")
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
        profileImageId: String?,
    ): Result<Unit> = error("unused")
    override suspend fun getCurrentAccount(): Result<Unit> = error("unused")
    override suspend fun sendFriendRequest(user: UserData): Result<Unit> = error("unused")
    override suspend fun acceptFriendRequest(user: UserData): Result<Unit> = error("unused")
    override suspend fun declineFriendRequest(userId: String): Result<Unit> = error("unused")
    override suspend fun followUser(userId: String): Result<Unit> = error("unused")
    override suspend fun unfollowUser(userId: String): Result<Unit> = error("unused")
    override suspend fun removeFriend(userId: String): Result<Unit> = error("unused")
    override suspend fun setCachedCurrentUserProfile(profile: UserData): Result<UserData> {
        currentUserState.value = Result.success(profile)
        return Result.success(profile)
    }
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
    override suspend fun getInviteFreeAgents(teamId: String): Result<List<UserData>> = error("unused")
    override suspend fun deleteInvite(inviteId: String): Result<Unit> = error("unused")
    override suspend fun acceptTeamInvite(inviteId: String, teamId: String): Result<Unit> = error("unused")
}

class EventRepositoryHttpTest {
    @Test
    fun getCachedEventsFlow_filters_hidden_events_from_cached_results() = runTest {
        val eventDao = EventRepositoryHttp_FakeEventDao()
        eventDao.upsertEvents(
            listOf(
                makeEvent(id = "hidden_event", hostId = "u1"),
                makeEvent(id = "visible_event", hostId = "u2"),
            )
        )
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(
            makeUser("u1").copy(hiddenEventIds = listOf("hidden_event"))
        )
        val api = MvpApiClient(
            HttpClient(MockEngine { error("HTTP should not be used in cached-events test") }) {
                install(ContentNegotiation) { json(jsonMVP) }
            },
            "http://localhost",
            EventRepositoryHttp_InMemoryAuthTokenStore(),
        )
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val events = repo.getCachedEventsFlow().first().getOrThrow()

        assertEquals(listOf("visible_event"), events.map { it.id })
    }

    @Test
    fun reportEvent_removes_hidden_events_from_cache_and_updates_current_user() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        eventDao.upsertEvents(
            listOf(
                makeEvent(id = "event_1", hostId = "u1"),
                makeEvent(id = "event_2", hostId = "u2"),
            )
        )
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))

        val engine = MockEngine { request ->
            assertEquals("/api/moderation/reports", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            respond(
                content = """
                    {
                      "hiddenEventIds": ["event_1"],
                      "removedChatIds": []
                    }
                """.trimIndent(),
                status = HttpStatusCode.Created,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val api = MvpApiClient(http, "http://localhost", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        repo.reportEvent("event_1", "spam").getOrThrow()

        val cachedEvents = eventDao.getAllCachedEvents().first()
        val cachedUser = userRepo.currentUser.value.getOrNull()

        assertEquals(listOf("event_2"), cachedEvents.map { it.id })
        assertEquals(listOf("event_1"), cachedUser?.hiddenEventIds)
        assertEquals(listOf(listOf("event_1")), eventDao.deleteEventsWithCrossRefsCalls)
        assertTrue(eventDao.deleteEventsByIdCalls.isEmpty())
    }

    @Test
    fun getEventsByIds_requests_batched_ids_query() = runTest {
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
            assertEquals("e1,e2", request.url.parameters["ids"])
            assertEquals("2", request.url.parameters["limit"])
            respond(
                content = """
                    {
                      "events": [
                        {
                          "id": "e1",
                          "name": "Invite Event",
                          "hostId": "u1",
                          "start": "2026-03-01T10:00:00Z",
                          "end": "2026-03-01T12:00:00Z",
                          "location": "Gym",
                          "coordinates": [0, 0],
                          "priceCents": 0,
                          "imageId": "",
                          "maxParticipants": 0,
                          "teamSizeLimit": 2,
                          "teamSignup": false,
                          "singleDivision": true,
                          "waitListIds": [],
                          "freeAgentIds": [],
                          "userIds": [],
                          "teamIds": [],
                          "fieldIds": [],
                          "timeSlotIds": [],
                          "officialIds": [],
                          "assistantHostIds": [],
                          "cancellationRefundHours": 0,
                          "registrationCutoffHours": 0,
                          "seedColor": 0,
                          "state": "PUBLISHED",
                          "divisions": []
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
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val events = repo.getEventsByIds(listOf("e1", "e2")).getOrThrow()

        assertEquals(listOf("e1"), events.map { it.id })
        assertEquals("e1", eventDao.getEventById("e1")?.id)
    }

    @Test
    fun getLeagueScoringConfig_fetches_embedded_config_for_event() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        eventDao.upsertEvent(
            makeEvent(id = "e1", hostId = "u1").copy(
                leagueScoringConfigId = "cfg_win4",
            )
        )

        val engine = MockEngine { request ->
            assertEquals("/api/events/e1", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            respond(
                content = """
                    {
                      "id": "e1",
                      "name": "League Event",
                      "hostId": "u1",
                      "start": "2026-03-01T10:00:00Z",
                      "end": "2026-03-01T12:00:00Z",
                      "coordinates": [0, 0],
                      "leagueScoringConfigId": "cfg_win4",
                      "leagueScoringConfig": {
                        "pointsForWin": 4,
                        "pointsForLoss": 1,
                        "pointsPerSetWin": 0.5
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

        val config = repo.getLeagueScoringConfig("e1").getOrThrow()

        assertEquals("cfg_win4", config?.id)
        assertEquals(4, config?.pointsForWin)
        assertEquals(1, config?.pointsForLoss)
        assertEquals(0.5, config?.pointsPerSetWin)
    }

    @Test
    fun getLeagueScoringConfig_fetches_by_id_when_event_embed_missing() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        eventDao.upsertEvent(
            makeEvent(id = "e1", hostId = "u1").copy(
                leagueScoringConfigId = "cfg_win4",
            )
        )

        val requestedPaths = mutableListOf<String>()
        val engine = MockEngine { request ->
            requestedPaths += request.url.encodedPath
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            when (request.url.encodedPath) {
                "/api/events/e1" -> respond(
                    content = """
                        {
                          "id": "e1",
                          "name": "League Event",
                          "hostId": "u1",
                          "start": "2026-03-01T10:00:00Z",
                          "end": "2026-03-01T12:00:00Z",
                          "coordinates": [0, 0],
                          "leagueScoringConfigId": "cfg_win4"
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                "/api/league-scoring-configs/cfg_win4" -> respond(
                    content = """
                        {
                          "id": "cfg_win4",
                          "pointsForWin": 4,
                          "pointsForLoss": 1,
                          "pointsPerSetWin": 0.5
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("Unexpected path ${request.url.encodedPath}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val config = repo.getLeagueScoringConfig("e1").getOrThrow()

        assertEquals(
            listOf("/api/events/e1", "/api/league-scoring-configs/cfg_win4"),
            requestedPaths,
        )
        assertEquals("cfg_win4", config?.id)
        assertEquals(4, config?.pointsForWin)
        assertEquals(1, config?.pointsForLoss)
        assertEquals(0.5, config?.pointsPerSetWin)
    }

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
        var participantIds = emptyList<String>()

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
                """.trimIndent().also {
                    participantIds = listOf("u1")
                }
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
                """.trimIndent().also {
                    participantIds = emptyList()
                }
                HttpMethod.Get -> """
                    {
                      "event": {
                        "id": "e1",
                        "name": "Event One",
                        "hostId": "h1",
                        "start": "2026-02-10T00:00:00Z",
                        "end": "2026-02-10T01:00:00Z",
                        "coordinates": [-80.0, 25.0],
                        "userIds": ${if (participantIds.isEmpty()) "[]" else """["u1"]"""},
                        "teamIds": []
                      },
                      "participants": {
                        "teamIds": [],
                        "userIds": ${if (participantIds.isEmpty()) "[]" else """["u1"]"""},
                        "waitListIds": [],
                        "freeAgentIds": [],
                        "divisions": []
                      },
                      "users": ${if (participantIds.isEmpty()) "[]" else """[{"id":"u1","firstName":"Test","lastName":"User","userName":"u1"}]"""},
                      "participantCount": ${participantIds.size}
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
    }

    @Test
    fun addCurrentUserToEvent_succeeds_when_participant_refresh_fails_after_post() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))

        val engine = MockEngine { request ->
            when (request.method) {
                HttpMethod.Post -> respond(
                    content = """
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
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                HttpMethod.Get -> respond(
                    content = """{"error":"temporary participant sync failure"}""",
                    status = HttpStatusCode.InternalServerError,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("unexpected method: ${request.method}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)
        val baseEvent = makeEvent(id = "e1", hostId = "h1", userIds = emptyList()).copy(
            teamSignup = false,
        )

        repo.addCurrentUserToEvent(baseEvent).getOrThrow()

        assertEquals(listOf("u1"), eventDao.getEventById("e1")?.userIds)
    }

    @Test
    fun syncEventParticipants_clears_cached_participants_when_weekly_selection_is_required() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))

        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            respond(
                content = """
                    {
                      "participants": {
                        "teamIds": [],
                        "userIds": [],
                        "waitListIds": [],
                        "freeAgentIds": [],
                        "divisions": []
                      },
                      "teams": [],
                      "users": [],
                      "participantCount": 0,
                      "participantCapacity": 8,
                      "weeklySelectionRequired": true
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)
        val baseEvent = makeEvent(id = "e1", hostId = "h1", userIds = listOf("u1"))

        eventDao.upsertEvent(baseEvent)

        val result = repo.syncEventParticipants(baseEvent).getOrThrow()

        assertTrue(result.weeklySelectionRequired)
        assertEquals(emptyList(), result.event.userIds)
        assertEquals(emptyList(), result.event.teamIds)
        assertEquals(emptyList(), eventDao.getEventById("e1")?.userIds)
        assertEquals(emptyList(), eventDao.getEventById("e1")?.teamIds)
    }

    @Test
    fun removeTeamFromEvent_includes_refund_intent_when_provided() = runTest {
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
            assertEquals("/api/events/e1/participants", request.url.encodedPath)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            when (request.method) {
                HttpMethod.Delete -> {
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
                              }
                            }
                        """.trimIndent(),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                HttpMethod.Get -> respond(
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
                          "participants": {
                            "teamIds": [],
                            "userIds": [],
                            "waitListIds": [],
                            "freeAgentIds": [],
                            "divisions": []
                          },
                          "teams": [],
                          "users": [],
                          "participantCount": 0
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("unexpected method: ${request.method}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)
        val team = TeamWithPlayers(
            team = Team(
                id = "team_1",
                division = "open",
                captainId = "u1",
                managerId = "u1",
                name = "Team One",
                teamSize = 2,
                playerIds = listOf("u1"),
            ),
            captain = null,
            players = emptyList(),
            pendingPlayers = emptyList(),
        )
        val event = makeEvent(id = "e1", hostId = "h1").copy(teamSignup = true, teamIds = listOf("team_1"))

        repo.removeTeamFromEvent(
            event = event,
            teamWithPlayers = team,
            refundMode = EventParticipantRefundMode.REQUEST,
            refundReason = "Team can no longer attend",
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"teamId\":\"team_1\""))
        assertTrue(capturedBody.contains("\"refundMode\":\"request\""))
        assertTrue(capturedBody.contains("\"refundReason\":\"Team can no longer attend\""))
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
            when (request.method) {
                HttpMethod.Post -> {
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

                HttpMethod.Get -> respond(
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
                          "participants": {
                            "teamIds": [],
                            "userIds": [],
                            "waitListIds": [],
                            "freeAgentIds": ["u1"],
                            "divisions": []
                          },
                          "users": [{"id":"u1","firstName":"Test","lastName":"User","userName":"u1"}],
                          "participantCount": 0
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("unexpected method: ${request.method}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val teamSignupEvent = makeEvent(id = "e1", hostId = "h1", userIds = emptyList()).copy(
            teamSignup = true,
        )

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
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            when (request.method) {
                HttpMethod.Post -> {
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

                HttpMethod.Get -> respond(
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
                          "participants": {
                            "teamIds": [],
                            "userIds": [],
                            "waitListIds": [],
                            "freeAgentIds": [],
                            "divisions": []
                          },
                          "users": [],
                          "participantCount": 0
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("unexpected method: ${request.method}")
            }
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
            if (request.method != HttpMethod.Get) {
                capturedPath = request.url.encodedPath
            }
            respond(
                content = when (request.method) {
                    HttpMethod.Get -> """
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
                          },
                          "participants": {
                            "teamIds": [],
                            "userIds": ["existing_user", "existing_user_2"],
                            "waitListIds": ["u_new"],
                            "freeAgentIds": [],
                            "divisions": []
                          },
                          "users": [],
                          "participantCount": 2
                        }
                    """.trimIndent()
                    else -> """
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
                    """.trimIndent()
                },
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
            when (request.method) {
                HttpMethod.Post -> {
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

                HttpMethod.Get -> respond(
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
                          },
                          "participants": {
                            "teamIds": ["t1"],
                            "userIds": [],
                            "waitListIds": [],
                            "freeAgentIds": [],
                            "divisions": []
                          },
                          "teams": [{"id":"t1","name":"Team One","captainId":"u1","managerId":"u1","playerIds":["u1"],"teamSize":2,"division":"open","divisionTypeId":"a","divisionTypeName":"A","skillDivisionTypeId":"a","skillDivisionTypeName":"A","ageDivisionTypeId":"open","ageDivisionTypeName":"Open","divisionGender":"F"}],
                          "users": [],
                          "participantCount": 1
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("unexpected method: ${request.method}")
            }
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
    fun addCurrentUserToEvent_uses_occurrence_scoped_participant_snapshot_for_weekly_events() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val participantQueries = mutableListOf<Pair<String?, String?>>()
        var capturedPostBody = ""

        val engine = MockEngine { request ->
            when (request.method) {
                HttpMethod.Get -> {
                    if (request.url.encodedPath == "/api/events/e1/participants") {
                        participantQueries += request.url.parameters["slotId"] to request.url.parameters["occurrenceDate"]
                    }
                    respond(
                        content = """
                            {
                              "event": {
                                "id": "e1",
                                "name": "Weekly Event",
                                "hostId": "h1",
                                "eventType": "WEEKLY_EVENT",
                                "start": "2026-04-12T00:00:00Z",
                                "end": "2026-04-12T01:00:00Z",
                                "coordinates": [-80.0, 25.0],
                                "userIds": [],
                                "teamIds": []
                              },
                              "participants": {
                                "teamIds": [],
                                "userIds": [],
                                "waitListIds": [],
                                "freeAgentIds": [],
                                "divisions": []
                              },
                              "users": [],
                              "participantCount": 0,
                              "participantCapacity": 8
                            }
                        """.trimIndent(),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                HttpMethod.Post -> {
                    capturedPostBody = (request.body as? OutgoingContent.ByteArrayContent)
                        ?.bytes()
                        ?.decodeToString()
                        .orEmpty()
                    respond(
                        content = """
                            {
                              "event": {
                                "id": "e1",
                                "name": "Weekly Event",
                                "hostId": "h1",
                                "eventType": "WEEKLY_EVENT",
                                "start": "2026-04-12T00:00:00Z",
                                "end": "2026-04-12T01:00:00Z",
                                "coordinates": [-80.0, 25.0],
                                "userIds": ["u1"],
                                "teamIds": []
                              }
                            }
                        """.trimIndent(),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                else -> error("unexpected method: ${request.method}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val weeklyEvent = Event(
            id = "e1",
            name = "Weekly Event",
            hostId = "h1",
            coordinates = listOf(-80.0, 25.0),
            start = Instant.parse("2026-04-12T00:00:00Z"),
            end = Instant.parse("2026-04-12T01:00:00Z"),
            eventType = EventType.WEEKLY_EVENT,
            maxParticipants = 8,
            teamSignup = false,
        )
        val occurrence = EventOccurrenceSelection(
            slotId = "slot-1",
            occurrenceDate = "2026-04-14",
        )

        repo.addCurrentUserToEvent(
            event = weeklyEvent,
            occurrence = occurrence,
        ).getOrThrow()

        assertTrue(
            participantQueries.contains("slot-1" to "2026-04-14"),
            "Expected weekly participant queries to carry slotId and occurrenceDate.",
        )
        assertTrue(capturedPostBody.contains("\"slotId\":\"slot-1\""))
        assertTrue(capturedPostBody.contains("\"occurrenceDate\":\"2026-04-14\""))
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
                        "status": "ACTIVE",
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
        assertEquals("ACTIVE", result.registrationStatus)
        assertEquals("child_email_required", result.consentStatus)
        assertFalse(result.requiresParentApproval)
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
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            when (request.method) {
                HttpMethod.Post -> {
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

                HttpMethod.Get -> respond(
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
                          "participants": {
                            "teamIds": [],
                            "userIds": [],
                            "waitListIds": ["child_1"],
                            "freeAgentIds": [],
                            "divisions": []
                          },
                          "users": [],
                          "participantCount": 0
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("unexpected method: ${request.method}")
            }
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
