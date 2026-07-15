package com.razumly.mvp.eventDetail.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_ACKED
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_PENDING
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_RETRYABLE
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_TERMINAL
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchOperationOutboxEntry
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.daos.ChatGroupDao
import com.razumly.mvp.core.data.dataTypes.daos.EventDao
import com.razumly.mvp.core.data.dataTypes.daos.EventRegistrationDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchOperationOutboxDao
import com.razumly.mvp.core.data.dataTypes.daos.MessageDao
import com.razumly.mvp.core.data.dataTypes.daos.RefundRequestDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.MatchIncidentOperationDto
import com.razumly.mvp.core.network.dto.MatchLifecycleOperationDto
import com.razumly.mvp.core.network.dto.MatchSegmentOperationDto
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.HttpResponseValidator
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.headersOf
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private class MatchRepositoryHttp_InMemoryAuthTokenStore(
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

private fun createMatchRepositoryHttpClient(
    engine: MockEngine,
    validateResponses: Boolean = false,
): HttpClient = HttpClient(engine) {
    install(ContentNegotiation) {
        json(jsonMVP)
    }
    if (validateResponses) {
        HttpResponseValidator {
            validateResponse { response ->
                if (!response.status.isSuccess()) {
                    throw ApiException(
                        statusCode = response.status.value,
                        url = response.call.request.url.toString(),
                        responseBody = response.bodyAsText(),
                    )
                }
            }
        }
    }
}

private class MatchRepositoryHttp_FakeMatchDao(
    initialMatches: List<MatchMVP>,
) : MatchDao {
    private val matches = MutableStateFlow(initialMatches.associateBy { it.id })
    val upsertedMatches = mutableListOf<MatchMVP>()

    override suspend fun upsertMatch(match: MatchMVP) {
        upsertedMatches += match
        matches.value = matches.value + (match.id to match)
    }

    override suspend fun upsertMatches(matches: List<MatchMVP>) {
        upsertedMatches += matches
        this.matches.value = this.matches.value + matches.associateBy { it.id }
    }

    override suspend fun deleteMatch(match: MatchMVP) {
        matches.value = matches.value - match.id
    }

    override suspend fun getTotalMatchCount(): Int = matches.value.size

    override suspend fun getMatchesOfTournament(tournamentId: String): List<MatchMVP> =
        matches.value.values.filter { it.eventId == tournamentId }

    override suspend fun deleteMatchesOfTournament(tournamentId: String) {
        matches.value = matches.value.filterValues { it.eventId != tournamentId }
    }

    override suspend fun deleteMatchesById(ids: List<String>) {
        matches.value = matches.value - ids.toSet()
    }

    override fun getMatchFlowById(id: String): Flow<MatchWithRelations?> =
        matches.map { value -> value[id]?.toRelations() }

    override suspend fun getMatchById(id: String): MatchWithRelations? =
        matches.value[id]?.toRelations()

    override fun getMatchesFlowOfTournament(tournamentId: String): Flow<List<MatchWithRelations>> =
        matches.map { value ->
            value.values
                .filter { it.eventId == tournamentId }
                .map { it.toRelations() }
        }

    private fun MatchMVP.toRelations() = MatchWithRelations(
        match = this,
        field = null,
        team1 = null,
        team2 = null,
        teamOfficial = null,
        winnerNextMatch = null,
        loserNextMatch = null,
        previousLeftMatch = null,
        previousRightMatch = null,
    )
}

private class MatchRepositoryHttp_FakeDatabaseService(
    override val getMatchDao: MatchDao,
    override val getFieldDao: FieldDao = MatchRepositoryHttp_FakeFieldDao(),
    override val getMatchOperationOutboxDao: MatchOperationOutboxDao = MatchRepositoryHttp_FakeOutboxDao(),
) : DatabaseService {
    override val getTeamDao: TeamDao get() = error("unused")
    override val getUserDataDao: UserDataDao get() = error("unused")
    override val getEventDao: EventDao get() = error("unused")
    override val getEventRegistrationDao: EventRegistrationDao get() = error("unused")
    override val getChatGroupDao: ChatGroupDao get() = error("unused")
    override val getMessageDao: MessageDao get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao get() = error("unused")
}

private class MatchRepositoryHttp_FakeOutboxDao : MatchOperationOutboxDao {
    private val operationsById = linkedMapOf<String, MatchOperationOutboxEntry>()
    val operations: List<MatchOperationOutboxEntry> get() = operationsById.values.toList()
    var yieldDuringAllocation: Boolean = false

    override suspend fun upsertOperation(operation: MatchOperationOutboxEntry) {
        operationsById[operation.id] = operation
    }

    override suspend fun upsertOperations(operations: List<MatchOperationOutboxEntry>) {
        operations.forEach { operation -> operationsById[operation.id] = operation }
    }

    override suspend fun getPendingOperations(
        pendingStatus: String,
        retryableStatus: String,
        syncingStatus: String,
        legacyFailedStatus: String,
    ): List<MatchOperationOutboxEntry> =
        pendingOperationsFor(
            matchId = null,
            statuses = setOf(pendingStatus, retryableStatus, syncingStatus, legacyFailedStatus),
        )

    override suspend fun getPendingOperationsForMatch(
        matchId: String,
        pendingStatus: String,
        retryableStatus: String,
        syncingStatus: String,
        legacyFailedStatus: String,
    ): List<MatchOperationOutboxEntry> =
        pendingOperationsFor(
            matchId = matchId,
            statuses = setOf(pendingStatus, retryableStatus, syncingStatus, legacyFailedStatus),
        )

    override suspend fun pendingOperationCount(
        pendingStatus: String,
        retryableStatus: String,
        syncingStatus: String,
        legacyFailedStatus: String,
    ): Int =
        pendingOperationsFor(
            matchId = null,
            statuses = setOf(pendingStatus, retryableStatus, syncingStatus, legacyFailedStatus),
        ).size

    override suspend fun getOperationsByIds(ids: List<String>): List<MatchOperationOutboxEntry> =
        ids.mapNotNull(operationsById::get)

    override suspend fun maxClientSequence(): Long =
        operationsById.values.maxOfOrNull { operation -> operation.clientSequence } ?: 0L

    override suspend fun allocateAndInsertOperation(operation: MatchOperationOutboxEntry): MatchOperationOutboxEntry {
        val persisted = operation.copy(clientSequence = maxClientSequence() + 1L)
        if (yieldDuringAllocation) {
            yield()
        }
        upsertOperation(persisted)
        return persisted
    }

    override suspend fun markAttempting(
        id: String,
        attemptedAt: String,
        status: String,
        pendingStatus: String,
        retryableStatus: String,
    ): Int {
        val operation = operationsById[id] ?: return 0
        if (operation.status !in setOf(pendingStatus, retryableStatus)) return 0
        operationsById[id] = operation.copy(
            status = status,
            lastAttemptAt = attemptedAt,
            attemptCount = operation.attemptCount + 1,
            lastError = null,
        )
        return 1
    }

    override suspend fun markAcked(id: String, ackedAt: String, status: String) {
        operationsById[id] = operationsById.getValue(id).copy(
            status = status,
            ackedAt = ackedAt,
            lastError = null,
        )
    }

    override suspend fun markRetryable(id: String, error: String, failedAt: String, status: String) {
        operationsById[id] = operationsById.getValue(id).copy(
            status = status,
            lastError = error,
            lastAttemptAt = failedAt,
        )
    }

    override suspend fun markTerminal(id: String, error: String, failedAt: String, status: String) {
        operationsById[id] = operationsById.getValue(id).copy(
            status = status,
            lastError = error,
            lastAttemptAt = failedAt,
        )
    }

    override suspend fun recoverInterruptedOperations(
        retryableStatus: String,
        syncingStatus: String,
        legacyFailedStatus: String,
    ): Int {
        val recoverableStatuses = setOf(syncingStatus, legacyFailedStatus)
        val ids = operationsById.values
            .filter { operation -> operation.status in recoverableStatuses }
            .map { operation -> operation.id }
        ids.forEach { id ->
            operationsById[id] = operationsById.getValue(id).copy(status = retryableStatus)
        }
        return ids.size
    }

    override suspend fun deleteAckedOlderThan(olderThan: String, status: String) {
        operationsById.values
            .filter { operation -> operation.status == status && operation.ackedAt.orEmpty() < olderThan }
            .map { operation -> operation.id }
            .forEach(operationsById::remove)
    }

    private fun pendingOperationsFor(
        matchId: String?,
        statuses: Set<String>,
    ): List<MatchOperationOutboxEntry> {
        return operationsById.values
            .asSequence()
            .filter { operation -> operation.status in statuses }
            .filter { operation -> matchId == null || operation.matchId == matchId }
            .sortedWith(compareBy<MatchOperationOutboxEntry> { it.clientSequence }.thenBy { it.clientCreatedAt })
            .toList()
    }
}

private class MatchRepositoryHttp_FakeFieldDao : FieldDao {
    val upsertedFields = mutableListOf<Field>()

    override suspend fun upsertField(field: Field) {
        upsertedFields += field
    }

    override suspend fun upsertFields(fields: List<Field>) {
        upsertedFields += fields
    }

    override suspend fun getFieldsByIds(ids: List<String>): List<Field> = emptyList()

    override suspend fun getAllFields(): List<Field> = emptyList()

    override suspend fun deleteFieldsById(ids: List<String>) = Unit

    override suspend fun deleteField(field: Field) = Unit

    override fun getFieldById(id: String): Flow<FieldWithMatches?> = error("unused")

    override fun getFieldsWithMatches(ids: List<String>): Flow<List<FieldWithMatches>> = error("unused")
}

class MatchRepositoryHttpTest {
    @Test
    fun getMatchRefreshesFromDetailEndpointAndSavesIncidents() = runTest {
        val requestedPaths = mutableListOf<String>()
        val engine = MockEngine { request ->
            requestedPaths += request.url.encodedPath
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/events/event_1/matches/match_1", request.url.encodedPath)
            respond(
                content = """
                    {
                      "match": {
                        "id": "match_1",
                        "matchId": 1,
                        "eventId": "event_1",
                        "team1Id": "team_1",
                        "team2Id": "team_2",
                        "team1Points": [2],
                        "team2Points": [0],
                        "incidents": [
                          {
                            "id": "incident_1",
                            "eventId": "event_1",
                            "matchId": "match_1",
                            "segmentId": "match_1_segment_1",
                            "eventTeamId": "team_1",
                            "incidentType": "GOAL",
                            "sequence": 1,
                            "linkedPointDelta": 1
                          }
                        ]
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) {
            install(ContentNegotiation) {
                json(jsonMVP)
            }
        }
        val localMatch = MatchMVP(
            id = "match_1",
            matchId = 1,
            eventId = "event_1",
            team1Id = "team_1",
            team2Id = "team_2",
            team1Points = listOf(2),
            team2Points = listOf(0),
        )
        val matchDao = MatchRepositoryHttp_FakeMatchDao(listOf(localMatch))
        val repository = MatchRepository(
            api = MvpApiClient(http, "http://example.test", MatchRepositoryHttp_InMemoryAuthTokenStore()),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(matchDao),
        )

        val result = repository.getMatch("match_1")

        assertTrue(result.isSuccess)
        assertEquals(listOf("/api/events/event_1/matches/match_1"), requestedPaths)
        assertEquals(1, result.getOrThrow().incidents.size)
        assertEquals("incident_1", result.getOrThrow().incidents.single().id)
        assertEquals(1, matchDao.upsertedMatches.single().incidents.size)
    }

    @Test
    fun setMatchScoreAppliesLocallyThenSyncsDedicatedScoreEndpoint() = runTest {
        val requestedPaths = mutableListOf<String>()
        val engine = MockEngine { request ->
            requestedPaths += request.url.encodedPath
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("/api/events/event_1/matches/match_1/score", request.url.encodedPath)
            respond(
                content = """
                    {
                      "match": {
                        "id": "match_1",
                        "matchId": 1,
                        "eventId": "event_1",
                        "team1Id": "team_1",
                        "team2Id": "team_2",
                        "team1Points": [3],
                        "team2Points": [1],
                        "incidents": []
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = createMatchRepositoryHttpClient(engine)
        val localMatch = MatchMVP(
            id = "match_1",
            matchId = 1,
            eventId = "event_1",
            team1Id = "team_1",
            team2Id = "team_2",
        )
        val matchDao = MatchRepositoryHttp_FakeMatchDao(listOf(localMatch))
        val outboxDao = MatchRepositoryHttp_FakeOutboxDao()
        val repository = MatchRepository(
            api = MvpApiClient(http, "http://example.test", MatchRepositoryHttp_InMemoryAuthTokenStore()),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(
                getMatchDao = matchDao,
                getMatchOperationOutboxDao = outboxDao,
            ),
            autoSyncOperations = false,
        )

        val result = repository.setMatchScore(
            match = localMatch,
            segmentId = "match_1_segment_1",
            sequence = 1,
            eventTeamId = "team_1",
            points = 3,
        )

        assertTrue(result.isSuccess)
        assertTrue(requestedPaths.isEmpty())
        assertEquals(listOf(3), result.getOrThrow().team1Points)
        assertEquals(listOf(3), matchDao.upsertedMatches.single().team1Points)
        assertEquals(MATCH_OPERATION_STATUS_PENDING, outboxDao.operations.single().status)

        val syncResult = repository.syncPendingMatchOperations("match_1")

        assertTrue(syncResult.isSuccess)
        assertEquals(1, syncResult.getOrThrow())
        assertEquals(listOf("/api/events/event_1/matches/match_1/score"), requestedPaths)
        assertEquals(MATCH_OPERATION_STATUS_ACKED, outboxDao.operations.single().status)
    }

    @Test
    fun addMatchIncidentAppliesLocallyThenSyncsMatchOperationsEndpoint() = runTest {
        val requestedPaths = mutableListOf<String>()
        val engine = MockEngine { request ->
            requestedPaths += request.url.encodedPath
            assertEquals(HttpMethod.Patch, request.method)
            assertEquals("/api/events/event_1/matches/match_1", request.url.encodedPath)
            respond(
                content = """
                    {
                      "match": {
                        "id": "match_1",
                        "matchId": 1,
                        "eventId": "event_1",
                        "team1Id": "team_1",
                        "team2Id": "team_2",
                        "team1Points": [1],
                        "team2Points": [0],
                        "incidents": [
                          {
                            "id": "incident_1",
                            "eventId": "event_1",
                            "matchId": "match_1",
                            "segmentId": "match_1_segment_1",
                            "eventTeamId": "team_1",
                            "incidentType": "GOAL",
                            "sequence": 1,
                            "linkedPointDelta": 1
                          }
                        ]
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = createMatchRepositoryHttpClient(engine)
        val localMatch = MatchMVP(
            id = "match_1",
            matchId = 1,
            eventId = "event_1",
            team1Id = "team_1",
            team2Id = "team_2",
        )
        val matchDao = MatchRepositoryHttp_FakeMatchDao(listOf(localMatch))
        val outboxDao = MatchRepositoryHttp_FakeOutboxDao()
        val repository = MatchRepository(
            api = MvpApiClient(http, "http://example.test", MatchRepositoryHttp_InMemoryAuthTokenStore()),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(
                getMatchDao = matchDao,
                getMatchOperationOutboxDao = outboxDao,
            ),
            autoSyncOperations = false,
        )

        val result = repository.addMatchIncident(
            match = localMatch,
            operation = MatchIncidentOperationDto(
                action = "CREATE",
                id = "incident_1",
                segmentId = "match_1_segment_1",
                eventTeamId = "team_1",
                incidentType = "GOAL",
                linkedPointDelta = 1,
            ),
        )

        assertTrue(result.isSuccess)
        assertTrue(requestedPaths.isEmpty())
        assertEquals("incident_1", result.getOrThrow().incidents.single().id)
        assertEquals("incident_1", matchDao.upsertedMatches.single().incidents.single().id)
        assertEquals(MATCH_OPERATION_STATUS_PENDING, outboxDao.operations.single().status)

        val syncResult = repository.syncPendingMatchOperations("match_1")

        assertTrue(syncResult.isSuccess)
        assertEquals(1, syncResult.getOrThrow())
        assertEquals(listOf("/api/events/event_1/matches/match_1"), requestedPaths)
        assertEquals(MATCH_OPERATION_STATUS_ACKED, outboxDao.operations.single().status)
    }

    @Test
    fun terminalIncidentRejectionIsNotRetriedOnLaterDrains() = runTest {
        val requestedPaths = mutableListOf<String>()
        val engine = MockEngine { request ->
            requestedPaths += request.url.encodedPath
            when (request.method) {
                HttpMethod.Patch -> respond(
                    content = """{"error":"Forbidden"}""",
                    status = HttpStatusCode.Forbidden,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
                HttpMethod.Get -> respond(
                    content = """
                        {
                          "match": {
                            "id": "match_1",
                            "matchId": 1,
                            "eventId": "event_1",
                            "team1Id": "team_1",
                            "team2Id": "team_2",
                            "incidents": []
                          }
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
                else -> error("Unexpected ${request.method} ${request.url.encodedPath}")
            }
        }
        val localMatch = MatchMVP(
            id = "match_1",
            matchId = 1,
            eventId = "event_1",
            team1Id = "team_1",
            team2Id = "team_2",
        )
        val matchDao = MatchRepositoryHttp_FakeMatchDao(listOf(localMatch))
        val outboxDao = MatchRepositoryHttp_FakeOutboxDao()
        val repository = MatchRepository(
            api = MvpApiClient(
                createMatchRepositoryHttpClient(engine, validateResponses = true),
                "http://example.test",
                MatchRepositoryHttp_InMemoryAuthTokenStore(),
            ),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(
                getMatchDao = matchDao,
                getMatchOperationOutboxDao = outboxDao,
            ),
            autoSyncOperations = false,
        )

        repository.addMatchIncident(
            match = localMatch,
            operation = MatchIncidentOperationDto(
                action = "CREATE",
                id = "incident_1",
                segmentId = "match_1_segment_1",
                eventTeamId = "team_1",
                incidentType = "GOAL",
                linkedPointDelta = 1,
            ),
        ).getOrThrow()

        val initialDrain = repository.syncPendingMatchOperations("match_1")
        val laterDrain = repository.syncPendingMatchOperations("match_1")

        assertTrue(initialDrain.isSuccess)
        assertEquals(0, initialDrain.getOrThrow())
        assertTrue(laterDrain.isSuccess)
        assertEquals(0, laterDrain.getOrThrow())
        assertEquals(
            listOf(
                "/api/events/event_1/matches/match_1",
                "/api/events/event_1/matches/match_1",
            ),
            requestedPaths,
        )
        assertEquals(MATCH_OPERATION_STATUS_TERMINAL, outboxDao.operations.single().status)
        assertTrue(matchDao.getMatchById("match_1")?.match?.incidents.orEmpty().isEmpty())
    }

    @Test
    fun updateMatchOperationsKeepsLocalStartWhenRemoteSyncFails() = runTest {
        val requestedPaths = mutableListOf<String>()
        val engine = MockEngine { request ->
            requestedPaths += request.url.encodedPath
            assertEquals(HttpMethod.Patch, request.method)
            assertEquals("/api/events/event_1/matches/match_1", request.url.encodedPath)
            respond(
                content = """{"error":"offline"}""",
                status = HttpStatusCode.InternalServerError,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = createMatchRepositoryHttpClient(engine, validateResponses = true)
        val localMatch = MatchMVP(
            id = "match_1",
            matchId = 1,
            eventId = "event_1",
            team1Id = "team_1",
            team2Id = "team_2",
            segments = listOf(
                MatchSegmentMVP(
                    id = "match_1_segment_1",
                    eventId = "event_1",
                    matchId = "match_1",
                    sequence = 1,
                    status = "NOT_STARTED",
                )
            ),
        )
        val matchDao = MatchRepositoryHttp_FakeMatchDao(listOf(localMatch))
        val outboxDao = MatchRepositoryHttp_FakeOutboxDao()
        val repository = MatchRepository(
            api = MvpApiClient(http, "http://example.test", MatchRepositoryHttp_InMemoryAuthTokenStore()),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(
                getMatchDao = matchDao,
                getMatchOperationOutboxDao = outboxDao,
            ),
            autoSyncOperations = false,
        )

        val startedAt = "2026-06-08T20:00:00Z"
        val result = repository.updateMatchOperations(
            match = localMatch,
            lifecycle = MatchLifecycleOperationDto(
                status = "IN_PROGRESS",
                actualStart = startedAt,
            ),
            segmentOperations = listOf(
                MatchSegmentOperationDto(
                    id = "match_1_segment_1",
                    sequence = 1,
                    status = "IN_PROGRESS",
                    startedAt = startedAt,
                )
            ),
        )

        assertTrue(result.isSuccess)
        assertTrue(requestedPaths.isEmpty())
        val startedMatch = result.getOrThrow()
        assertEquals("IN_PROGRESS", startedMatch.status)
        assertEquals(startedAt, startedMatch.actualStart)
        assertEquals("IN_PROGRESS", startedMatch.segments.single().status)
        assertEquals(startedAt, startedMatch.segments.single().startedAt)
        assertEquals(MATCH_OPERATION_STATUS_PENDING, outboxDao.operations.single().status)

        val syncResult = repository.syncPendingMatchOperations("match_1")

        assertTrue(syncResult.isSuccess)
        assertEquals(0, syncResult.getOrThrow())
        assertEquals(listOf("/api/events/event_1/matches/match_1"), requestedPaths)
        assertEquals(MATCH_OPERATION_STATUS_RETRYABLE, outboxDao.operations.single().status)
        assertEquals("IN_PROGRESS", matchDao.getMatchById("match_1")?.match?.status)
    }

    @Test
    fun concurrentScoreEnqueuesAllocateDistinctSequencesWithoutOverwritingEntries() = runTest {
        val localMatch = MatchMVP(
            id = "match_1",
            matchId = 1,
            eventId = "event_1",
            team1Id = "team_1",
            team2Id = "team_2",
        )
        val matchDao = MatchRepositoryHttp_FakeMatchDao(listOf(localMatch))
        val outboxDao = MatchRepositoryHttp_FakeOutboxDao().apply {
            // This yields after MAX(sequence) but before INSERT. Without the repository mutex,
            // two enqueuers would both persist sequence 1 in this fake DAO.
            yieldDuringAllocation = true
        }
        val repository = MatchRepository(
            api = MvpApiClient(
                HttpClient(MockEngine { _ -> error("network must not be used while auto sync is disabled") }),
                "http://example.test",
                MatchRepositoryHttp_InMemoryAuthTokenStore(),
            ),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(
                getMatchDao = matchDao,
                getMatchOperationOutboxDao = outboxDao,
            ),
            autoSyncOperations = false,
        )

        val enqueueResults = listOf(3, 4)
            .map { points ->
                async {
                    repository.setMatchScore(
                        match = localMatch,
                        segmentId = "match_1_segment_1",
                        sequence = 1,
                        eventTeamId = "team_1",
                        points = points,
                    )
                }
            }
            .awaitAll()

        assertTrue(enqueueResults.all { result -> result.isSuccess })
        val entries = outboxDao.operations.sortedBy(MatchOperationOutboxEntry::clientSequence)
        assertEquals(listOf(1L, 2L), entries.map(MatchOperationOutboxEntry::clientSequence))
        assertEquals(2, entries.map(MatchOperationOutboxEntry::id).toSet().size)
        assertTrue(entries.all { entry -> entry.status == MATCH_OPERATION_STATUS_PENDING })
    }

    @Test
    fun concurrentDrainersSendOnlyOneOperationAtATime() = runTest {
        val firstRequestStarted = CompletableDeferred<Unit>()
        val releaseRequests = CompletableDeferred<Unit>()
        var activeRequests = 0
        var peakConcurrentRequests = 0
        var requestCount = 0
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("/api/events/event_1/matches/match_1/score", request.url.encodedPath)
            activeRequests += 1
            peakConcurrentRequests = maxOf(peakConcurrentRequests, activeRequests)
            firstRequestStarted.complete(Unit)
            try {
                releaseRequests.await()
            } finally {
                activeRequests -= 1
            }
            requestCount += 1
            respond(
                content = """
                    {
                      "match": {
                        "id": "match_1",
                        "matchId": 1,
                        "eventId": "event_1",
                        "team1Id": "team_1",
                        "team2Id": "team_2",
                        "team1Points": [4],
                        "team2Points": [0]
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val localMatch = MatchMVP(
            id = "match_1",
            matchId = 1,
            eventId = "event_1",
            team1Id = "team_1",
            team2Id = "team_2",
        )
        val matchDao = MatchRepositoryHttp_FakeMatchDao(listOf(localMatch))
        val outboxDao = MatchRepositoryHttp_FakeOutboxDao()
        val repository = MatchRepository(
            api = MvpApiClient(
                createMatchRepositoryHttpClient(engine),
                "http://example.test",
                MatchRepositoryHttp_InMemoryAuthTokenStore(),
            ),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(
                getMatchDao = matchDao,
                getMatchOperationOutboxDao = outboxDao,
            ),
            autoSyncOperations = false,
        )
        repository.setMatchScore(localMatch, "match_1_segment_1", 1, "team_1", 3).getOrThrow()
        repository.setMatchScore(localMatch, "match_1_segment_1", 1, "team_1", 4).getOrThrow()

        val firstDrain = async { repository.syncPendingMatchOperations("match_1") }
        firstRequestStarted.await()
        val secondDrain = async { repository.syncPendingMatchOperations("match_1") }
        yield()

        assertEquals(1, peakConcurrentRequests)

        releaseRequests.complete(Unit)
        val drainResults = awaitAll(firstDrain, secondDrain)

        assertTrue(drainResults.all { result -> result.isSuccess })
        assertEquals(2, requestCount)
        assertEquals(2, drainResults.sumOf { result -> result.getOrThrow() })
        assertTrue(outboxDao.operations.all { entry -> entry.status == MATCH_OPERATION_STATUS_ACKED })
    }

    @Test
    fun terminalScoreRejectionRemovesItsOverlayAndAllowsLaterOperationToSync() = runTest {
        val requestedPaths = mutableListOf<String>()
        val scoreRequestBodies = mutableListOf<String>()
        var scoreRequestCount = 0
        val engine = MockEngine { request ->
            requestedPaths += request.url.encodedPath
            when (request.method) {
                HttpMethod.Post -> {
                    scoreRequestCount += 1
                    scoreRequestBodies += (request.body as? OutgoingContent.ByteArrayContent)
                        ?.bytes()
                        ?.decodeToString()
                        .orEmpty()
                    if (scoreRequestCount == 1) {
                        respond(
                            content = """{"error":"Forbidden"}""",
                            status = HttpStatusCode.Forbidden,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                        )
                    } else {
                        respond(
                            content = """
                                {
                                  "match": {
                                    "id": "match_1",
                                    "matchId": 1,
                                    "eventId": "event_1",
                                    "team1Id": "team_1",
                                    "team2Id": "team_2",
                                    "team1Points": [4],
                                    "team2Points": [0]
                                  }
                                }
                            """.trimIndent(),
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                        )
                    }
                }
                HttpMethod.Get -> respond(
                    content = """
                        {
                          "match": {
                            "id": "match_1",
                            "matchId": 1,
                            "eventId": "event_1",
                            "team1Id": "team_1",
                            "team2Id": "team_2",
                            "team1Points": [0],
                            "team2Points": [0]
                          }
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
                else -> error("Unexpected ${request.method} ${request.url.encodedPath}")
            }
        }
        val localMatch = MatchMVP(
            id = "match_1",
            matchId = 1,
            eventId = "event_1",
            team1Id = "team_1",
            team2Id = "team_2",
            team1Points = listOf(0),
            team2Points = listOf(0),
        )
        val matchDao = MatchRepositoryHttp_FakeMatchDao(listOf(localMatch))
        val outboxDao = MatchRepositoryHttp_FakeOutboxDao()
        val repository = MatchRepository(
            api = MvpApiClient(
                createMatchRepositoryHttpClient(engine, validateResponses = true),
                "http://example.test",
                MatchRepositoryHttp_InMemoryAuthTokenStore(),
            ),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(
                getMatchDao = matchDao,
                getMatchOperationOutboxDao = outboxDao,
            ),
            autoSyncOperations = false,
        )
        repository.setMatchScore(localMatch, "match_1_segment_1", 1, "team_1", 3).getOrThrow()
        repository.setMatchScore(localMatch, "match_1_segment_1", 1, "team_1", 4).getOrThrow()
        val firstEntry = outboxDao.operations.sortedBy(MatchOperationOutboxEntry::clientSequence).first()

        val syncResult = repository.syncPendingMatchOperations("match_1")

        assertTrue(syncResult.isSuccess)
        assertEquals(1, syncResult.getOrThrow())
        assertEquals(
            listOf(
                "/api/events/event_1/matches/match_1/score",
                "/api/events/event_1/matches/match_1",
                "/api/events/event_1/matches/match_1/score",
            ),
            requestedPaths,
        )
        assertTrue(scoreRequestBodies.first().contains("\"clientOperationId\":\"${firstEntry.id}\""))
        assertTrue(scoreRequestBodies.first().contains("\"clientDeviceId\":\"phone\""))
        assertTrue(scoreRequestBodies.first().contains("\"clientSequence\":${firstEntry.clientSequence}"))
        val entries = outboxDao.operations.sortedBy(MatchOperationOutboxEntry::clientSequence)
        assertEquals(MATCH_OPERATION_STATUS_TERMINAL, entries.first().status)
        assertEquals(MATCH_OPERATION_STATUS_ACKED, entries.last().status)
        assertEquals(listOf(4), matchDao.getMatchById("match_1")?.match?.team1Points)
    }

    @Test
    fun getMatchPreservesIgnoredLocalScoreFieldsWhileApplyingRemoteNonScoreFields() = runTest {
        val requestedPaths = mutableListOf<String>()
        val engine = MockEngine { request ->
            requestedPaths += request.url.encodedPath
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/events/event_1/matches/match_1", request.url.encodedPath)
            respond(
                content = """
                    {
                      "match": {
                        "id": "match_1",
                        "matchId": 1,
                        "eventId": "event_1",
                        "team1Id": "team_1",
                        "team2Id": "team_2",
                        "team1Points": [0],
                        "team2Points": [0],
                        "setResults": [0],
                        "officialCheckedIn": true,
                        "fieldId": "field_remote"
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) {
            install(ContentNegotiation) {
                json(jsonMVP)
            }
        }
        val localMatch = MatchMVP(
            id = "match_1",
            matchId = 1,
            eventId = "event_1",
            team1Id = "team_1",
            team2Id = "team_2",
            team1Points = listOf(2),
            team2Points = listOf(1),
            setResults = listOf(1),
            segments = listOf(
                MatchSegmentMVP(
                    id = "match_1_segment_1",
                    eventId = "event_1",
                    matchId = "match_1",
                    sequence = 1,
                    status = "COMPLETE",
                    scores = mapOf("team_1" to 2, "team_2" to 1),
                    winnerEventTeamId = "team_1",
                )
            ),
        )
        val matchDao = MatchRepositoryHttp_FakeMatchDao(listOf(localMatch))
        val repository = MatchRepository(
            api = MvpApiClient(http, "http://example.test", MatchRepositoryHttp_InMemoryAuthTokenStore()),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(matchDao),
        )
        repository.setIgnoreMatch(localMatch)

        val result = repository.getMatch("match_1")

        assertTrue(result.isSuccess)
        assertEquals(listOf("/api/events/event_1/matches/match_1"), requestedPaths)
        val refreshedMatch = result.getOrThrow()
        assertEquals(listOf(2), refreshedMatch.team1Points)
        assertEquals(listOf(1), refreshedMatch.team2Points)
        assertEquals(listOf(1), refreshedMatch.setResults)
        assertEquals(2, refreshedMatch.segments.single().scores["team_1"])
        assertEquals(true, refreshedMatch.officialCheckedIn)
        assertEquals("field_remote", refreshedMatch.fieldId)
        val savedMatch = matchDao.upsertedMatches.single()
        assertEquals(listOf(2), savedMatch.team1Points)
        assertEquals(listOf(1), savedMatch.team2Points)
        assertEquals("field_remote", savedMatch.fieldId)
    }

    @Test
    fun getMatchesOfTournamentPreservesIgnoredLocalScoreFieldsWhileApplyingRemoteNonScoreFields() = runTest {
        val requestedPaths = mutableListOf<String>()
        val engine = MockEngine { request ->
            requestedPaths += request.url.encodedPath
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/events/event_1/matches", request.url.encodedPath)
            respond(
                content = """
                    {
                      "matches": [
                        {
                          "id": "match_1",
                          "matchId": 1,
                          "eventId": "event_1",
                          "team1Id": "team_1",
                          "team2Id": "team_2",
                          "team1Points": [0],
                          "team2Points": [0],
                          "setResults": [0],
                          "officialCheckedIn": true,
                          "fieldId": "field_remote"
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) {
            install(ContentNegotiation) {
                json(jsonMVP)
            }
        }
        val localMatch = MatchMVP(
            id = "match_1",
            matchId = 1,
            eventId = "event_1",
            team1Id = "team_1",
            team2Id = "team_2",
            team1Points = listOf(3),
            team2Points = listOf(2),
            setResults = listOf(0),
            segments = listOf(
                MatchSegmentMVP(
                    id = "match_1_segment_1",
                    eventId = "event_1",
                    matchId = "match_1",
                    sequence = 1,
                    status = "IN_PROGRESS",
                    scores = mapOf("team_1" to 3, "team_2" to 2),
                )
            ),
        )
        val matchDao = MatchRepositoryHttp_FakeMatchDao(listOf(localMatch))
        val repository = MatchRepository(
            api = MvpApiClient(http, "http://example.test", MatchRepositoryHttp_InMemoryAuthTokenStore()),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(matchDao),
        )
        repository.setIgnoreMatch(localMatch)

        val result = repository.getMatchesOfTournament("event_1")

        assertTrue(result.isSuccess)
        assertEquals(listOf("/api/events/event_1/matches"), requestedPaths)
        val refreshedMatch = result.getOrThrow().single()
        assertEquals(listOf(3), refreshedMatch.team1Points)
        assertEquals(listOf(2), refreshedMatch.team2Points)
        assertEquals(3, refreshedMatch.segments.single().scores["team_1"])
        assertEquals(true, refreshedMatch.officialCheckedIn)
        assertEquals("field_remote", refreshedMatch.fieldId)
        val savedMatch = matchDao.upsertedMatches.single()
        assertEquals(listOf(3), savedMatch.team1Points)
        assertEquals(listOf(2), savedMatch.team2Points)
        assertEquals("field_remote", savedMatch.fieldId)
    }

    @Test
    fun getMatchesOfTournamentPersistsEmbeddedFieldsFromMatchResponses() = runTest {
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/events/event_1/matches", request.url.encodedPath)
            respond(
                content = """
                    {
                      "matches": [
                        {
                          "id": "match_1",
                          "matchId": 1,
                          "eventId": "event_1",
                          "team1Id": "team_1",
                          "team2Id": "team_2",
                          "field": {
                            "id": "field_1",
                            "fieldNumber": 1,
                            "name": "Field 1"
                          }
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) {
            install(ContentNegotiation) {
                json(jsonMVP)
            }
        }
        val matchDao = MatchRepositoryHttp_FakeMatchDao(emptyList())
        val fieldDao = MatchRepositoryHttp_FakeFieldDao()
        val repository = MatchRepository(
            api = MvpApiClient(http, "http://example.test", MatchRepositoryHttp_InMemoryAuthTokenStore()),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(
                getMatchDao = matchDao,
                getFieldDao = fieldDao,
            ),
        )

        val result = repository.getMatchesOfTournament("event_1")

        assertTrue(result.isSuccess)
        assertEquals("field_1", result.getOrThrow().single().fieldId)
        assertEquals(listOf("field_1"), fieldDao.upsertedFields.map(Field::id))
        assertEquals("field_1", matchDao.upsertedMatches.single().fieldId)
    }

    @Test
    fun getMatchesOfTournamentAcceptsPartialEmbeddedFieldsWithoutPersistingIncompleteFieldRows() = runTest {
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/events/event_1/matches", request.url.encodedPath)
            respond(
                content = """
                    {
                      "matches": [
                        {
                          "id": "match_1",
                          "matchId": 1,
                          "eventId": "event_1",
                          "team1Id": "team_1",
                          "team2Id": "team_2",
                          "field": {
                            "id": "field_1",
                            "name": "Field 1"
                          }
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) {
            install(ContentNegotiation) {
                json(jsonMVP)
            }
        }
        val matchDao = MatchRepositoryHttp_FakeMatchDao(emptyList())
        val fieldDao = MatchRepositoryHttp_FakeFieldDao()
        val repository = MatchRepository(
            api = MvpApiClient(http, "http://example.test", MatchRepositoryHttp_InMemoryAuthTokenStore()),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(
                getMatchDao = matchDao,
                getFieldDao = fieldDao,
            ),
        )

        val result = repository.getMatchesOfTournament("event_1")

        assertTrue(result.isSuccess)
        assertEquals("field_1", result.getOrThrow().single().fieldId)
        assertTrue(fieldDao.upsertedFields.isEmpty())
        assertEquals("field_1", matchDao.upsertedMatches.single().fieldId)
    }

    @Test
    fun updateMatchesBulk_sends_json_null_for_cached_nullable_field_clear() = runTest {
        var capturedBody = ""
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Patch, request.method)
            assertEquals("/api/events/event_1/matches", request.url.encodedPath)
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()
            respond(
                content = """
                    {
                      "matches": [
                        {
                          "id": "match_1",
                          "matchId": 1,
                          "eventId": "event_1",
                          "team1Id": "team_1",
                          "team2Id": "team_2",
                          "fieldId": null
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) {
            install(ContentNegotiation) {
                json(jsonMVP)
            }
        }
        val existingMatch = MatchMVP(
            id = "match_1",
            matchId = 1,
            eventId = "event_1",
            team1Id = "team_1",
            team2Id = "team_2",
            fieldId = "field_1",
        )
        val matchDao = MatchRepositoryHttp_FakeMatchDao(listOf(existingMatch))
        val repository = MatchRepository(
            api = MvpApiClient(http, "http://example.test", MatchRepositoryHttp_InMemoryAuthTokenStore()),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(getMatchDao = matchDao),
        )

        repository.updateMatchesBulk(listOf(existingMatch.copy(fieldId = null))).getOrThrow()

        assertTrue(capturedBody.contains("\"fieldId\":null"))
    }
}
