@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventDetail.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import com.razumly.mvp.core.data.CurrentUserDataSource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlin.test.assertNull
import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.OfficialAssignmentHolderType
import com.razumly.mvp.core.db.MVPDatabaseService
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.configureMvpHttpClient
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.Instant

private object MatchRepositoryRoomPersistence_EmptyAuthTokenStore : AuthTokenStore {
    override suspend fun get(): String = ""
    override suspend fun set(token: String) = Unit
    override suspend fun clear() = Unit
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class MatchRepositoryRoomPersistenceTest {
    private lateinit var context: Context
    private val databaseName = "match-repository-room-persistence"

    @Before
    fun setUp() {
        context = RuntimeEnvironment.getApplication().applicationContext as Context
        context.deleteDatabase(databaseName)
    }

    @After
    fun tearDown() {
        context.deleteDatabase(databaseName)
    }

    @Test
    fun given_placeholder_graph_and_unbound_slot_when_room_reopens_then_schedule_is_preserved() = runTest {
        val expected = roomBackedSchedule()
        val first = openDatabase()
        try {
            first.getMatchDao.upsertMatch(expected)
        } finally {
            first.close()
        }

        val reopened = openDatabase()
        try {
            val restored = assertNotNull(reopened.getMatchDao.getMatchById(expected.id)).match

            assertEquals(expected, restored)
            assertEquals("placeholder-team-1", restored.team1Id)
            assertEquals("placeholder-team-2", restored.team2Id)
            assertEquals("placeholder-team-duty", restored.teamOfficialId)
            assertEquals(
                MatchOfficialAssignment(
                    positionId = "position-r1",
                    slotIndex = 0,
                    holderType = OfficialAssignmentHolderType.OFFICIAL,
                    userId = null,
                    eventOfficialId = null,
                    checkedIn = false,
                    hasConflict = false,
                ),
                restored.officialIds.single(),
            )
        } finally {
            reopened.close()
        }
    }

    @Test
    fun given_room_backed_schedule_when_remote_refresh_is_rejected_then_local_schedule_is_unchanged() = runTest {
        val expected = roomBackedSchedule()
        val database = openDatabase()
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/events/event-room/matches", request.url.encodedPath)
            respond(
                content = """{"error":"schedule refresh rejected"}""",
                status = HttpStatusCode.Conflict,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) {
            configureMvpHttpClient()
        }
        try {
            database.getMatchDao.upsertMatch(expected)
            val repository = MatchRepository(
                api = MvpApiClient(
                    http = http,
                    baseUrl = "http://example.test",
                    tokenStore = MatchRepositoryRoomPersistence_EmptyAuthTokenStore,
                ),
                databaseService = database,
                autoSyncOperations = false,
            )

            val result = repository.getMatchesOfTournament(expected.eventId)

            assertTrue(result.isSuccess)
            assertEquals(listOf(expected), result.getOrThrow())
            assertEquals(expected, database.getMatchDao.getMatchById(expected.id)?.match)
            assertEquals(listOf(expected), database.getMatchDao.getMatchesOfTournament(expected.eventId))
        } finally {
            http.close()
            database.close()
        }
    }

    @Test
    fun given_private_roster_when_refreshed_and_reopened_then_room_preserves_readiness_and_account_scope() = runTest {
        val accounts = CurrentUserDataSource(RosterPreferences())
        accounts.saveUserId("official")
        var forbidden = false
        val http = HttpClient(MockEngine {
            respond(
                content = if (forbidden) """{"error":"Forbidden"}""" else """{"rosters":[{"eventTeamId":"team","canEdit":false,"teamName":"River Crew","entries":[{"userId":"managed","firstName":"Alex","documentReadiness":{"documents":{"signedCount":0,"requiredCount":1},"requiredDocuments":[{"templateId":"version","title":"Waiver","signerContext":"participant","status":"UNSIGNED"}]}}]}]}""",
                status = if (forbidden) HttpStatusCode.Forbidden else HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }) { configureMvpHttpClient() }
        val api = MvpApiClient(http, "http://example.test", MatchRepositoryRoomPersistence_EmptyAuthTokenStore)
        val first = openDatabase()
        try {
            val repository = MatchRepository(api, first, currentUserDataSource = accounts, autoSyncOperations = false)
            val response = repository.getMatchRosters("event", "match").getOrThrow()
            assertEquals(response, repository.observeMatchRosters("event", "match").first())
            assertEquals(0, response.rosters.single().entries.single().documentReadiness?.documents?.signedCount)
        } finally { first.close() }
        val reopened = openDatabase()
        try {
            val repository = MatchRepository(api, reopened, currentUserDataSource = accounts, autoSyncOperations = false)
            assertEquals("managed", repository.observeMatchRosters("event", "match").first()?.rosters?.single()?.entries?.single()?.userId)
            accounts.saveUserId("member")
            assertNull(repository.observeMatchRosters("event", "match").first())
            accounts.saveUserId("official")
            forbidden = true
            assertTrue(repository.getMatchRosters("event", "match").isFailure)
            assertNull(repository.observeMatchRosters("event", "match").first())
        } finally { reopened.close(); http.close() }
    }

    private fun openDatabase(): MVPDatabaseService =
        Room.databaseBuilder<MVPDatabaseService>(context, databaseName)
            .setJournalMode(RoomDatabase.JournalMode.TRUNCATE)
            .allowMainThreadQueries()
            .build()

    private fun roomBackedSchedule(): MatchMVP = MatchMVP(
        id = "match-room",
        matchId = 1,
        eventId = "event-room",
        team1Id = "placeholder-team-1",
        team2Id = "placeholder-team-2",
        team1Seed = 1,
        team2Seed = 2,
        fieldId = "field-1",
        start = Instant.parse("2026-08-22T09:00:00Z"),
        end = Instant.parse("2026-08-22T10:00:00Z"),
        placementState = "PLACED",
        phase = "BRACKET",
        sourceDivisionId = "division-entry",
        phaseDivisionId = "division-bracket",
        division = "division-entry",
        winnerNextMatchId = "match-room-final",
        officialIds = listOf(
            MatchOfficialAssignment(
                positionId = "position-r1",
                slotIndex = 0,
                holderType = OfficialAssignmentHolderType.OFFICIAL,
                userId = null,
                eventOfficialId = null,
                checkedIn = false,
                hasConflict = false,
            ),
        ),
        teamOfficialId = "placeholder-team-duty",
    )
}

private class RosterPreferences : DataStore<Preferences> {
    private val state = MutableStateFlow<Preferences>(emptyPreferences())
    override val data: Flow<Preferences> = state
    override suspend fun updateData(transform: suspend (Preferences) -> Preferences): Preferences =
        transform(state.value).also { state.value = it }
}
