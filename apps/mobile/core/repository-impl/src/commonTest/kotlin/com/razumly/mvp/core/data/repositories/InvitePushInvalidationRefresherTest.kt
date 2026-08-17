package com.razumly.mvp.core.data.repositories

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.daos.ChatGroupDao
import com.razumly.mvp.core.data.dataTypes.daos.EventDao
import com.razumly.mvp.core.data.dataTypes.daos.EventRegistrationDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.InviteDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.MessageDao
import com.razumly.mvp.core.data.dataTypes.daos.RefundRequestDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.configureMvpHttpClient
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private class InvitePushTestTokenStore(
    private var token: String = "",
) : AuthTokenStore {
    override suspend fun get(): String = token
    override suspend fun set(token: String) {
        this.token = token
    }
    override suspend fun clear() {
        token = ""
    }
}

private class InvitePushTestPreferencesDataStore : DataStore<Preferences> {
    private val state = MutableStateFlow<Preferences>(emptyPreferences())

    override val data: Flow<Preferences> = state

    override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences): Preferences {
        val updated = transform(state.value)
        state.value = updated
        return updated
    }
}

private class InvitePushTestInviteDao(
    invites: List<Invite> = emptyList(),
) : InviteDao {
    val stored = invites.associateBy { it.id }.toMutableMap()
    val upserted = mutableListOf<Invite>()
    val deletedInviteIds = mutableListOf<String>()
    var replaceDeleteCount = 0
    var replaceInvocationCount = 0

    override suspend fun upsertInvite(invite: Invite) {
        upserted += invite
        stored[invite.id] = invite
    }

    override suspend fun upsertInvites(invites: List<Invite>) {
        upserted += invites
        invites.forEach { invite -> stored[invite.id] = invite }
    }

    override suspend fun getInvitesForUser(userId: String, type: String?): List<Invite> =
        stored.values.filter { invite ->
            invite.userId == userId && (type == null || invite.type.equals(type, ignoreCase = true))
        }

    override fun getInvitesForUserFlow(userId: String, type: String?): Flow<List<Invite>> =
        flowOf(stored.values.filter { invite ->
            invite.userId == userId && (type == null || invite.type.equals(type, ignoreCase = true))
        })

    override suspend fun deleteInviteById(inviteId: String) {
        deletedInviteIds += inviteId
        stored.remove(inviteId)
    }

    override suspend fun deleteInvitesForUser(userId: String, type: String?) {
        replaceDeleteCount += 1
        stored.entries.removeAll { (_, invite) ->
            invite.userId == userId && (type == null || invite.type.equals(type, ignoreCase = true))
        }
    }

    override suspend fun deleteDelegatedInvites(type: String?) {
        stored.entries.removeAll { (_, invite) ->
            invite.viewerCanAcceptForChild && (type == null || invite.type.equals(type, ignoreCase = true))
        }
    }

    override suspend fun deleteMissingInvitesForUser(userId: String, type: String?, ids: List<String>) {
        stored.entries.removeAll { (id, invite) ->
            invite.userId == userId &&
                (type == null || invite.type.equals(type, ignoreCase = true)) &&
                id !in ids
        }
    }

    override suspend fun deleteMissingDelegatedInvites(type: String?, ids: List<String>) {
        stored.entries.removeAll { (id, invite) ->
            invite.viewerCanAcceptForChild &&
                (type == null || invite.type.equals(type, ignoreCase = true)) &&
                id !in ids
        }
    }

    override suspend fun replaceInvitesForUser(userId: String, type: String?, invites: List<Invite>) {
        replaceInvocationCount += 1
        val ids = invites.map { it.id.trim() }.filter(String::isNotBlank)
        if (ids.isEmpty()) {
            deleteInvitesForUser(userId, type)
            deleteDelegatedInvites(type)
        } else {
            deleteMissingInvitesForUser(userId, type, ids)
            deleteMissingDelegatedInvites(type, ids)
            upsertInvites(invites)
        }
    }
}

private class InvitePushTestDatabaseService(
    override val getInviteDao: InviteDao,
) : DatabaseService {
    override val getMatchDao: MatchDao
        get() = error("unused")
    override val getTeamDao: TeamDao
        get() = error("unused")
    override val getFieldDao: FieldDao
        get() = error("unused")
    override val getUserDataDao: UserDataDao
        get() = error("unused")
    override val getEventDao: EventDao
        get() = error("unused")
    override val getEventRegistrationDao: EventRegistrationDao
        get() = error("unused")
    override val getChatGroupDao: ChatGroupDao
        get() = error("unused")
    override val getMessageDao: MessageDao
        get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao
        get() = error("unused")
}

private fun invitePushTestApi(
    engine: MockEngine,
    tokenStore: AuthTokenStore = InvitePushTestTokenStore("session-token"),
): MvpApiClient = MvpApiClient(
    http = HttpClient(engine) { configureMvpHttpClient() },
    baseUrl = "http://example.test",
    tokenStore = tokenStore,
)

private fun MockRequestHandleScope.invitePushJsonResponse(
    body: String,
    status: HttpStatusCode = HttpStatusCode.OK,
) = respond(
    content = body,
    status = status,
    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
)

class InvitePushInvalidationRefresherTest {
    @Test
    fun forged_invitation_payload_only_removes_a_stale_row_after_canonical_not_found() = runTest {
        val dao = InvitePushTestInviteDao(
            invites = listOf(
                Invite(
                    id = "forged_invite",
                    type = "STAFF",
                    email = "forged@example.test",
                    userId = "victim_1",
                    teamId = "attacker_team",
                ),
            ),
        )
        val dataSource = CurrentUserDataSource(InvitePushTestPreferencesDataStore())
        dataSource.saveUserId("victim_1")
        var requestedPath: String? = null
        val api = invitePushTestApi(MockEngine { request ->
            requestedPath = request.url.encodedPath
            invitePushJsonResponse("{\"error\":\"Not found\"}", HttpStatusCode.NotFound)
        })
        val refresher = InvitePushInvalidationRefresher(
            userDataSource = dataSource,
            api = api,
            databaseService = InvitePushTestDatabaseService(dao),
            ensureAuthenticated = { true },
        )

        refresher.refreshFromPayload(
            mapOf(
                "inviteId" to "forged_invite",
                "type" to "STAFF",
                "status" to "PENDING",
                "teamId" to "attacker_team",
                "organizationId" to "attacker_org",
                "userId" to "attacker_user",
            ),
        )

        assertEquals("/api/invites/forged_invite", requestedPath)
        assertTrue(dao.stored.isEmpty())
        assertTrue(dao.upserted.isEmpty())
        assertEquals(listOf("forged_invite"), dao.deletedInviteIds)
    }

    @Test
    fun canonical_invite_response_is_the_only_invitation_written_from_a_push_hint() = runTest {
        val dao = InvitePushTestInviteDao()
        val dataSource = CurrentUserDataSource(InvitePushTestPreferencesDataStore())
        dataSource.saveUserId("viewer_1")
        var authorization: String? = null
        val api = invitePushTestApi(MockEngine { request ->
            authorization = request.headers[HttpHeaders.Authorization]
            invitePushJsonResponse(
                """
                {
                  "invite": {
                    "id": "invite_1",
                    "type": "TEAM",
                    "email": "player@example.test",
                    "status": "PENDING",
                    "eventId": "event_from_server",
                    "organizationId": "org_from_server",
                    "teamId": "team_from_server",
                    "userId": "child_from_server",
                    "createdBy": "host_from_server"
                  }
                }
                """.trimIndent(),
            )
        })
        val refresher = InvitePushInvalidationRefresher(
            userDataSource = dataSource,
            api = api,
            databaseService = InvitePushTestDatabaseService(dao),
            ensureAuthenticated = { true },
        )

        refresher.refreshFromPayload(
            mapOf(
                "inviteId" to "invite_1",
                "type" to "STAFF",
                "status" to "ACCEPTED",
                "eventId" to "event_from_attacker",
                "organizationId" to "org_from_attacker",
                "teamId" to "team_from_attacker",
                "userId" to "user_from_attacker",
                "createdBy" to "creator_from_attacker",
            ),
        )

        assertEquals("Bearer session-token", authorization)
        assertEquals(1, dao.upserted.size)
        assertEquals(
            Invite(
                id = "invite_1",
                type = "TEAM",
                email = "player@example.test",
                status = "PENDING",
                eventId = "event_from_server",
                organizationId = "org_from_server",
                teamId = "team_from_server",
                userId = "child_from_server",
                createdBy = "host_from_server",
            ),
            dao.stored["invite_1"],
        )
    }

    @Test
    fun canonical_terminal_invite_from_push_is_removed_instead_of_cached() = runTest {
        val dao = InvitePushTestInviteDao(
            invites = listOf(
                Invite(
                    id = "invite_1",
                    type = "TEAM",
                    email = "player@example.test",
                    status = "PENDING",
                    userId = "viewer_1",
                ),
            ),
        )
        val dataSource = CurrentUserDataSource(InvitePushTestPreferencesDataStore())
        dataSource.saveUserId("viewer_1")
        val api = invitePushTestApi(MockEngine {
            invitePushJsonResponse(
                """
                {
                  "invite": {
                    "id": "invite_1",
                    "type": "TEAM",
                    "email": "player@example.test",
                    "status": "DECLINED",
                    "userId": "viewer_1"
                  }
                }
                """.trimIndent(),
            )
        })
        val refresher = InvitePushInvalidationRefresher(
            userDataSource = dataSource,
            api = api,
            databaseService = InvitePushTestDatabaseService(dao),
            ensureAuthenticated = { true },
        )

        refresher.refreshFromPayload(mapOf("inviteId" to "invite_1"))

        assertTrue(dao.stored.isEmpty())
        assertTrue(dao.upserted.isEmpty())
        assertEquals(listOf("invite_1"), dao.deletedInviteIds)
    }

    @Test
    fun idless_invitation_hint_pages_all_pending_invites_before_replacing_current_user_cache() = runTest {
        val dao = InvitePushTestInviteDao(
            invites = listOf(
                Invite(
                    id = "historical_payload_row",
                    type = "TEAM",
                    email = "forged@example.test",
                    userId = "child_1",
                    teamId = "forged_team",
                    childUserId = "child_1",
                    viewerCanAcceptForChild = true,
                ),
            ),
        )
        val dataSource = CurrentUserDataSource(InvitePushTestPreferencesDataStore())
        dataSource.saveUserId("viewer_1")
        val requestedCursors = mutableListOf<String?>()
        val api = invitePushTestApi(MockEngine { request ->
            assertEquals("/api/invites", request.url.encodedPath)
            assertEquals("viewer_1", request.url.parameters["userId"])
            assertEquals("PENDING", request.url.parameters["status"])
            assertEquals("100", request.url.parameters["limit"])
            val cursor = request.url.parameters["cursor"]
            requestedCursors += cursor
            if (cursor == null) {
                invitePushJsonResponse(
                    """
                    {
                      "invites":[
                        {"id":"invite_1","type":"TEAM","email":"one@example.test","status":"PENDING","userId":"viewer_1"}
                      ],
                      "nextCursor":"push_page_2"
                    }
                    """.trimIndent(),
                )
            } else {
                assertEquals("push_page_2", cursor)
                invitePushJsonResponse(
                    """
                    {
                      "invites":[
                        {"id":"invite_2","type":"STAFF","email":"two@example.test","status":"PENDING","userId":"viewer_1"}
                      ],
                      "nextCursor":null
                    }
                    """.trimIndent(),
                )
            }
        })
        val refresher = InvitePushInvalidationRefresher(
            userDataSource = dataSource,
            api = api,
            databaseService = InvitePushTestDatabaseService(dao),
            ensureAuthenticated = { true },
        )

        refresher.refreshFromPayload(mapOf("notificationType" to "invitations"))

        assertEquals(listOf(null, "push_page_2"), requestedCursors)
        assertEquals(setOf("invite_1", "invite_2"), dao.stored.keys)
        assertEquals(1, dao.replaceInvocationCount)
        assertEquals(0, dao.replaceDeleteCount)
    }

    @Test
    fun unauthenticated_push_hint_never_calls_the_invitation_api_or_mutates_cache() = runTest {
        val dao = InvitePushTestInviteDao()
        val dataSource = CurrentUserDataSource(InvitePushTestPreferencesDataStore())
        dataSource.saveUserId("viewer_1")
        var apiCalled = false
        val api = invitePushTestApi(MockEngine {
            apiCalled = true
            invitePushJsonResponse("{\"invite\":{}}")
        })
        val refresher = InvitePushInvalidationRefresher(
            userDataSource = dataSource,
            api = api,
            databaseService = InvitePushTestDatabaseService(dao),
            ensureAuthenticated = { false },
        )

        refresher.refreshFromPayload(mapOf("inviteId" to "invite_1"))

        assertTrue(!apiCalled)
        assertTrue(dao.stored.isEmpty())
    }
}
