package com.razumly.mvp.eventDetail.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
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
import com.razumly.mvp.core.network.dto.MatchIncidentOperationDto
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
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
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
) : DatabaseService {
    override val getTeamDao: TeamDao get() = error("unused")
    override val getUserDataDao: UserDataDao get() = error("unused")
    override val getEventDao: EventDao get() = error("unused")
    override val getEventRegistrationDao: EventRegistrationDao get() = error("unused")
    override val getChatGroupDao: ChatGroupDao get() = error("unused")
    override val getMessageDao: MessageDao get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao get() = error("unused")
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
    fun setMatchScoreUsesDedicatedScoreEndpointAndSavesResponse() = runTest {
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
        )
        val matchDao = MatchRepositoryHttp_FakeMatchDao(listOf(localMatch))
        val repository = MatchRepository(
            api = MvpApiClient(http, "http://example.test", MatchRepositoryHttp_InMemoryAuthTokenStore()),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(matchDao),
        )

        val result = repository.setMatchScore(
            match = localMatch,
            segmentId = "match_1_segment_1",
            sequence = 1,
            eventTeamId = "team_1",
            points = 3,
        )

        assertTrue(result.isSuccess)
        assertEquals(listOf("/api/events/event_1/matches/match_1/score"), requestedPaths)
        assertEquals(listOf(3), result.getOrThrow().team1Points)
        assertEquals(listOf(3), matchDao.upsertedMatches.single().team1Points)
    }

    @Test
    fun addMatchIncidentUsesDedicatedIncidentEndpointAndSavesResponse() = runTest {
        val requestedPaths = mutableListOf<String>()
        val engine = MockEngine { request ->
            requestedPaths += request.url.encodedPath
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("/api/events/event_1/matches/match_1/incidents", request.url.encodedPath)
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
        )
        val matchDao = MatchRepositoryHttp_FakeMatchDao(listOf(localMatch))
        val repository = MatchRepository(
            api = MvpApiClient(http, "http://example.test", MatchRepositoryHttp_InMemoryAuthTokenStore()),
            databaseService = MatchRepositoryHttp_FakeDatabaseService(matchDao),
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
        assertEquals(listOf("/api/events/event_1/matches/match_1/incidents"), requestedPaths)
        assertEquals("incident_1", result.getOrThrow().incidents.single().id)
        assertEquals("incident_1", matchDao.upsertedMatches.single().incidents.single().id)
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
}
