package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
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
import com.razumly.mvp.core.network.configureMvpHttpClient
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private class InMemoryAuthTokenStore(
    private var token: String = "",
) : AuthTokenStore {
    override suspend fun get(): String = token
    override suspend fun set(token: String) { this.token = token }
    override suspend fun clear() { token = "" }
}

private fun outgoingBodyText(content: OutgoingContent): String = when (content) {
    is OutgoingContent.ByteArrayContent -> content.bytes().decodeToString()
    else -> error("Unsupported outgoing content ${content::class.simpleName}")
}

private class FakeTeamDao : TeamDao {
    private val teams = MutableStateFlow<Map<String, Team>>(emptyMap())

    override suspend fun upsertTeam(team: Team) {
        teams.value = teams.value + (team.id to team)
    }

    override suspend fun upsertTeams(teams: List<Team>) {
        this.teams.value = teams.fold(this.teams.value) { acc, team -> acc + (team.id to team) }
    }

    override suspend fun getTeam(teamId: String): Team = teams.value[teamId] ?: error("missing team")

    override suspend fun getTeams(teamIds: List<String>): List<Team> = teamIds.mapNotNull { teams.value[it] }

    override suspend fun getTeamsForUser(userId: String): List<Team> =
        teams.value.values.filter { userId in it.playerIds || it.managerId == userId }

    override fun getTeamsForUserFlow(userId: String): Flow<List<com.razumly.mvp.core.data.dataTypes.TeamWithPlayers>> =
        teams.map { cached ->
            cached.values
                .filter { userId in it.playerIds || it.managerId == userId }
                .map { team ->
                    com.razumly.mvp.core.data.dataTypes.TeamWithPlayers(
                        team = team,
                        captain = null,
                        players = emptyList(),
                        pendingPlayers = emptyList(),
                    )
                }
        }

    override suspend fun getTeamInvitesForUser(userId: String): List<Team> = emptyList()

    override fun getTeamInvitesForUserFlow(userId: String): Flow<List<com.razumly.mvp.core.data.dataTypes.TeamWithPlayers>> =
        error("unused")

    override suspend fun deleteTeamsByIds(ids: List<String>) {
        teams.value = teams.value - ids.toSet()
    }

    override suspend fun getTeamPlayerCrossRefsByTeamId(teamId: String): List<TeamPlayerCrossRef> = emptyList()

    override suspend fun deleteTeam(team: Team) {
        teams.value = teams.value - team.id
    }

    override suspend fun upsertTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef) {}
    override suspend fun upsertTeamPendingPlayerCrossRef(crossRef: com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef) {}
    override suspend fun upsertTeamPlayerCrossRefs(crossRefs: List<TeamPlayerCrossRef>) {}
    override suspend fun upsertTeamPendingPlayerCrossRefs(crossRefs: List<com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef>) {}
    override suspend fun deleteTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef) {}
    override suspend fun deleteTeamPlayerCrossRefs(crossRefs: List<TeamPlayerCrossRef>) {}
    override suspend fun deleteTeamPendingPlayerCrossRef(crossRef: com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef) {}
    override suspend fun deleteTeamPlayerCrossRefsByTeamId(teamId: String) {}
    override suspend fun deleteTeamPendingPlayerCrossRefsByTeamId(teamId: String) {}

    override suspend fun getTeamWithPlayers(teamId: String): com.razumly.mvp.core.data.dataTypes.TeamWithPlayers =
        error("unused")

    override fun getTeamWithPlayersFlow(teamId: String): Flow<com.razumly.mvp.core.data.dataTypes.TeamWithRelations?> =
        flowOf(null)

    override suspend fun getTeamsWithPlayers(teamIds: List<String>): List<com.razumly.mvp.core.data.dataTypes.TeamWithRelations> =
        error("unused")

    override fun getTeamsWithPlayersFlowByIds(ids: List<String>): Flow<List<com.razumly.mvp.core.data.dataTypes.TeamWithPlayers>> =
        teams.map { cached ->
            ids.mapNotNull(cached::get).map { team ->
                com.razumly.mvp.core.data.dataTypes.TeamWithPlayers(
                    team = team,
                    captain = null,
                    players = emptyList(),
                    pendingPlayers = emptyList(),
                )
            }
        }

    override suspend fun upsertTeamWithRelations(team: Team) {
        upsertTeam(team)
    }

    override suspend fun upsertTeamsWithRelations(teams: List<Team>) {
        upsertTeams(teams)
    }
}

private class FakeDatabaseService(
    override val getTeamDao: TeamDao,
) : DatabaseService {
    override val getMatchDao: MatchDao get() = error("unused")
    override val getUserDataDao: UserDataDao get() = error("unused")
    override val getFieldDao: FieldDao get() = error("unused")
    override val getEventDao: EventDao get() = error("unused")
    override val getEventRegistrationDao: EventRegistrationDao get() = error("unused")
    override val getChatGroupDao: ChatGroupDao get() = error("unused")
    override val getMessageDao: MessageDao get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao get() = error("unused")
}

private class FakeUserRepository : IUserRepository {
    var lastGetUsersInput: List<String>? = null
    var lastListInvitesInput: Pair<String, String?>? = null
    var invitesResult: List<com.razumly.mvp.core.data.dataTypes.Invite> = emptyList()
    var refreshCurrentUserProfileCalls: Int = 0
    private val currentUserState = MutableStateFlow(Result.failure<UserData>(Exception("unused")))
    private val currentAccountState = MutableStateFlow(Result.failure<AuthAccount>(Exception("unused")))

    override val currentUser: StateFlow<Result<UserData>> = currentUserState
    override val currentAccount: StateFlow<Result<AuthAccount>> = currentAccountState

    fun setCurrentUser(user: UserData) {
        currentUserState.value = Result.success(user)
    }

    override suspend fun login(email: String, password: String): Result<UserData> = error("unused")
    override suspend fun logout(): Result<Unit> = error("unused")
    override suspend fun deleteAccount(confirmationText: String): Result<Unit> = error("unused")

    override suspend fun getUsers(
        userIds: List<String>,
        visibilityContext: UserVisibilityContext,
    ): Result<List<UserData>> {
        lastGetUsersInput = userIds
        return Result.success(emptyList())
    }

    override fun getUsersFlow(
        userIds: List<String>,
        visibilityContext: UserVisibilityContext,
    ): Flow<Result<List<UserData>>> = error("unused")
    override suspend fun searchPlayers(search: String): Result<List<UserData>> = error("unused")
    override suspend fun ensureUserByEmail(email: String): Result<UserData> = error("unused")
    override suspend fun createInvites(invites: List<com.razumly.mvp.core.network.dto.InviteCreateDto>): Result<List<com.razumly.mvp.core.data.dataTypes.Invite>> = error("unused")
    override suspend fun deleteInvite(inviteId: String): Result<Unit> = error("unused")
    override suspend fun findEmailMembership(
        emails: List<String>,
        userIds: List<String>,
    ): Result<List<UserEmailMembershipMatch>> = error("unused")
    override suspend fun listInvites(userId: String, type: String?): Result<List<com.razumly.mvp.core.data.dataTypes.Invite>> {
        lastListInvitesInput = userId to type
        return Result.success(invitesResult)
    }
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
    override suspend fun refreshCurrentUserProfile(): Result<UserData> {
        refreshCurrentUserProfileCalls += 1
        return currentUserState.value
    }
}

private object FakePushNotificationsRepository : IPushNotificationsRepository {
    override suspend fun subscribeUserToTeamNotifications(userId: String, teamId: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun unsubscribeUserFromTeamNotifications(userId: String, teamId: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun subscribeUserToEventNotifications(userId: String, eventId: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun unsubscribeUserFromEventNotifications(userId: String, eventId: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun subscribeUserToMatchNotifications(userId: String, matchId: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun unsubscribeUserFromMatchNotifications(userId: String, matchId: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun subscribeUserToChatGroup(userId: String, chatGroupId: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun unsubscribeUserFromChatGroup(userId: String, chatGroupId: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun sendUserNotification(userId: String, title: String, body: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun sendTeamNotification(teamId: String, title: String, body: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun sendEventNotification(
        eventId: String,
        title: String,
        body: String,
        isTournament: Boolean
    ): Result<Unit> = Result.success(Unit)

    override suspend fun sendMatchNotification(matchId: String, title: String, body: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun sendChatGroupNotification(chatGroupId: String, title: String, body: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun createTeamTopic(team: Team): Result<Unit> =
        Result.success(Unit)

    override suspend fun deleteTopic(id: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun createEventTopic(event: Event): Result<Unit> =
        Result.success(Unit)

    override suspend fun createTournamentTopic(event: Event): Result<Unit> =
        Result.success(Unit)

    override suspend fun createChatGroupTopic(chatGroup: ChatGroup): Result<Unit> =
        Result.success(Unit)

    override fun setActiveChat(chatGroupId: String?) {}

    override suspend fun addDeviceAsTarget(): Result<Unit> = Result.success(Unit)
    override suspend fun removeDeviceAsTarget(): Result<Unit> = Result.success(Unit)
    override suspend fun getDeviceTargetDebugStatus(syncBeforeCheck: Boolean): Result<PushDeviceTargetDebugStatus> =
        Result.success(PushDeviceTargetDebugStatus())
}

class TeamRepositoryTeamsFetchTest {
    @Test
    fun getTeams_fetches_via_api_and_persists_to_cache() = runTest {
        val tokenStore = InMemoryAuthTokenStore("t123")
        val teamDao = FakeTeamDao()
        val db = FakeDatabaseService(teamDao)
        val userRepo = FakeUserRepository()

        val engine = MockEngine { request ->
            assertEquals("/api/teams", request.url.encodedPath)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            assertEquals("t1,t2", request.url.parameters["ids"])
            assertEquals("200", request.url.parameters["limit"])

            respond(
                content = """
                    {
                      "teams": [
                        {
                          "id": "t1",
                          "name": "Team 1",
                          "division": null,
                          "playerIds": ["u1"],
                          "captainId": "u1",
                          "pending": [],
                          "teamSize": 2,
                          "organizationId": "org_1",
                          "createdBy": "owner_1",
                          "openRegistration": true,
                          "registrationPriceCents": 2500
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
        val repo = TeamRepository(api, db, userRepo, FakePushNotificationsRepository)

        val teams = repo.getTeams(listOf("t1", "t2")).getOrThrow()
        assertEquals(1, teams.size)
        assertEquals("t1", teams.first().id)
        assertEquals("org_1", teams.first().organizationId)
        assertEquals("owner_1", teams.first().createdBy)
        assertTrue(teams.first().openRegistration)
        assertEquals(2500, teams.first().registrationPriceCents)

        val cached = teamDao.getTeams(listOf("t1"))
        assertEquals(1, cached.size)
        assertEquals("t1", cached.first().id)

        assertEquals(listOf("u1"), userRepo.lastGetUsersInput)
    }

    @Test
    fun registerForTeam_posts_self_registration_endpoint_and_caches_team() = runTest {
        val tokenStore = InMemoryAuthTokenStore("t123")
        val teamDao = FakeTeamDao()
        val db = FakeDatabaseService(teamDao)
        val userRepo = FakeUserRepository()

        val engine = MockEngine { request ->
            assertEquals("/api/teams/team_1/registrations/self", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "registrationId": "registration_1",
                      "status": "ACTIVE",
                      "team": {
                        "id": "team_1",
                        "name": "Open Team",
                        "division": "Open",
                        "playerIds": ["u1"],
                        "captainId": "captain_1",
                        "pending": [],
                        "teamSize": 6,
                        "openRegistration": true,
                        "registrationPriceCents": 0
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
        val repo = TeamRepository(api, db, userRepo, FakePushNotificationsRepository)

        val team = repo.registerForTeam("team_1").getOrThrow()

        assertEquals("team_1", team.id)
        assertTrue(team.openRegistration)
        assertEquals(listOf("u1", "captain_1"), team.playerIds)
        assertEquals("team_1", teamDao.getTeam("team_1").id)
    }

    @Test
    fun leaveTeam_deletes_self_registration_endpoint_and_caches_team() = runTest {
        val tokenStore = InMemoryAuthTokenStore("t123")
        val teamDao = FakeTeamDao()
        val db = FakeDatabaseService(teamDao)
        val userRepo = FakeUserRepository()

        val engine = MockEngine { request ->
            assertEquals("/api/teams/team_1/registrations/self", request.url.encodedPath)
            assertEquals(HttpMethod.Delete, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "left": true,
                      "team": {
                        "id": "team_1",
                        "name": "Open Team",
                        "division": "Open",
                        "playerIds": [],
                        "captainId": "captain_1",
                        "pending": [],
                        "teamSize": 6,
                        "openRegistration": true,
                        "registrationPriceCents": 0
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
        val repo = TeamRepository(api, db, userRepo, FakePushNotificationsRepository)

        val team = repo.leaveTeam("team_1").getOrThrow()

        assertEquals("team_1", team.id)
        assertTrue(team.openRegistration)
        assertEquals(listOf("captain_1"), team.playerIds)
        assertEquals("team_1", teamDao.getTeam("team_1").id)
    }

    @Test
    fun requestTeamRegistration_parses_consent_aware_registration_payload() = runTest {
        val tokenStore = InMemoryAuthTokenStore("t123")
        val teamDao = FakeTeamDao()
        val db = FakeDatabaseService(teamDao)
        val userRepo = FakeUserRepository()

        val engine = MockEngine { request ->
            assertEquals("/api/teams/team_1/registrations/self", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)

            respond(
                content = """
                    {
                      "registrationId": "registration_1",
                      "status": "STARTED",
                      "registration": {
                        "id": "registration_1",
                        "teamId": "team_1",
                        "userId": "u1",
                        "registrantId": "u1",
                        "parentId": "parent_1",
                        "registrantType": "CHILD",
                        "rosterRole": "PARTICIPANT",
                        "status": "STARTED",
                        "consentDocumentId": "doc_1",
                        "consentStatus": "sent",
                        "createdBy": "parent_1"
                      },
                      "consent": {
                        "documentId": "doc_1",
                        "status": "sent",
                        "requiresChildEmail": false
                      },
                      "warnings": ["Sign remaining team documents."],
                      "team": {
                        "id": "team_1",
                        "name": "Open Team",
                        "division": "Open",
                        "playerIds": ["captain_1"],
                        "captainId": "captain_1",
                        "pending": [],
                        "teamSize": 6,
                        "openRegistration": true,
                        "registrationPriceCents": 0,
                        "requiredTemplateIds": ["template_a", "template_b"]
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = TeamRepository(api, db, userRepo, FakePushNotificationsRepository)

        val result = repo.requestTeamRegistration("team_1").getOrThrow()

        assertEquals("STARTED", result.registrationStatus)
        assertEquals("u1", result.registration?.registrantId)
        assertEquals("parent_1", result.registration?.parentId)
        assertEquals("CHILD", result.registration?.registrantType)
        assertEquals("PARTICIPANT", result.registration?.rosterRole)
        assertEquals("doc_1", result.registration?.consentDocumentId)
        assertEquals("sent", result.registration?.consentStatus)
        assertEquals("sent", result.consent?.status)
        assertEquals(listOf("Sign remaining team documents."), result.warnings)
        assertEquals(listOf("template_a", "template_b"), teamDao.getTeam("team_1").requiredTemplateIds)
    }

    @Test
    fun createTeam_refreshes_current_user_profile_without_user_patch() = runTest {
        val tokenStore = InMemoryAuthTokenStore("t123")
        val teamDao = FakeTeamDao()
        val db = FakeDatabaseService(teamDao)
        val currentUser = testUser(id = "captain_1")
        val userRepo = FakeUserRepository().apply { setCurrentUser(currentUser) }

        val engine = MockEngine { request ->
            assertEquals("/api/teams", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)

            respond(
                content = """
                    {
                      "id": "team_new",
                      "name": "Pacific Spike Volleyball",
                      "division": "Open",
                      "playerIds": ["captain_1"],
                      "captainId": "captain_1",
                      "pending": [],
                      "teamSize": 6
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = TeamRepository(api, db, userRepo, FakePushNotificationsRepository)

        val created = repo.createTeam(testTeam(id = "temp_team")).getOrThrow()

        assertEquals("team_new", created.id)
        assertEquals(1, userRepo.refreshCurrentUserProfileCalls)
        assertEquals("team_new", teamDao.getTeam("team_new").id)
    }

    @Test
    fun removePlayerFromTeam_removes_other_player_without_user_patch() = runTest {
        val tokenStore = InMemoryAuthTokenStore("t123")
        val teamDao = FakeTeamDao()
        val db = FakeDatabaseService(teamDao)
        val currentUser = testUser(id = "captain_1", teamIds = listOf("team_1"))
        val removedPlayer = testUser(id = "player_1", teamIds = listOf("team_1"))
        val userRepo = FakeUserRepository().apply { setCurrentUser(currentUser) }
        val team = testTeam(
            id = "team_1",
            playerIds = listOf("captain_1", "player_1"),
        )

        val engine = MockEngine { request ->
            assertEquals("/api/teams/team_1", request.url.encodedPath)
            assertEquals(HttpMethod.Patch, request.method)

            respond(
                content = """
                    {
                      "id": "team_1",
                      "name": "Pacific Spike Volleyball",
                      "division": "Open",
                      "playerIds": ["captain_1"],
                      "captainId": "captain_1",
                      "pending": [],
                      "teamSize": 6
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = TeamRepository(api, db, userRepo, FakePushNotificationsRepository)

        repo.removePlayerFromTeam(team, removedPlayer).getOrThrow()

        assertEquals(listOf("captain_1"), teamDao.getTeam("team_1").playerIds)
        assertEquals(0, userRepo.refreshCurrentUserProfileCalls)
    }

    @Test
    fun deleteTeam_refreshes_current_user_profile_without_user_patch() = runTest {
        val tokenStore = InMemoryAuthTokenStore("t123")
        val teamDao = FakeTeamDao()
        val db = FakeDatabaseService(teamDao)
        val currentUser = testUser(id = "captain_1", teamIds = listOf("team_1"))
        val otherPlayer = testUser(id = "player_1", teamIds = listOf("team_1"))
        val userRepo = FakeUserRepository().apply { setCurrentUser(currentUser) }
        val team = testTeam(
            id = "team_1",
            playerIds = listOf("captain_1", "player_1"),
        )
        teamDao.upsertTeamWithRelations(team)

        val engine = MockEngine { request ->
            assertEquals("/api/teams/team_1", request.url.encodedPath)
            assertEquals(HttpMethod.Delete, request.method)
            respond(
                content = "",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = TeamRepository(api, db, userRepo, FakePushNotificationsRepository)

        repo.deleteTeam(
            TeamWithPlayers(
                team = team,
                captain = currentUser,
                players = listOf(currentUser, otherPlayer),
                pendingPlayers = emptyList(),
            )
        ).getOrThrow()

        assertTrue(teamDao.getTeams(listOf("team_1")).isEmpty())
        assertEquals(1, userRepo.refreshCurrentUserProfileCalls)
    }

    @Test
    fun getTeamWithPlayersFlow_emits_failure_when_team_missing_from_cache() = runTest {
        val tokenStore = InMemoryAuthTokenStore("t123")
        val teamDao = FakeTeamDao()
        val db = FakeDatabaseService(teamDao)
        val userRepo = FakeUserRepository()

        val engine = MockEngine { _ ->
            respond(
                content = """{"error":"not found"}""",
                status = HttpStatusCode.NotFound,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }

        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = TeamRepository(api, db, userRepo, FakePushNotificationsRepository)

        val firstEmission = repo.getTeamWithPlayersFlow("missing-team").first()
        assertTrue(firstEmission.isFailure)
    }

    @Test
    fun listTeamInvites_uses_single_normalized_team_query() = runTest {
        val tokenStore = InMemoryAuthTokenStore("t123")
        val teamDao = FakeTeamDao()
        val db = FakeDatabaseService(teamDao)
        val userRepo = FakeUserRepository().apply {
            invitesResult = listOf(
                com.razumly.mvp.core.data.dataTypes.Invite(
                    type = "TEAM",
                    email = "u1@example.com",
                    teamId = "t1",
                    userId = "u1",
                    id = "invite_1",
                )
            )
        }

        val engine = MockEngine { _ ->
            error("HTTP should not be used for listTeamInvites when user repository handles the invite query.")
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }

        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = TeamRepository(api, db, userRepo, FakePushNotificationsRepository)

        val invites = repo.listTeamInvites("u1").getOrThrow()

        assertEquals("u1" to "TEAM", userRepo.lastListInvitesInput)
        assertEquals(listOf("invite_1"), invites.map { it.id })
    }

    @Test
    fun getTeamsWithPlayersFlow_fetches_manager_teams_when_user_not_player() = runTest {
        val tokenStore = InMemoryAuthTokenStore("t123")
        val teamDao = FakeTeamDao()
        val db = FakeDatabaseService(teamDao)
        val userRepo = FakeUserRepository()
        var capturedPlayerId: String? = null
        var capturedManagerId: String? = null

        val engine = MockEngine { request ->
            assertEquals("/api/teams", request.url.encodedPath)
            capturedPlayerId = request.url.parameters["playerId"]
            capturedManagerId = request.url.parameters["managerId"]
            assertEquals("200", request.url.parameters["limit"])

            respond(
                content = """
                    {
                      "teams": [
                        {
                          "id": "t_manager_only",
                          "name": "Sam's Soccer",
                          "division": null,
                          "playerIds": [],
                          "captainId": "u_other",
                          "managerId": "u_manager",
                          "pending": [],
                          "teamSize": 10
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
        val repo = TeamRepository(api, db, userRepo, FakePushNotificationsRepository)

        repo.getTeamsWithPlayersFlow("u_manager").first()

        for (attempt in 0 until 100) {
            if (teamDao.getTeamsForUser("u_manager").isNotEmpty()) {
                break
            }
            withContext(Dispatchers.Default) {
                delay(10)
            }
        }

        val cachedTeams = teamDao.getTeamsForUser("u_manager")
        assertTrue(cachedTeams.isNotEmpty(), "Expected manager team to be persisted in local cache.")
        assertEquals("u_manager", capturedPlayerId)
        assertEquals("u_manager", capturedManagerId)
        assertTrue(cachedTeams.any { it.id == "t_manager_only" })
    }

    @Test
    fun getTeamsByOrganization_uses_organization_query_param_and_returns_cached_relations() = runTest {
        val tokenStore = InMemoryAuthTokenStore("t123")
        val teamDao = FakeTeamDao()
        val db = FakeDatabaseService(teamDao)
        val userRepo = FakeUserRepository()

        val engine = MockEngine { request ->
            assertEquals("/api/teams", request.url.encodedPath)
            assertEquals("org_1", request.url.parameters["organizationId"])
            assertEquals("200", request.url.parameters["limit"])

            respond(
                content = """
                    {
                      "teams": [
                        {
                          "id": "org_team_1",
                          "name": "Org Team",
                          "division": "Open",
                          "playerIds": ["u1"],
                          "captainId": "u1",
                          "pending": [],
                          "teamSize": 6,
                          "organizationId": "org_1"
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = TeamRepository(api, db, userRepo, FakePushNotificationsRepository)

        val teams = repo.getTeamsByOrganization("org_1").getOrThrow()

        assertEquals(1, teams.size)
        assertEquals("org_team_1", teams.first().team.id)
        assertEquals("org_1", teams.first().team.organizationId)
    }

    @Test
    fun updateTeam_retries_without_unknown_fields_when_backend_rejects_strict_patch() = runTest {
        val tokenStore = InMemoryAuthTokenStore("t123")
        val teamDao = FakeTeamDao()
        val db = FakeDatabaseService(teamDao)
        val userRepo = FakeUserRepository()
        var requestCount = 0

        val engine = MockEngine { request ->
            assertEquals("/api/teams/team_1", request.url.encodedPath)
            assertEquals(HttpMethod.Patch, request.method)
            requestCount += 1

            if (requestCount == 1) {
                respond(
                    content = """
                        {
                          "error": "Invalid input",
                          "details": {
                            "formErrors": [
                              "Unrecognized key(s) in object: 'assistantCoachIds', 'playerRegistrations', 'openRegistration', 'registrationPriceCents'"
                            ],
                            "fieldErrors": {}
                          }
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.BadRequest,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            } else {
                respond(
                    content = """
                        {
                          "id": "team_1",
                          "name": "Compatibility Team",
                          "division": "Open",
                          "playerIds": ["u1"],
                          "captainId": "u1",
                          "pending": [],
                          "teamSize": 6,
                          "organizationId": "org_1"
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            }
        }

        val http = HttpClient(engine) {
            configureMvpHttpClient()
        }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = TeamRepository(api, db, userRepo, FakePushNotificationsRepository)
        val team = Team(
            division = "Open",
            name = "Compatibility Team",
            captainId = "u1",
            managerId = "u1",
            playerIds = listOf("u1"),
            pending = emptyList(),
            teamSize = 6,
            openRegistration = true,
            registrationPriceCents = 2500,
            playerRegistrations = listOf(
                com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration(
                    id = "registration_1",
                    teamId = "team_1",
                    userId = "u1",
                    status = "ACTIVE",
                    isCaptain = true,
                ),
            ),
            id = "team_1",
        )

        val updated = repo.updateTeam(team).getOrThrow()

        assertEquals("team_1", updated.id)
        assertEquals(2, requestCount)
    }

    @Test
    fun updateTeam_sends_only_changed_fields_in_patch_payload() = runTest {
        val tokenStore = InMemoryAuthTokenStore("t123")
        val teamDao = FakeTeamDao()
        val db = FakeDatabaseService(teamDao)
        val userRepo = FakeUserRepository()
        var capturedRequestBody = ""

        val existingTeam = Team(
            division = "Open",
            name = "Existing Team",
            captainId = "u1",
            managerId = "u1",
            playerIds = listOf("u1", "u2"),
            pending = emptyList(),
            teamSize = 6,
            openRegistration = false,
            registrationPriceCents = 0,
            playerRegistrations = listOf(
                com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration(
                    id = "registration_1",
                    teamId = "team_1",
                    userId = "u1",
                    status = "ACTIVE",
                    jerseyNumber = "7",
                    isCaptain = true,
                ),
                com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration(
                    id = "registration_2",
                    teamId = "team_1",
                    userId = "u2",
                    status = "ACTIVE",
                    jerseyNumber = "12",
                    isCaptain = false,
                ),
            ),
            id = "team_1",
        ).withSynchronizedMembership()
        teamDao.upsertTeamWithRelations(existingTeam)

        val engine = MockEngine { request ->
            assertEquals("/api/teams/team_1", request.url.encodedPath)
            assertEquals(HttpMethod.Patch, request.method)
            capturedRequestBody = outgoingBodyText(request.body)
            respond(
                content = """
                    {
                      "id": "team_1",
                      "name": "Renamed Team",
                      "division": "Open",
                      "playerIds": ["u1", "u2"],
                      "captainId": "u1",
                      "pending": [],
                      "teamSize": 8,
                      "playerRegistrations": [
                        {
                          "id": "registration_1",
                          "teamId": "team_1",
                          "userId": "u1",
                          "status": "ACTIVE",
                          "jerseyNumber": "7",
                          "isCaptain": true
                        },
                        {
                          "id": "registration_2",
                          "teamId": "team_1",
                          "userId": "u2",
                          "status": "ACTIVE",
                          "jerseyNumber": "21",
                          "isCaptain": false
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = TeamRepository(api, db, userRepo, FakePushNotificationsRepository)
        val updatedTeam = existingTeam.copy(
            name = "Renamed Team",
            teamSize = 8,
            playerRegistrations = existingTeam.playerRegistrations.map { registration ->
                if (registration.userId == "u2") {
                    registration.copy(jerseyNumber = "21")
                } else {
                    registration
                }
            },
        ).withSynchronizedMembership()

        repo.updateTeam(updatedTeam).getOrThrow()

        val teamPayload = jsonMVP.parseToJsonElement(capturedRequestBody)
            .jsonObject
            .getValue("team")
            .jsonObject
        assertEquals("Renamed Team", teamPayload["name"]?.jsonPrimitive?.content)
        assertEquals(8, teamPayload["teamSize"]?.jsonPrimitive?.content?.toInt())
        assertTrue("playerRegistrations" in teamPayload)
        assertTrue("division" !in teamPayload)
        assertTrue("playerIds" !in teamPayload)
        assertTrue("openRegistration" !in teamPayload)
        assertTrue("registrationPriceCents" !in teamPayload)
        assertTrue("assistantCoachIds" !in teamPayload)
    }
}

private fun testUser(
    id: String,
    teamIds: List<String> = emptyList(),
): UserData = UserData(
    firstName = id.substringBefore('_').replaceFirstChar(Char::uppercaseChar),
    lastName = "Player",
    teamIds = teamIds,
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

private fun testTeam(
    id: String = "team_1",
    name: String = "Pacific Spike Volleyball",
    captainId: String = "captain_1",
    playerIds: List<String> = listOf(captainId),
): Team = Team(
    division = "Open",
    name = name,
    captainId = captainId,
    managerId = captainId,
    playerIds = playerIds,
    pending = emptyList(),
    teamSize = 6,
    id = id,
).withSynchronizedMembership()
