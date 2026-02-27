package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.Team
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
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

private class InMemoryAuthTokenStore(
    private var token: String = "",
) : AuthTokenStore {
    override suspend fun get(): String = token
    override suspend fun set(token: String) { this.token = token }
    override suspend fun clear() { token = "" }
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
        teams.value.values.filter { userId in it.playerIds }

    override fun getTeamsForUserFlow(userId: String): Flow<List<com.razumly.mvp.core.data.dataTypes.TeamWithPlayers>> =
        error("unused")

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

    override fun getTeamWithPlayersFlow(teamId: String): Flow<com.razumly.mvp.core.data.dataTypes.TeamWithRelations> =
        error("unused")

    override suspend fun getTeamsWithPlayers(teamIds: List<String>): List<com.razumly.mvp.core.data.dataTypes.TeamWithRelations> =
        error("unused")

    override fun getTeamsWithPlayersFlowByIds(ids: List<String>): Flow<List<com.razumly.mvp.core.data.dataTypes.TeamWithPlayers>> =
        error("unused")

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
    override val getChatGroupDao: ChatGroupDao get() = error("unused")
    override val getMessageDao: MessageDao get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao get() = error("unused")
}

private class FakeUserRepository : IUserRepository {
    var lastGetUsersInput: List<String>? = null

    override val currentUser: StateFlow<Result<UserData>> = MutableStateFlow(Result.failure(Exception("unused")))
    override val currentAccount: StateFlow<Result<AuthAccount>> = MutableStateFlow(Result.failure(Exception("unused")))

    override suspend fun login(email: String, password: String): Result<UserData> = error("unused")
    override suspend fun logout(): Result<Unit> = error("unused")

    override suspend fun getUsers(userIds: List<String>): Result<List<UserData>> {
        lastGetUsersInput = userIds
        return Result.success(emptyList())
    }

    override fun getUsersFlow(userIds: List<String>): Flow<Result<List<UserData>>> = error("unused")
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

    override suspend fun createTeamTopic(team: com.razumly.mvp.core.data.dataTypes.Team): Result<Unit> =
        Result.success(Unit)

    override suspend fun deleteTopic(id: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun createEventTopic(event: com.razumly.mvp.core.data.dataTypes.Event): Result<Unit> =
        Result.success(Unit)

    override suspend fun createTournamentTopic(event: com.razumly.mvp.core.data.dataTypes.Event): Result<Unit> =
        Result.success(Unit)

    override suspend fun createChatGroupTopic(chatGroup: com.razumly.mvp.core.data.dataTypes.ChatGroup): Result<Unit> =
        Result.success(Unit)

    override suspend fun addDeviceAsTarget(): Result<Unit> = Result.success(Unit)
    override suspend fun removeDeviceAsTarget(): Result<Unit> = Result.success(Unit)
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
                          "teamSize": 2
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

        val cached = teamDao.getTeams(listOf("t1"))
        assertEquals(1, cached.size)
        assertEquals("t1", cached.first().id)

        assertEquals(listOf("u1"), userRepo.lastGetUsersInput)
    }
}
