@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventDetail.data

import androidx.room.Room
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.db.MVPDatabaseService
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.configureMvpHttpClient
import com.razumly.mvp.core.network.dto.MatchActionOperationDto
import com.razumly.mvp.core.network.dto.MatchResponseDto
import com.razumly.mvp.core.network.dto.MatchesResponseDto
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertIs
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant

private object TerminalRoomAuth : AuthTokenStore {
    override suspend fun get() = ""
    override suspend fun set(token: String) = Unit
    override suspend fun clear() = Unit
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class TerminalMatchRoomTest {
    @Test
    fun given_lost_response_when_retried_then_same_operation_replays_without_room_changes() = runTest(timeout = 180.seconds) {
        assumeTrue(System.getenv("RUN_DATABASE_INTEGRATION") == "1")
        val eventId = "terminal-mobile-${UUID.randomUUID()}"
        val initial = terminalSiteRequest(buildJsonObject { put("action", "seed"); put("eventId", eventId) })["body"]!!.jsonObject
        val before = jsonMVP.decodeFromString<MatchesResponseDto>(initial.toString()).matches.map { requireNotNull(it.toMatchOrNull()) }
        val real = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(RuntimeEnvironment.getApplication()).allowMainThreadQueries().build()
        val requests = mutableListOf<JsonObject>()
        val http = HttpClient(MockEngine { request ->
            val body = jsonMVP.parseToJsonElement((request.body as OutgoingContent.ByteArrayContent).bytes().decodeToString()).jsonObject
            val update = body["update"]!!.jsonObject
            requests += update
            val response = terminalSiteRequest(buildJsonObject {
                put("action", "patch"); put("eventId", eventId); put("matchId", "$eventId:1"); put("body", update)
            })
            if (requests.size == 1) throw java.io.IOException("Response lost after commit")
            respond(response["body"]!!.jsonPrimitive.content, HttpStatusCode.fromValue(response["status"]!!.jsonPrimitive.int),
                headersOf(HttpHeaders.ContentType, "application/json"))
        }) { configureMvpHttpClient() }
        try {
            val oldEnd = Instant.parse("2026-09-04T10:25:00Z")
            real.getEventDao.upsertEvent(Event(id = eventId, end = oldEnd))
            real.getMatchDao.upsertMatches(before)
            val match = before.first { it.id == "$eventId:1" }
            val action = MatchActionOperationDto("FORFEIT", forfeitingEventTeamId = "$eventId:Summit")
            val repository = MatchRepository(MvpApiClient(http, "http://example.test", TerminalRoomAuth), real, autoSyncOperations = false)
            val failed = repository.updateMatchOperations(match, matchAction = action, time = Instant.parse("2026-09-04T09:35:00Z"))
            assertEquals("DELIVERY_UNCERTAIN", assertIs<TerminalMatchFailure>(failed.exceptionOrNull()).code)
            val reopened = MatchRepository(MvpApiClient(http, "http://example.test", TerminalRoomAuth), real, autoSyncOperations = false)
            val replayed = reopened.updateMatchOperations(match, matchAction = action, time = Instant.parse("2026-09-04T09:36:00Z"))
            assertEquals("REPLAYED", assertIs<TerminalMatchNoChange>(replayed.exceptionOrNull()).result.status.name)
            assertEquals("REPLAYED", reopened.terminalMatchOutcome.value?.status?.name)
            assertEquals(2, requests.size)
            assertEquals(requests[0], requests[1])
            assertEquals(before.sortedBy { it.id }, real.getMatchDao.getMatchesOfTournament(eventId).sortedBy { it.id })
            assertEquals(oldEnd, real.getEventDao.getEventById(eventId)?.end)
            assertEquals(0, real.getMatchOperationOutboxDao.pendingOperationCount())
        } finally {
            http.close()
            real.close()
            terminalSiteRequest(buildJsonObject { put("action", "cleanup"); put("eventId", eventId) })
        }
    }

    @Test
    fun given_committed_result_when_room_write_fails_then_retry_uses_saved_result_without_reposting() = runTest(timeout = 180.seconds) {
        assumeTrue(System.getenv("RUN_DATABASE_INTEGRATION") == "1")
        val eventId = "terminal-mobile-${UUID.randomUUID()}"
        val initial = terminalSiteRequest(buildJsonObject { put("action", "seed"); put("eventId", eventId) })["body"]!!.jsonObject
        val before = jsonMVP.decodeFromString<MatchesResponseDto>(initial.toString()).matches.map { requireNotNull(it.toMatchOrNull()) }
        val real = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(RuntimeEnvironment.getApplication()).allowMainThreadQueries().build()
        var failSave = true
        var posts = 0
        val database = object : DatabaseService by real {
            override val getMatchDao = object : MatchDao by real.getMatchDao {
                override suspend fun upsertMatches(matches: List<MatchMVP>) {
                    real.getMatchDao.upsertMatches(matches)
                    if (failSave) error("Injected Room write failure")
                }
            }
        }
        val http = HttpClient(MockEngine { request ->
            posts += 1
            check(posts == 1) { "A committed terminal operation must not be posted again after a Room failure." }
            val body = jsonMVP.parseToJsonElement((request.body as OutgoingContent.ByteArrayContent).bytes().decodeToString()).jsonObject
            val update = body["update"]!!.jsonObject
            val response = terminalSiteRequest(buildJsonObject {
                put("action", "patch"); put("eventId", eventId); put("matchId", "$eventId:1"); put("body", update)
            })
            respond(response["body"]!!.jsonPrimitive.content, HttpStatusCode.fromValue(response["status"]!!.jsonPrimitive.int),
                headersOf(HttpHeaders.ContentType, "application/json"))
        }) { configureMvpHttpClient() }
        try {
            val oldEnd = Instant.parse("2026-09-04T10:25:00Z")
            real.getEventDao.upsertEvent(Event(id = eventId, end = oldEnd))
            real.getMatchDao.upsertMatches(before)
            val match = before.first { it.id == "$eventId:1" }
            val action = MatchActionOperationDto("FORFEIT", forfeitingEventTeamId = "$eventId:Summit")
            val repository = MatchRepository(MvpApiClient(http, "http://example.test", TerminalRoomAuth), database, autoSyncOperations = false)
            val failed = repository.updateMatchOperations(match, matchAction = action, time = Instant.parse("2026-09-04T09:35:00Z"))
            assertIs<TerminalMatchSyncPending>(failed.exceptionOrNull())
            assertEquals(before.sortedBy { it.id }, real.getMatchDao.getMatchesOfTournament(eventId).sortedBy { it.id })
            assertEquals(oldEnd, real.getEventDao.getEventById(eventId)?.end)
            failSave = false
            val reopened = MatchRepository(MvpApiClient(http, "http://example.test", TerminalRoomAuth), database, autoSyncOperations = false)
            val retried = reopened.updateMatchOperations(match, matchAction = action, time = Instant.parse("2026-09-04T09:36:00Z"))
            assertEquals("COMPLETE", retried.getOrThrow().status)
            assertEquals(1, posts)
            assertEquals(Instant.parse("2026-09-04T10:35:00Z"), real.getEventDao.getEventById(eventId)?.end)
            assertEquals(0, real.getMatchOperationOutboxDao.pendingOperationCount())
        } finally {
            http.close()
            real.close()
            terminalSiteRequest(buildJsonObject { put("action", "cleanup"); put("eventId", eventId) })
        }
    }

    @Test
    fun given_forfeit_when_site_commits_then_room_saves_all_matches_and_event_end_together() = runTest(timeout = 180.seconds) {
        assumeTrue(System.getenv("RUN_DATABASE_INTEGRATION") == "1")
        val eventId = "terminal-mobile-${UUID.randomUUID()}"
        val initial = terminalSiteRequest(buildJsonObject { put("action", "seed"); put("eventId", eventId) })["body"]!!.jsonObject
        val before = jsonMVP.decodeFromString<MatchesResponseDto>(initial.toString()).matches.map { requireNotNull(it.toMatchOrNull()) }
        val real = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(RuntimeEnvironment.getApplication()).allowMainThreadQueries().build()
        var transactions = 0
        var matchWrites = 0
        var received: MatchResponseDto? = null
        val database = object : DatabaseService by real {
            override suspend fun <R> withTransaction(block: suspend () -> R): R {
                transactions += 1
                return real.withTransaction(block)
            }
            override val getMatchDao = object : MatchDao by real.getMatchDao {
                override suspend fun upsertMatches(matches: List<MatchMVP>) {
                    matchWrites += 1
                    real.getMatchDao.upsertMatches(matches)
                }
            }
        }
        val http = HttpClient(MockEngine { request ->
            assertEquals(HttpMethod.Patch, request.method)
            assertEquals("/api/events/$eventId/matches/terminal", request.url.encodedPath)
            assertEquals(before.sortedBy { it.id }, real.getMatchDao.getMatchesOfTournament(eventId).sortedBy { it.id })
            val body = jsonMVP.parseToJsonElement((request.body as OutgoingContent.ByteArrayContent).bytes().decodeToString()).jsonObject
            assertEquals("$eventId:1", body["matchId"]!!.jsonPrimitive.content)
            val update = body["update"]!!.jsonObject
            assertEquals(1, update["terminalContractVersion"]!!.jsonPrimitive.int)
            assertNotNull(update["clientOperationId"])
            val response = terminalSiteRequest(buildJsonObject {
                put("action", "patch"); put("eventId", eventId); put("matchId", "$eventId:1"); put("body", update)
            })
            val text = response["body"]!!.jsonPrimitive.content
            received = jsonMVP.decodeFromString(text)
            respond(text, HttpStatusCode.fromValue(response["status"]!!.jsonPrimitive.int),
                headersOf(HttpHeaders.ContentType, "application/json"))
        }) { configureMvpHttpClient() }
        try {
            real.getEventDao.upsertEvent(Event(id = eventId, end = Instant.parse("2026-09-04T10:25:00Z")))
            real.getMatchDao.upsertMatches(before)
            val repository = MatchRepository(MvpApiClient(http, "http://example.test", TerminalRoomAuth), database, autoSyncOperations = false)
            val result = repository.updateMatchOperations(before.first { it.id == "$eventId:1" },
                matchAction = MatchActionOperationDto("FORFEIT", forfeitingEventTeamId = "$eventId:Summit"),
                time = Instant.parse("2026-09-04T09:35:00Z"))
            assertEquals("COMPLETE", result.getOrThrow().status)
            assertEquals(1, transactions)
            assertEquals(1, matchWrites)
            assertEquals(Instant.parse("2026-09-04T10:35:00Z"), real.getEventDao.getEventById(eventId)?.end)
            val saved = real.getMatchDao.getMatchesOfTournament(eventId).associateBy { it.id }
            assertEquals("$eventId:Harbor", saved["$eventId:2"]?.team1Id)
            assertEquals(Instant.parse("2026-09-04T09:40:00Z"), saved["$eventId:2"]?.start)
            assertEquals(Instant.parse("2026-09-04T10:10:00Z"), saved["$eventId:3"]?.start)
            assertEquals(Instant.parse("2026-09-04T09:25:00Z"), saved["$eventId:1"]?.end)
            assertEquals(3, assertNotNull(received?.terminalResult).matches.size)
            assertEquals(0, real.getMatchOperationOutboxDao.pendingOperationCount())
        } finally {
            http.close()
            real.close()
            terminalSiteRequest(buildJsonObject { put("action", "cleanup"); put("eventId", eventId) })
        }
    }
}

private fun terminalSiteRequest(command: JsonObject): JsonObject {
    val site = System.getenv("MVP_SITE_DIR")?.takeIf(String::isNotBlank)?.let(::File)
        ?: generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
            .map { File(it, "apps/site") }.first { File(it, "package.json").isFile }
    val process = ProcessBuilder("node", "--import", "tsx", "scripts/test-terminal-match-api.ts")
        .directory(site).start()
    val output = CompletableFuture.supplyAsync { process.inputStream.bufferedReader().readText() }
    val errors = CompletableFuture.supplyAsync { process.errorStream.bufferedReader().readText() }
    process.outputStream.bufferedWriter().use { it.write(command.toString()) }
    if (!process.waitFor(60, TimeUnit.SECONDS)) {
        process.destroyForcibly()
        error("The terminal site route did not finish.")
    }
    check(process.exitValue() == 0) { errors.get(5, TimeUnit.SECONDS) }
    return jsonMVP.parseToJsonElement(output.get(5, TimeUnit.SECONDS)).jsonObject
}
