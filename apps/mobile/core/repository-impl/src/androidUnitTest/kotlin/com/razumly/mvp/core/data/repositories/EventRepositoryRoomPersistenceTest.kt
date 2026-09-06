package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.daos.EventDao
import com.razumly.mvp.core.data.dataTypes.daos.EventTimeSlotDao
import android.content.Context
import androidx.room.Room
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.DivisionPhaseSettingsMVP
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventAuthorityCapabilities
import com.razumly.mvp.core.data.dataTypes.EventManagementAuthority
import com.razumly.mvp.core.data.dataTypes.isAffiliateEvent
import com.razumly.mvp.core.network.dto.EventProvenanceDto
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.TimeSlotDTO
import com.razumly.mvp.core.data.dataTypes.toEventTimeSlotCacheEntry
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.db.MVPDatabaseService
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.configureMvpHttpClient
import com.razumly.mvp.core.network.dto.EventEditorBasicsDto
import com.razumly.mvp.core.network.dto.EventEditorAcceptMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceAcceptedResultDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphDivisionDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphFieldDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphLeagueConfigDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphEventDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphPlayoffConfigDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphTeamDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphMatchDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceRequestDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseStatus
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorCapabilitiesDto
import com.razumly.mvp.core.network.dto.EventEditorCompetitionDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionMode
import com.razumly.mvp.core.network.dto.EventEditorCreateCommandDto
import com.razumly.mvp.core.network.dto.EventEditorCreateProposalDto
import com.razumly.mvp.core.network.dto.EventEditorCreateProposalGraphDto
import com.razumly.mvp.core.network.dto.EventEditorDivisionDetailDto
import com.razumly.mvp.core.network.dto.EventEditorDraftDto
import com.razumly.mvp.core.network.dto.EventEditorExpectedCreateRevisionsDto
import com.razumly.mvp.core.network.dto.EventEditorFieldDto
import com.razumly.mvp.core.network.dto.EventEditorImmutableDto
import com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto
import com.razumly.mvp.core.network.dto.EventEditorPaymentDto
import com.razumly.mvp.core.network.dto.EventEditorParticipationDto
import com.razumly.mvp.core.network.dto.EventEditorRegistrationDto
import com.razumly.mvp.core.network.dto.EventEditorResourcesDto
import com.razumly.mvp.core.network.dto.EventEditorRevisionBindingDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorScheduleStateDto
import com.razumly.mvp.core.network.dto.EventEditorSaveCommandDto
import com.razumly.mvp.core.network.dto.EventEditorSaveScheduleTransitionDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleTransitionMode
import com.razumly.mvp.core.network.dto.EventEditorSaveResultDto
import com.razumly.mvp.core.network.dto.EventEditorSnapshotDto
import com.razumly.mvp.core.network.dto.EventEditorStaffDto
import com.razumly.mvp.core.network.dto.EventEditorTimeSlotDto
import com.razumly.mvp.core.network.dto.EventParticipantsSnapshotResponseDto
import com.razumly.mvp.core.network.dto.EventApiDto
import com.razumly.mvp.core.network.dto.EventDetailBootstrapResponseDto
import com.razumly.mvp.core.network.dto.TeamApiDto
import com.razumly.mvp.core.network.dto.MatchApiDto
import com.razumly.mvp.core.network.dto.ScheduleReflowRequestDto
import com.razumly.mvp.core.network.dto.ScheduleReflowResultDto
import com.razumly.mvp.core.network.dto.ScheduleReflowStatus
import com.razumly.mvp.core.network.dto.ScheduleReflowFieldPolicy
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.mockk.every
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.encodeToString
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.assertIs
import kotlin.time.Instant
import java.io.File
import java.util.concurrent.TimeUnit

private object EventRepositoryRoomPersistence_AuthTokenStore : AuthTokenStore {
    override suspend fun get(): String = "room-test-token"
    override suspend fun set(token: String) = Unit
    override suspend fun clear() = Unit
}

private val roomMaintenanceResponseJson = Json {
    encodeDefaults = true
    explicitNulls = true
    isLenient = true
    allowSpecialFloatingPointValues = true
    allowStructuredMapKeys = true
    useArrayPolymorphism = false
}
private inline fun <reified T> encodeRoomMaintenanceResponse(value: T): String {
    val root = roomMaintenanceResponseJson.encodeToJsonElement(serializer(), value).jsonObject
    val graph = root["graph"]?.jsonObject ?: return roomMaintenanceResponseJson.encodeToString(value)
    val event = graph["event"]?.jsonObject
        ?: return roomMaintenanceResponseJson.encodeToString(value)
    val enrichedEvent = JsonObject(
        event.filterKeys { key ->
            key !in setOf(
                "address",
                "affiliateUrl",
                "automatedScheduling",
                "registrationByDivisionType",
                "timeZone",
            )
        } + mapOf(
            "teams" to JsonArray(
                event["teams"]?.jsonArray?.map { team ->
                    JsonObject(team.jsonObject + mapOf(
                        "captainId" to (team.jsonObject["captainId"] ?: JsonNull),
                    ))
                } ?: emptyList(),
            ),
            "fields" to JsonArray(
                event["fields"]?.jsonArray?.map { field ->
                    JsonObject(
                        field.jsonObject.filterKeys { key ->
                            key !in setOf(
                                "fieldNumber",
                                "inUse",
                                "location",
                                "rentalSlotIds",
                                "sportIds",
                            )
                        } + mapOf(
                            "organizationId" to (field.jsonObject["organizationId"] ?: JsonNull),
                        ),
                    )
                } ?: emptyList(),
            ),
            "timeSlots" to JsonArray(
                event["timeSlots"]?.jsonArray?.map { slot ->
                    JsonObject(
                        slot.jsonObject + mapOf(
                            "price" to (slot.jsonObject["price"] ?: JsonNull),
                        ),
                    )
                } ?: emptyList(),
            ),
            "cancellationRefundHours" to (event["cancellationRefundHours"] ?: JsonNull),
            "coordinates" to (event["coordinates"] ?: JsonNull),
            "hostId" to (event["hostId"] ?: JsonNull),
            "imageId" to (event["imageId"] ?: JsonNull),
            "leagueScoringConfigId" to (event["leagueScoringConfigId"] ?: JsonNull),
            "matchRulesOverride" to (event["matchRulesOverride"] ?: JsonNull),
            "maxAge" to (event["maxAge"] ?: JsonNull),
            "minAge" to (event["minAge"] ?: JsonNull),
            "organizationId" to (event["organizationId"] ?: JsonNull),
            "price" to (event["price"] ?: JsonNull),
            "rating" to (event["rating"] ?: JsonNull),
            "resolvedMatchRules" to (event["resolvedMatchRules"] ?: JsonNull),
            "seedColor" to (event["seedColor"] ?: JsonNull),
        ),
    )
    val matches = graph["matches"]?.jsonArray
        ?: return roomMaintenanceResponseJson.encodeToString(value)
    val enrichedMatches = JsonArray(matches.map { match ->
        val matchObject = match.jsonObject
        JsonObject(
            matchObject + mapOf(
                "start" to (matchObject["start"] ?: JsonNull),
                "end" to (matchObject["end"] ?: JsonNull),
                "fieldId" to (matchObject["fieldId"] ?: JsonNull),
                "field" to (matchObject["field"] ?: JsonNull),
                "official" to (matchObject["official"] ?: JsonNull),
                "officialAssignments" to (matchObject["officialAssignments"] ?: JsonArray(emptyList())),
                "team1" to (matchObject["team1"] ?: JsonNull),
                "team2" to (matchObject["team2"] ?: JsonNull),
                "teamOfficial" to (matchObject["teamOfficial"] ?: JsonNull),
                "teamOfficialSeed" to (matchObject["teamOfficialSeed"] ?: JsonNull),
                "actualEnd" to (matchObject["actualEnd"] ?: JsonNull),
                "actualStart" to (matchObject["actualStart"] ?: JsonNull),
                "loserNextMatchId" to (matchObject["loserNextMatchId"] ?: JsonNull),
                "matchRulesSnapshot" to (matchObject["matchRulesSnapshot"] ?: JsonNull),
                "previousLeftId" to (matchObject["previousLeftId"] ?: JsonNull),
                "previousRightId" to (matchObject["previousRightId"] ?: JsonNull),
                "resolvedMatchRules" to (matchObject["resolvedMatchRules"] ?: JsonNull),
                "resultStatus" to (matchObject["resultStatus"] ?: JsonNull),
                "resultType" to (matchObject["resultType"] ?: JsonNull),
                "side" to (matchObject["side"] ?: JsonNull),
                "status" to (matchObject["status"] ?: JsonNull),
                "statusReason" to (matchObject["statusReason"] ?: JsonNull),
                "team1Id" to (matchObject["team1Id"] ?: JsonNull),
                "team1Seed" to (matchObject["team1Seed"] ?: JsonNull),
                "team2Id" to (matchObject["team2Id"] ?: JsonNull),
                "team2Seed" to (matchObject["team2Seed"] ?: JsonNull),
                "teamOfficialId" to (matchObject["teamOfficialId"] ?: JsonNull),
                "winnerEventTeamId" to (matchObject["winnerEventTeamId"] ?: JsonNull),
                "winnerNextMatchId" to (matchObject["winnerNextMatchId"] ?: JsonNull),
            ),
        )
    })
    return roomMaintenanceResponseJson.encodeToString(
        JsonObject(
            root + mapOf(
                "graph" to JsonObject(
                    graph + mapOf(
                        "event" to enrichedEvent,
                        "matches" to enrichedMatches,
                    ),
                ),
            ),
        ),
    )
}

private class EventRepositoryRoomPersistence_NoStartupCleanupDatabase(
    private val delegate: MVPDatabaseService,
    private val onTransaction: suspend () -> Unit = {},
) : DatabaseService by delegate {
    override suspend fun <R> withTransaction(block: suspend () -> R): R {
        onTransaction()
        return delegate.withTransaction(block)
    }

    override val getEventDao: EventDao = object : EventDao by delegate.getEventDao {
        override suspend fun deleteAllEvents() = Unit
    }

    override val getEventTimeSlotDao: EventTimeSlotDao =
        object : EventTimeSlotDao by delegate.getEventTimeSlotDao {
            override suspend fun deleteAllTimeSlots() = Unit
        }
}

private class EventRepositoryRoomPersistence_FailingMatchDatabase(
    private val delegate: MVPDatabaseService,
    private val onMatchWrite: () -> Unit,
    private val onTransaction: suspend () -> Unit = {},
) : DatabaseService by delegate {
    override suspend fun <R> withTransaction(block: suspend () -> R): R {
        onTransaction()
        return delegate.withTransaction(block)
    }
    override val getMatchDao: MatchDao = object : MatchDao by delegate.getMatchDao {
        override suspend fun upsertMatches(matches: List<MatchMVP>) {
            delegate.getMatchDao.upsertMatches(matches)
            onMatchWrite()
            error("deterministic match persistence failure")
        }
    }
}

private data class EventRepositoryRoomPersistence_TournamentFixture(
    val eventId: String,
    val fieldId: String,
    val timeSlotId: String,
    val phaseDivisionId: String,
    val command: EventEditorCreateCommandDto,
    val draft: EventEditorDraftDto,
    val proposal: EventEditorCreateProposalDto,
    val saved: EventEditorSaveResultDto,
    val eventResponse: EventApiDto,
)

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class EventRepositoryRoomPersistenceTest {
    @Test
    fun given_live_rental_event_when_adding_resources_then_api_and_room_preserve_booking_authority() =
        kotlinx.coroutines.test.runTest(timeout = kotlin.time.Duration.parse("5m")) {
            val apiUrl = System.getenv("MVP_ISSUE50_API_URL").orEmpty()
            val eventId = System.getenv("MVP_ISSUE50_EVENT_ID").orEmpty()
            val token = System.getenv("MVP_ISSUE50_TOKEN").orEmpty()
            org.junit.Assume.assumeTrue("Issue 50 live API fixtures are not configured.", apiUrl.isNotBlank() && eventId.isNotBlank() && token.isNotBlank())
            require(java.net.URI(apiUrl).host in setOf("localhost", "127.0.0.1") && eventId.startsWith("issue-50-"))
            val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context).allowMainThreadQueries().build()
            val http = HttpClient { configureMvpHttpClient() }
            val tokens = mockk<AuthTokenStore>()
            coEvery { tokens.get() } returns token
            val repository = eventRepositoryRoomPersistenceRepository(
                EventRepositoryRoomPersistence_NoStartupCleanupDatabase(database), http,
                UnconfinedTestDispatcher(testScheduler), api = MvpApiClient(http, apiUrl, tokens),
            )
            try {
                val opened = repository.getEventEditor(eventId).getOrThrow()
                val original = opened.canonicalState
                val bookedSlot = original.timeSlots.single()
                val field = Field(id = "$eventId-added-field", name = "Organizer court", organizationId = original.event.organizationId)
                val slot = bookedSlot.copy(
                    id = "$eventId-added-slot", scheduledFieldId = field.id, scheduledFieldIds = listOf(field.id),
                    rentalBookingId = null, rentalBookingItemId = null, rentalLocked = false, sourceType = "CUSTOM",
                )
                val desired = original.copy(
                    event = original.event.copy(
                        name = "Organizer current name", fieldIds = original.event.fieldIds + field.id,
                        timeSlotIds = original.event.timeSlotIds + slot.id,
                    ), fields = original.fields + field, timeSlots = original.timeSlots + slot,
                )
                repository.saveEventEditor(eventId, EventEditorSessionMapper.toSaveCommand(opened, EventEditorMutation(desired))).getOrThrow()
                val saved = repository.getEventEditor(eventId).getOrThrow()
                assertEquals("Organizer current name", saved.canonicalState.event.name)
                assertEquals(original.event.organizationId, saved.canonicalState.event.organizationId)
                assertEquals(bookedSlot, saved.canonicalState.timeSlots.first { it.id == bookedSlot.id })
                assertEquals(opened.snapshot.draft.resources.rentalBookingId, saved.snapshot.draft.resources.rentalBookingId)
                val cachedBefore = repository.getCachedEventWithRelationsFlow(eventId).first().getOrThrow()
                for (invalid in listOf(
                    saved.canonicalState.copy(event = saved.canonicalState.event.copy(organizationId = "conflicting-organization")),
                    saved.canonicalState.copy(timeSlots = saved.canonicalState.timeSlots.filterNot { it.id == bookedSlot.id }),
                    saved.canonicalState.copy(timeSlots = saved.canonicalState.timeSlots.map {
                        if (it.id == bookedSlot.id) it.copy(startTimeMinutes = 570) else it
                    }),
                )) {
                    val failure = repository.saveEventEditor(eventId, EventEditorSessionMapper.toSaveCommand(saved, EventEditorMutation(invalid))).exceptionOrNull()
                    val apiFailure = kotlin.test.assertIs<EventEditorApiException>(failure)
                    assertEquals("EDITOR_IMMUTABLE_FIELD", apiFailure.payload?.code)
                    assertEquals(cachedBefore, repository.getCachedEventWithRelationsFlow(eventId).first().getOrThrow())
                }
                http.close()
                val offline = repository.getCachedEventWithRelationsFlow(eventId).first().getOrThrow()
                assertEquals(cachedBefore, offline)
                assertEquals(setOf(bookedSlot.id, slot.id), offline.event.timeSlotIds.toSet())
            } finally {
                repository.close()
                http.close()
                database.close()
            }
        }
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = RuntimeEnvironment.getApplication().applicationContext as Context
    }

    @After
    fun tearDown() {
        // Room in-memory databases are closed by each test. The application context remains shared
        // across Robolectric tests, so no file cleanup is required.
    }

    @Test
    fun given_unclaimed_event_when_restarted_then_authority_persists() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val databaseName = "i49.db"
            fun openDatabase() = Room.databaseBuilder<MVPDatabaseService>(context, databaseName).allowMainThreadQueries().build()
            var database = openDatabase()
            var offline = false
            var remoteEvent = fixture.eventResponse.copy(
                state = "PUBLISHED",
                affiliateUrl = "https://partner.example/register",
                hostId = null,
                sourceType = "AFFILIATE_IMPORT", sourceId = "source-1", sourceUrl = "https://source.example/event",
                capabilities = EventAuthorityCapabilities(readOnlyReason = "MANAGEMENT_AUTHORITY_UNVERIFIED"),
            )
            val http = HttpClient(MockEngine { request ->
                check(!offline) { "Offline access must use Room." }
                if (request.url.encodedPath.endsWith("/participants")) {
                    val partialEvent = remoteEvent.copy(
                        affiliateUrl = null, sourceType = null, sourceId = null, sourceUrl = null, capabilities = null,
                    )
                    respondJson(jsonMVP.encodeToString(EventParticipantsSnapshotResponseDto(event = partialEvent)), HttpStatusCode.OK)
                } else respondJson(jsonMVP.encodeToString(EventDetailBootstrapResponseDto(
                    event = remoteEvent, capabilities = remoteEvent.capabilities,
                )), HttpStatusCode.OK)
            }) { configureMvpHttpClient() }
            fun openRepository() = eventRepositoryRoomPersistenceRepository(
                EventRepositoryRoomPersistence_NoStartupCleanupDatabase(database), http,
                UnconfinedTestDispatcher(testScheduler),
            )
            var repository = openRepository()
            try {
                for (type in EventType.entries) {
                    offline = false
                    remoteEvent = remoteEvent.copy(eventType = type.name, capabilities = EventAuthorityCapabilities(
                        viewerUserId = "host-1", canEdit = true, readOnly = false,
                        organizationOwnershipStatus = "CLAIMED",
                        managementAuthority = com.razumly.mvp.core.data.dataTypes.EventManagementAuthority("ORGANIZATION", "org-1", "host-1"),
                    ))
                    repository.syncEventDetail(Event(id = fixture.eventId), null, false).getOrThrow()
                    val claimed = repository.getCachedEventWithRelationsFlow(fixture.eventId).first().getOrThrow().event
                    assertEquals("CLAIMED", claimed.capabilities?.organizationOwnershipStatus)
                    assertEquals("host-1", claimed.capabilities?.managementAuthority?.ownerUserId)
                    remoteEvent = remoteEvent.copy(capabilities = EventAuthorityCapabilities(
                        viewerUserId = "host-1", readOnlyReason = "MANAGEMENT_AUTHORITY_UNVERIFIED",
                        organizationOwnershipStatus = "UNCLAIMED",
                    ))
                    repository.syncEventDetail(Event(id = fixture.eventId), null, false).getOrThrow()
                    val refreshed = repository.getCachedEventWithRelationsFlow(fixture.eventId).first().getOrThrow().event
                    repository.syncEventParticipants(refreshed, null).getOrThrow()
                    offline = true
                    repository.close()
                    database.close()
                    database = openDatabase()
                    repository = openRepository()
                    val cached = repository.getCachedEventWithRelationsFlow(fixture.eventId).first().getOrThrow().event
                    assertEquals(type, cached.eventType)
                    assertEquals("PUBLISHED", cached.state)
                    assertTrue(cached.isAffiliateEvent())
                    assertEquals("AFFILIATE_IMPORT", cached.sourceType)
                    assertEquals("source-1", cached.sourceId)
                    assertEquals("https://source.example/event", cached.sourceUrl)
                    assertTrue(assertNotNull(cached.capabilities).readOnly)
                    assertEquals("UNCLAIMED", cached.capabilities?.organizationOwnershipStatus)
                    assertNull(cached.capabilities?.managementAuthority)
                    assertFalse(cached.capabilities!!.canEditFor("host-1"))
                }
            } finally {
                repository.close()
                http.close()
                database.close()
                context.deleteDatabase(databaseName)
            }
        }

    @Test
    fun given_live_site_when_registration_destination_changes_then_api_and_room_preserve_the_event() =
        kotlinx.coroutines.test.runTest(timeout = kotlin.time.Duration.parse("5m")) {
            val issue = if (System.getenv("MVP_ISSUE49_API_URL").isNullOrBlank()) "48" else "49"
            val apiUrl = System.getenv("MVP_ISSUE${issue}_API_URL").orEmpty()
            val eventIds = System.getenv("MVP_ISSUE${issue}_EVENT_IDS").orEmpty().split(',').filter(String::isNotBlank)
            val token = System.getenv("MVP_ISSUE${issue}_TOKEN").orEmpty()
            org.junit.Assume.assumeTrue("Live API fixtures are not configured.", apiUrl.isNotBlank() && eventIds.isNotEmpty() && token.isNotBlank())
            require(java.net.URI(apiUrl).host in setOf("localhost", "127.0.0.1")) { "Use a local issue database and API." }
            require(eventIds.size == EventType.entries.size && eventIds.all { it.startsWith("issue-$issue-") })
            val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context).allowMainThreadQueries().build()
            val http = HttpClient { configureMvpHttpClient() }
            val tokens = mockk<AuthTokenStore>()
            coEvery { tokens.get() } returns token
            val repository = eventRepositoryRoomPersistenceRepository(
                EventRepositoryRoomPersistence_NoStartupCleanupDatabase(database), http,
                UnconfinedTestDispatcher(testScheduler),
                api = MvpApiClient(http, apiUrl, tokens),
            )
            val eventTypes = mutableSetOf<EventType>()
            try {
                for (eventId in eventIds) {
                    val original = repository.getEventEditor(eventId).getOrThrow()
                    val originalUrl = original.canonicalState.event.affiliateUrl
                    eventTypes += original.canonicalState.event.eventType
                    val before = repository.getCachedEventWithRelationsFlow(eventId).first().getOrThrow().event
                    assertTrue(assertNotNull(before.capabilities).canEdit)
                    if (issue == "49") assertEquals("CLAIMED", before.capabilities?.organizationOwnershipStatus)
                    try {
                        for (destination in listOf("http://new-organizer.example/register", "https://new-organizer.example/register", null, originalUrl)) {
                            val session = repository.getEventEditor(eventId).getOrThrow()
                            val desired = session.canonicalState.copy(event = session.canonicalState.event.copy(affiliateUrl = destination))
                            repository.saveEventEditor(eventId, EventEditorSessionMapper.toSaveCommand(session, EventEditorMutation(desired))).getOrThrow()
                            val reloaded = repository.getEventEditor(eventId).getOrThrow()
                            val after = repository.getCachedEventWithRelationsFlow(eventId).first().getOrThrow().event
                            assertEquals(destination.orEmpty(), reloaded.snapshot.draft.basics.affiliateUrl)
                            assertEquals(before.id, after.id)
                            assertEquals(before.eventType, after.eventType)
                            assertEquals(before.sourceType, after.sourceType)
                            assertEquals(before.sourceId, after.sourceId)
                            assertEquals(before.sourceUrl, after.sourceUrl)
                            assertEquals(before.capabilities, after.capabilities)
                            assertEquals(original.snapshot.draft.schedule, reloaded.snapshot.draft.schedule)
                            assertEquals(original.snapshot.draft.competition, reloaded.snapshot.draft.competition)
                            assertEquals(original.snapshot.draft.resources, reloaded.snapshot.draft.resources)
                            assertEquals(original.snapshot.draft.staff, reloaded.snapshot.draft.staff)
                        }
                    } finally {
                        val session = repository.getEventEditor(eventId).getOrThrow()
                        if (session.canonicalState.event.affiliateUrl != originalUrl) {
                            val restored = session.canonicalState.copy(event = session.canonicalState.event.copy(affiliateUrl = originalUrl))
                            repository.saveEventEditor(eventId, EventEditorSessionMapper.toSaveCommand(session, EventEditorMutation(restored))).getOrThrow()
                        }
                    }
                }
                assertEquals(EventType.entries.toSet(), eventTypes)
                if (issue == "49") {
                    val unclaimedId = System.getenv("MVP_ISSUE49_UNCLAIMED_EVENT_ID").orEmpty()
                    require(unclaimedId.startsWith("issue-49-"))
                    repository.syncEventDetail(Event(id = unclaimedId), null, false).getOrThrow()
                    val unclaimed = repository.getCachedEventWithRelationsFlow(unclaimedId).first().getOrThrow().event
                    assertEquals("UNCLAIMED", unclaimed.capabilities?.organizationOwnershipStatus)
                    assertEquals("MANAGEMENT_AUTHORITY_UNVERIFIED", unclaimed.capabilities?.readOnlyReason)
                    assertEquals(false, unclaimed.capabilities?.canEdit)
                    assertEquals("AFFILIATE_IMPORT", unclaimed.sourceType)
                    assertNull(unclaimed.sourceId)
                    assertNull(unclaimed.sourceUrl)
                    assertTrue(unclaimed.affiliateUrl.orEmpty().contains("/out/event/$unclaimedId/"))
                    assertTrue(unclaimed.isAffiliateEvent())
                    assertEquals("PUBLISHED", unclaimed.state)
                    val deniedSession = repository.getEventEditor(unclaimedId).getOrThrow()
                    assertFalse(deniedSession.snapshot.capabilities.canEdit)
                    val deniedChange = deniedSession.canonicalState.copy(
                        event = deniedSession.canonicalState.event.copy(affiliateUrl = "https://new-organizer.example/join"),
                    )
                    assertTrue(repository.saveEventEditor(unclaimedId,
                        EventEditorSessionMapper.toSaveCommand(deniedSession, EventEditorMutation(deniedChange))).isFailure)
                    val afterDeniedSave = repository.getCachedEventWithRelationsFlow(unclaimedId).first().getOrThrow().event
                    assertEquals(deniedSession.canonicalState.event.affiliateUrl, afterDeniedSave.affiliateUrl)
                    assertFalse(afterDeniedSave.capabilities!!.canEdit)
                    http.close()
                    assertEquals(afterDeniedSave, repository.getCachedEventWithRelationsFlow(unclaimedId).first().getOrThrow().event)
                }
            } finally {
                repository.close()
                http.close()
                database.close()
            }
        }

    @Test
    fun given_each_event_type_when_registration_changes_then_site_and_room_preserve_identity_and_operations() =
        kotlinx.coroutines.test.runTest(timeout = kotlin.time.Duration.parse("5m")) {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val site = clientContractSiteDirectory()
            val sharedDraft = jsonMVP.decodeFromString<EventEditorDraftDto>(
                File(site.parentFile.parentFile, "test-fixtures/event-editor/staffing-priority-draft.json").readText(),
            )
            for (type in EventType.entries) {
                var snapshot = fixture.saved.snapshot.copy(
                    mode = "EDIT",
                    draft = sharedDraft.copy(basics = sharedDraft.basics.copy(
                        eventType = type.name, affiliateUrl = "https://partner.example/register",
                    ), schedule = sharedDraft.schedule.copy(
                        isAutomatedScheduling = type != EventType.EVENT && type != EventType.TRYOUT,
                    )),
                    provenance = EventProvenanceDto("AFFILIATE_IMPORT", "source-1", "https://source.example/event"),
                    capabilities = fixture.saved.snapshot.capabilities.copy(
                        viewerUserId = "owner-1", canEdit = true, canManageStaff = true, readOnly = false,
                        managementAuthority = EventManagementAuthority("ORGANIZATION", "org-1", "owner-1"),
                    ),
                )
                val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context).allowMainThreadQueries().build()
                var offline = false
                val http = HttpClient(MockEngine { request ->
                    check(!offline) { "Offline access must use Room." }
                    when (request.method) {
                        HttpMethod.Get -> respondJson(jsonMVP.encodeToString(snapshot), HttpStatusCode.OK)
                        HttpMethod.Put -> {
                            val body = (request.body as io.ktor.http.content.OutgoingContent.ByteArrayContent).bytes().decodeToString()
                            val command = jsonMVP.decodeFromString<EventEditorSaveCommandDto>(body)
                            val result = jsonMVP.parseToJsonElement(runSiteContract(
                                site, "scripts/test-external-registration-contract.ts",
                                jsonMVP.encodeToString(JsonObject(mapOf(
                                    "before" to com.razumly.mvp.core.network.dto.encodeEventEditorSaveCommand(
                                        command.copy(draft = snapshot.draft),
                                    ).getValue("draft"),
                                    "command" to jsonMVP.parseToJsonElement(body),
                                    "affiliateUrl" to kotlinx.serialization.json.JsonPrimitive(command.draft.basics.affiliateUrl),
                                ))),
                            )).jsonObject
                            snapshot = snapshot.copy(draft = jsonMVP.decodeFromJsonElement(EventEditorDraftDto.serializer(), result.getValue("draft")))
                            respondJson(jsonMVP.encodeToString(fixture.saved.copy(
                                snapshot = snapshot, graph = null,
                                scheduleOutcome = fixture.saved.scheduleOutcome.copy(
                                    status = EventEditorScheduleOutcomeStatus.NOT_REQUESTED, matches = emptyList(),
                                ),
                            )), HttpStatusCode.OK)
                        }
                        else -> error("Unexpected request ${request.method}")
                    }
                }) { configureMvpHttpClient() }
                val repository = eventRepositoryRoomPersistenceRepository(
                    EventRepositoryRoomPersistence_NoStartupCleanupDatabase(database), http,
                    UnconfinedTestDispatcher(testScheduler),
                )
                try {
                    repository.getEventEditor(fixture.eventId).getOrThrow()
                    val baseline = repository.getCachedEventWithRelationsFlow(fixture.eventId).first().getOrThrow().event
                    for (destination in listOf("https://new-partner.example/register", "", "https://partner.example/register")) {
                        offline = false
                        val opened = repository.getEventEditor(fixture.eventId).getOrThrow()
                        val desired = opened.canonicalState.copy(event = opened.canonicalState.event.copy(
                            affiliateUrl = destination.takeIf(String::isNotBlank),
                            name = if (destination.contains("new-partner")) opened.canonicalState.event.name + " Updated" else opened.canonicalState.event.name,
                        ))
                        val command = EventEditorSessionMapper.toSaveCommand(opened, EventEditorMutation(desired))
                        repository.saveEventEditor(fixture.eventId, command).getOrThrow()
                        val reloaded = repository.getEventEditor(fixture.eventId).getOrThrow().canonicalState.event
                        offline = true
                        val cached = repository.getCachedEventWithRelationsFlow(fixture.eventId).first().getOrThrow().event
                        assertEquals(baseline.id, cached.id)
                        assertEquals(type, cached.eventType)
                        assertEquals(destination.isNotBlank(), cached.isAffiliateEvent())
                        assertEquals(baseline.sourceType, cached.sourceType)
                        assertEquals(baseline.sourceId, cached.sourceId)
                        assertEquals(baseline.sourceUrl, cached.sourceUrl)
                        assertEquals(baseline.capabilities, cached.capabilities)
                        assertEquals(baseline.fieldIds, cached.fieldIds)
                        assertEquals(baseline.timeSlotIds, cached.timeSlotIds)
                        assertEquals(baseline.divisionDetails, cached.divisionDetails)
                        assertEquals(baseline.officialPositions, cached.officialPositions)
                        assertEquals(baseline.doTeamsOfficiate, cached.doTeamsOfficiate)
                        assertEquals(reloaded.affiliateUrl, cached.affiliateUrl)
                    }
                } finally {
                    repository.close()
                    http.close()
                    database.close()
                }
            }
        }

    @Test
    fun given_all_five_priorities_when_saved_reloaded_and_read_offline_then_site_and_room_preserve_the_officiating_plan() =
        kotlinx.coroutines.test.runTest(timeout = kotlin.time.Duration.parse("5m")) {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val site = clientContractSiteDirectory()
            val sharedDraft = jsonMVP.decodeFromString<EventEditorDraftDto>(
                File(site.parentFile.parentFile, "test-fixtures/event-editor/staffing-priority-draft.json").readText(),
            )
            val priorities = com.razumly.mvp.core.data.dataTypes.StaffingPriority.entries
            for ((priorityIndex, priority) in priorities.withIndex()) {
                for (configuration in 0..3) {
                    val hasTeamDuties = configuration >= 2
                    val hasPositions = configuration % 2 == 1
                    val initialDraft = sharedDraft.copy(staff = sharedDraft.staff.copy(
                        doTeamsOfficiate = hasTeamDuties,
                        teamOfficialsMaySwap = hasTeamDuties,
                        officialPositions = if (hasPositions) sharedDraft.staff.officialPositions else emptyList(),
                        eventOfficials = if (hasPositions) sharedDraft.staff.eventOfficials else emptyList(),
                        officialIds = if (hasPositions) sharedDraft.staff.officialIds else emptyList(),
                    ))
                    var snapshot = fixture.saved.snapshot.copy(mode = "EDIT", draft = initialDraft)
                    val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context).allowMainThreadQueries().build()
                    var isOffline = false
                    val http = HttpClient(MockEngine { request ->
                        check(!isOffline) { "The offline read must use Room." }
                        when (request.method) {
                            HttpMethod.Get -> respondJson(jsonMVP.encodeToString(snapshot), HttpStatusCode.OK)
                            HttpMethod.Put -> {
                                val body = (request.body as io.ktor.http.content.OutgoingContent.ByteArrayContent)
                                    .bytes().decodeToString()
                                assertFalse(body.contains("officialSchedulingMode"))
                                val result = staffingClientToSiteResult(site, priorityIndex * 4 + configuration, body)
                                val returnedDraft = jsonMVP.decodeFromJsonElement(EventEditorDraftDto.serializer(), result.getValue("draft"))
                                assertEquals(priority.name, returnedDraft.staff.staffingPriority)
                                assertEquals(initialDraft.staff.copy(staffingPriority = priority.name), returnedDraft.staff)
                                snapshot = snapshot.copy(draft = returnedDraft)
                                respondJson(jsonMVP.encodeToString(fixture.saved.copy(
                                    snapshot = snapshot,
                                    graph = null,
                                    scheduleOutcome = fixture.saved.scheduleOutcome.copy(
                                        status = EventEditorScheduleOutcomeStatus.NOT_REQUESTED, matches = emptyList(),
                                    ),
                                )), HttpStatusCode.OK)
                            }
                            else -> error("Unexpected request ${request.method}")
                        }
                    }) { configureMvpHttpClient() }
                    val repository = eventRepositoryRoomPersistenceRepository(
                        EventRepositoryRoomPersistence_NoStartupCleanupDatabase(database), http,
                        UnconfinedTestDispatcher(testScheduler),
                    )
                    try {
                        val opened = repository.getEventEditor(fixture.eventId).getOrThrow()
                        val selected = opened.canonicalState.copy(event = opened.canonicalState.event.copy(staffingPriority = priority))
                        val command = EventEditorSessionMapper.toSaveCommand(opened, EventEditorMutation(selected))
                        val saved = repository.saveEventEditor(fixture.eventId, command).getOrThrow()
                        assertEquals(priority, saved.session.canonicalState.event.staffingPriority)
                        val reloaded = repository.getEventEditor(fixture.eventId).getOrThrow().canonicalState.event
                        assertEquals(priority, reloaded.staffingPriority)
                        isOffline = true
                        val cached = repository.getCachedEventWithRelationsFlow(fixture.eventId).first().getOrThrow().event
                        assertEquals(priority, cached.staffingPriority)
                        assertEquals(hasTeamDuties, cached.doTeamsOfficiate)
                        assertEquals(hasTeamDuties, cached.teamOfficialsMaySwap)
                        assertEquals(if (hasPositions) listOf("Referee", "Line Judge") else emptyList(), cached.officialPositions.map { it.name })
                        assertEquals(if (hasPositions) listOf("r1") else emptyList(), cached.eventOfficials.flatMap { it.positionIds })
                    } finally {
                        repository.close()
                        http.close()
                        database.close()
                    }
                }
            }
        }

    @Test
    fun stale_event_projection_preserves_cached_locks_inside_room_transaction() =
        kotlinx.coroutines.test.runTest {
            val realDatabase = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            var transactionCount = 0
            val database = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(
                delegate = realDatabase,
                onTransaction = { transactionCount += 1 },
            )
            val store = EventRoomStore(database)
            val eventId = "event-room-lock-merge"
            val lockedEvent = Event(
                id = eventId,
                eventType = EventType.LEAGUE,
                eventTypeLocked = true,
                registrationUnitLocked = true,
                eventTypeHasProtectedHistory = true,
            )
            val staleEvent = lockedEvent.copy(
                eventTypeLocked = false,
                registrationUnitLocked = false,
                eventTypeHasProtectedHistory = false,
            )
            try {
                store.cacheEvent(lockedEvent)
                val persisted = store.cacheAndReadEvent(staleEvent, eventId)

                assertEquals(2, transactionCount)
                assertTrue(persisted.eventTypeLocked)
                assertTrue(persisted.registrationUnitLocked)
                assertTrue(persisted.eventTypeHasProtectedHistory)
                assertEquals(persisted, realDatabase.getEventDao.getEventById(eventId))
            } finally {
                realDatabase.close()
            }
        }

    @Test
    fun given_direct_saved_tournament_graph_when_room_persists_then_generated_phase_rows_exist_before_refresh() = kotlinx.coroutines.test.runTest {
        val fixture = eventRepositoryRoomPersistenceTournamentFixture()
        val canonicalField = fixture.draft.resources.fields.single().copy(
            name = "Canonical Tournament Court",
            location = "Canonical Court Location",
            address = "Canonical Court Address",
            sportIds = listOf("Indoor Volleyball", "Beach Volleyball"),
            organizationId = "canonical-organization",
            facilityId = "canonical-facility",
        )
        val canonicalTimeSlot = fixture.draft.resources.timeSlots.single().copy(
            timeZone = "America/New_York",
            requiredTemplateIds = listOf("slot-template"),
            hostRequiredTemplateIds = listOf("host-slot-template"),
            sourceType = "CANONICAL",
            rentalBookingId = "booking-slot",
            rentalBookingItemId = "booking-item-slot",
            rentalLocked = true,
        )
        val canonicalDraft = fixture.draft.copy(
            resources = fixture.draft.resources.copy(
                fields = listOf(canonicalField),
                timeSlots = listOf(canonicalTimeSlot),
                requiredTemplateIds = listOf("event-template"),
            ),
        )
        val savedGraph = requireNotNull(fixture.saved.graph)
        val unplacedMatch = savedGraph.matches.single().copy(
            start = null,
            end = null,
            placementState = "UNPLACED",
            fieldId = null,
            officialId = null,
            officialIds = emptyList(),
            officialAssignments = emptyList(),
            teamOfficialId = null,
        )
        val narrowGraph = savedGraph.copy(
            event = savedGraph.event.copy(
                fields = listOf(
                    Field(
                        id = fixture.fieldId,
                        divisions = listOf("division-open", fixture.phaseDivisionId),
                        name = "Graph Projection",
                    ),
                ),
                timeSlots = listOf(
                    savedGraph.event.timeSlots.single().copy(
                        timeZone = "UTC",
                        requiredTemplateIds = emptyList(),
                        hostRequiredTemplateIds = emptyList(),
                        sourceType = null,
                        rentalBookingId = null,
                        rentalBookingItemId = null,
                        rentalLocked = null,
                    ),
                ),
            ),
            matches = listOf(unplacedMatch),
        )
        val unplacedProjection = fixture.saved.scheduleOutcome.matches.single().copy(
            start = null,
            end = null,
            placementState = "UNPLACED",
            fieldId = null,
            officialId = null,
            officialIds = emptyList(),
            teamOfficialId = null,
        )
        val directScheduleOutcome = fixture.saved.scheduleOutcome.copy(
            status = EventEditorScheduleOutcomeStatus.NOT_REQUESTED,
            matches = listOf(unplacedProjection),
        )
        val saved = fixture.saved.copy(
            snapshot = fixture.saved.snapshot.copy(draft = canonicalDraft),
            scheduleOutcome = directScheduleOutcome,
            graph = narrowGraph,
        )
        val directCommand = fixture.command.copy(
            draft = canonicalDraft,
            completion = EventEditorCreateCompletionDto(EventEditorCreateCompletionMode.CREATE_ONLY),
        )
        assertEquals(
            EventEditorCreateCompletionMode.CREATE_ONLY,
            directCommand.completion.mode,
        )
        assertFalse(
            directCommand.draft.competition.divisionIds.contains(fixture.phaseDivisionId),
        )
        assertFalse(
            directCommand.draft.resources.timeSlots
                .flatMap { slot -> slot.divisions }
                .contains(fixture.phaseDivisionId),
        )
        assertTrue(
            saved.graph?.event?.divisionDetails
                ?.any { detail -> detail.id == fixture.phaseDivisionId } == true,
        )
        val roomDatabase = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
            .allowMainThreadQueries()
            .build()
        val database = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(roomDatabase)
        var editorRequestCount = 0
        val engine = MockEngine { request ->
            assertEquals("/api/events/editor", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            editorRequestCount += 1
            respondJson(jsonMVP.encodeToString(saved), HttpStatusCode.Created)
        }
        val http = HttpClient(engine) { configureMvpHttpClient() }
        val repository = eventRepositoryRoomPersistenceRepository(
            database = database,
            http = http,
            coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
        )
        try {
            val outcome = repository.createEventEditor(directCommand).getOrThrow()
            val observedBeforeRefresh =
                repository.getCachedEventWithRelationsFlow(fixture.eventId).first().getOrThrow()

            val persistedEvent = database.getEventDao.getEventById(fixture.eventId)
            val persistedFields = database.getFieldDao.getFieldsByIds(listOf(fixture.fieldId))
            val persistedSlots = database.getEventTimeSlotDao.getTimeSlotsByEventId(fixture.eventId)
            val persistedMatches = database.getMatchDao.getMatchesOfTournament(fixture.eventId)
            val phaseDetail = persistedEvent?.divisionDetails
                ?.firstOrNull { detail ->
                    detail.id.normalizeDivisionIdentifier() ==
                        fixture.phaseDivisionId.normalizeDivisionIdentifier()
                }

            assertEquals(1, editorRequestCount)
            assertNull(outcome.proposal)
            assertEquals(fixture.eventId, outcome.session.canonicalState.event.id)
            assertEquals(EventType.TOURNAMENT, persistedEvent?.eventType)
            assertNotNull(phaseDetail)
            assertEquals(
                "division-open".normalizeDivisionIdentifier(),
                phaseDetail.sourceDivisionId?.normalizeDivisionIdentifier(),
            )
            assertEquals(
                EventEditorScheduleOutcomeStatus.NOT_REQUESTED,
                outcome.scheduleOutcome.status,
            )
            assertEquals(1, outcome.scheduleOutcome.matchCount)
            val outcomeMatch = outcome.scheduleOutcome.matches.single()
            assertNull(outcomeMatch.fieldId)
            assertNull(outcomeMatch.start)
            assertNull(outcomeMatch.end)
            assertEquals("UNPLACED", outcomeMatch.placementState)
            assertNull(outcomeMatch.officialId)
            assertTrue(outcomeMatch.officialIds.isEmpty())
            assertNull(outcomeMatch.teamOfficialId)
            assertEquals(
                setOf("division-open", fixture.phaseDivisionId)
                    .map(String::normalizeDivisionIdentifier)
                    .toSet(),
                persistedEvent?.divisions
                    ?.map(String::normalizeDivisionIdentifier)
                    ?.toSet(),
            )

            assertEquals(1, persistedMatches.size)
            val persistedMatch = persistedMatches.single()
            assertEquals(fixture.phaseDivisionId, persistedMatch.phaseDivisionId)
            assertEquals(fixture.phaseDivisionId, persistedMatch.division)
            assertNull(persistedMatch.fieldId)
            assertNull(persistedMatch.start)
            assertNull(persistedMatch.end)
            assertEquals("UNPLACED", persistedMatch.placementState)
            assertNull(persistedMatch.officialId)
            assertTrue(persistedMatch.officialIds.isEmpty())
            assertNull(persistedMatch.teamOfficialId)
            assertEquals(listOf(fixture.fieldId), persistedEvent?.fieldIds)
            assertEquals(listOf(fixture.timeSlotId), persistedEvent?.timeSlotIds)
            assertEquals(listOf(fixture.fieldId), persistedFields.map(Field::id))
            assertTrue(
                persistedFields.single().divisions
                    .map(String::normalizeDivisionIdentifier)
                    .contains(fixture.phaseDivisionId.normalizeDivisionIdentifier()),
            )
            assertEquals(1, outcome.session.canonicalState.timeSlots.size)
            assertEquals(listOf(fixture.timeSlotId), persistedSlots.map { it.slotId })
            assertTrue(
                persistedSlots.single().divisions.orEmpty()
                    .map(String::normalizeDivisionIdentifier)
                    .contains(fixture.phaseDivisionId.normalizeDivisionIdentifier()),
            )
            assertEquals(
                listOf("event-template"),
                outcome.session.canonicalState.event.requiredTemplateIds,
            )
            assertEquals(
                "Canonical Court Location",
                persistedFields.single().location,
            )
            assertEquals(
                listOf("Indoor Volleyball", "Beach Volleyball"),
                persistedFields.single().sportIds,
            )
            assertEquals("canonical-organization", persistedFields.single().organizationId)
            assertEquals("canonical-facility", persistedFields.single().facilityId)
            assertEquals(
                "Canonical Court Location",
                outcome.session.canonicalState.fields.single().location,
            )
            assertEquals(
                listOf("Indoor Volleyball", "Beach Volleyball"),
                outcome.session.canonicalState.fields.single().sportIds,
            )
            assertEquals(
                "America/New_York",
                outcome.session.canonicalState.timeSlots.single().timeZone,
            )
            assertEquals(
                listOf("slot-template"),
                outcome.session.canonicalState.timeSlots.single().requiredTemplateIds,
            )
            assertEquals(
                listOf("host-slot-template"),
                outcome.session.canonicalState.timeSlots.single().hostRequiredTemplateIds,
            )
            assertEquals("CANONICAL", outcome.session.canonicalState.timeSlots.single().sourceType)
            assertEquals(
                "booking-slot",
                outcome.session.canonicalState.timeSlots.single().rentalBookingId,
            )
            assertEquals(
                "booking-item-slot",
                outcome.session.canonicalState.timeSlots.single().rentalBookingItemId,
            )
            assertTrue(outcome.session.canonicalState.timeSlots.single().rentalLocked == true)
            assertEquals(
                outcome.session.canonicalState.fields,
                outcome.session.baseline.fields,
            )
            assertEquals(
                outcome.session.canonicalState.timeSlots,
                outcome.session.baseline.timeSlots,
            )
            assertEquals("America/New_York", persistedSlots.single().timeZone)
            assertEquals(listOf("slot-template"), persistedSlots.single().requiredTemplateIds)
            assertEquals(
                listOf("host-slot-template"),
                persistedSlots.single().hostRequiredTemplateIds,
            )
            assertEquals("CANONICAL", persistedSlots.single().sourceType)
            assertEquals(persistedEvent, observedBeforeRefresh.event)
            assertEquals(persistedSlots, observedBeforeRefresh.timeSlotCacheEntries)
            assertEquals("booking-slot", persistedSlots.single().rentalBookingId)
            assertEquals("booking-item-slot", persistedSlots.single().rentalBookingItemId)
            assertTrue(persistedSlots.single().rentalLocked == true)
        } finally {
            repository.close()
            http.close()
            roomDatabase.close()
        }
    }

    @Test
    fun given_maintenance_draft_save_when_local_persistence_is_disabled_then_room_is_unchanged() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val realDatabase = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            val existingEvent = requireNotNull(
                fixture.eventResponse.toEventOrNull(requireOwnerIdentity = false),
            )
            realDatabase.getEventDao.upsertEvent(existingEvent)
            var transactionCount = 0
            val database = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(
                delegate = realDatabase,
                onTransaction = { transactionCount += 1 },
            )
            val engine = MockEngine { request ->
                assertEquals("/api/events/${fixture.eventId}/editor", request.url.encodedPath)
                assertEquals(HttpMethod.Put, request.method)
                respondJson(jsonMVP.encodeToString(fixture.saved), HttpStatusCode.Created)
            }
            val http = HttpClient(engine) { configureMvpHttpClient() }
            val repository = eventRepositoryRoomPersistenceRepository(
                database = database,
                http = http,
                coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
            )
            val snapshot = fixture.saved.snapshot
            val command = EventEditorSaveCommandDto(
                contractVersion = snapshot.contractVersion,
                editorRevision = snapshot.editorRevision,
                staffRevision = snapshot.staffRevision,
                draft = snapshot.draft,
                scheduleTransition = EventEditorSaveScheduleTransitionDto(
                    mode = EventEditorScheduleTransitionMode.PRESERVE,
                ),
            )

            try {
                val outcome = repository.saveEventEditor(
                    eventId = fixture.eventId,
                    command = command,
                    persistLocally = false,
                ).getOrThrow()

                assertEquals(fixture.eventId, outcome.session.canonicalState.event.id)
                val persistedEvent = requireNotNull(
                    realDatabase.getEventDao.getEventById(fixture.eventId),
                )
                assertEquals(existingEvent.id, persistedEvent.id)
                assertEquals(existingEvent.name, persistedEvent.name)
                assertEquals(existingEvent.end, persistedEvent.end)
                assertEquals(0, transactionCount)
            } finally {
                repository.close()
                http.close()
                realDatabase.close()
            }
        }

    @Test
    fun given_accepted_graph_when_tournament_detail_get_omits_generated_rows_then_room_keeps_graph() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val narrowEventResponse = fixture.eventResponse.copy(
                divisions = listOf("division-open"),
                divisionDetails = fixture.eventResponse.divisionDetails.orEmpty().filter { detail ->
                    detail.id.normalizeDivisionIdentifier() == "division-open".normalizeDivisionIdentifier()
                },
            )
            val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            var editorRequestCount = 0
            var refreshRequestCount = 0
            val engine = MockEngine { request ->
                when {
                    request.url.encodedPath == "/api/events/editor" &&
                        request.method == HttpMethod.Post -> {
                        editorRequestCount += 1
                        respondJson(jsonMVP.encodeToString(fixture.proposal), HttpStatusCode.Accepted)
                    }
                    request.url.encodedPath == "/api/events/editor" &&
                        request.method == HttpMethod.Put -> {
                        editorRequestCount += 1
                        respondJson(jsonMVP.encodeToString(fixture.saved), HttpStatusCode.Created)
                    }
                    request.url.encodedPath == "/api/events/${fixture.eventId}" &&
                        request.method == HttpMethod.Get -> {
                        refreshRequestCount += 1
                        respondJson(
                            jsonMVP.encodeToString(narrowEventResponse),
                            HttpStatusCode.OK,
                        )
                    }
                    else -> error("Unexpected request ${request.method} ${request.url.encodedPath}")
                }
            }
            val http = HttpClient(engine) { configureMvpHttpClient() }
            val repository = eventRepositoryRoomPersistenceRepository(
                database = database,
                http = http,
                coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
            )
            try {
                repository.createEventEditor(fixture.command).getOrThrow()
                repository.acceptEventEditorProposal(
                    createOperationId = fixture.command.createOperationId,
                    proposalRevision = fixture.proposal.proposalRevision,
                    draft = fixture.draft,
                ).getOrThrow()
                val acceptedBeforeRefresh = requireNotNull(
                    database.getEventDao.getEventById(fixture.eventId),
                )
                val expectedDivisionIds = acceptedBeforeRefresh.divisions
                    .map(String::normalizeDivisionIdentifier)
                    .toSet()
                val expectedDivisionDetailIds = acceptedBeforeRefresh.divisionDetails
                    .map(DivisionDetail::id)
                    .map(String::normalizeDivisionIdentifier)
                    .toSet()

                val refreshed = repository.getEvent(fixture.eventId).getOrThrow()
                val persistedAfterRefresh = requireNotNull(
                    database.getEventDao.getEventById(fixture.eventId),
                )

                assertEquals(2, editorRequestCount)
                assertEquals(1, refreshRequestCount)
                assertEquals(expectedDivisionIds, refreshed.divisions.map(String::normalizeDivisionIdentifier).toSet())
                assertEquals(
                    expectedDivisionDetailIds,
                    refreshed.divisionDetails
                        .map(DivisionDetail::id)
                        .map(String::normalizeDivisionIdentifier)
                        .toSet(),
                )
                assertEquals(expectedDivisionIds, persistedAfterRefresh.divisions.map(String::normalizeDivisionIdentifier).toSet())
                assertEquals(
                    expectedDivisionDetailIds,
                    persistedAfterRefresh.divisionDetails
                        .map(DivisionDetail::id)
                        .map(String::normalizeDivisionIdentifier)
                        .toSet(),
                )
                assertNotNull(
                    refreshed.divisionDetails.firstOrNull { detail ->
                        detail.id.normalizeDivisionIdentifier() ==
                            fixture.phaseDivisionId.normalizeDivisionIdentifier()
                    },
                )
            } finally {
                repository.close()
                http.close()
                database.close()
            }
        }


    @Test
    fun given_collapsed_editor_snapshot_when_opened_and_saved_then_room_keeps_tournament_graph_state() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val bracketDivisionId = "division-phase-room-bracket"
            val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            val databaseService = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(database)
            val seededEvent = requireNotNull(
                fixture.eventResponse.toEventOrNull(requireOwnerIdentity = false),
            )
            databaseService.getFieldDao.upsertFields(
                listOf(
                    fixture.eventResponse.fields.single().copy(
                        name = "Stale cached court",
                        location = "Stale cached location",
                        sportIds = listOf("Stale Sport"),
                    ),
                ),
            )
            val staleOpenDetail = seededEvent.divisionDetails
                .first { detail ->
                    detail.id.normalizeDivisionIdentifier() ==
                        "division-open".normalizeDivisionIdentifier()
                }
                .copy(name = "Stale cached open")
            val bracketDetail = seededEvent.divisionDetails
                .first { detail ->
                    detail.id.normalizeDivisionIdentifier() ==
                        fixture.phaseDivisionId.normalizeDivisionIdentifier()
                }
                .copy(
                    id = bracketDivisionId,
                    key = "open-bracket",
                    name = "Open Bracket Phase",
                    kind = "BRACKET",
                )
            val removedDivisionId = "division-removed-by-editor"
            val removedUserDetail = staleOpenDetail.copy(
                id = removedDivisionId,
                key = "removed-by-editor",
                name = "Stale removed user division",
                sourceDivisionId = null,
                kind = "LEAGUE",
                isSystemGenerated = false,
            )
            val acceptedEvent = seededEvent.copy(
                divisions = seededEvent.divisions + bracketDivisionId + removedDivisionId,
                divisionDetails = seededEvent.divisionDetails.map { detail ->
                    if (
                        detail.id.normalizeDivisionIdentifier() ==
                            "division-open".normalizeDivisionIdentifier()
                    ) {
                        staleOpenDetail
                    } else {
                        detail
                    }
                } + bracketDetail + removedUserDetail,
            )
            val acceptedTimeSlot = fixture.eventResponse.timeSlots
                .orEmpty()
                .single()
                .toTimeSlot(fixture.timeSlotId)
                .copy(
                    divisions = listOf(
                        "division-open",
                        fixture.phaseDivisionId,
                        bracketDivisionId,
                        removedDivisionId,
                    ),
                )
            databaseService.getEventDao.upsertEvent(acceptedEvent)
            databaseService.getMatchDao.upsertMatches(
                listOf(
                    requireNotNull(
                        requireNotNull(fixture.saved.graph)
                            .matches
                            .single()
                            .toMatchOrNull(),
                    ),
                ),
            )
            databaseService.getEventTimeSlotDao.upsertTimeSlots(
                listOf(
                    acceptedTimeSlot.toEventTimeSlotCacheEntry(
                        eventId = fixture.eventId,
                        position = 0,
                    ),
                ),
            )

            val openedSnapshot = fixture.saved.snapshot.copy(
                draft = fixture.saved.snapshot.draft.copy(
                    basics = fixture.saved.snapshot.draft.basics.copy(
                        name = "Edited while opening",
                    ),
                    competition = fixture.saved.snapshot.draft.competition.copy(
                        divisionDetails = fixture.saved.snapshot.draft.competition.divisionDetails.map {
                            detail -> detail.copy(name = "Edited open detail")
                        },
                    ),
                ),
            )
            val savedSnapshot = openedSnapshot.copy(
                draft = openedSnapshot.draft.copy(
                    basics = openedSnapshot.draft.basics.copy(
                        name = "Edited while saving",
                    ),
                    competition = openedSnapshot.draft.competition.copy(
                        divisionDetails = openedSnapshot.draft.competition.divisionDetails.map {
                            detail -> detail.copy(
                                name = "Edited saved detail",
                                fieldIds = emptyList(),
                            )
                        },
                        divisionFieldIds = mapOf("division-open" to emptyList()),
                    ),
                    resources = openedSnapshot.draft.resources.copy(
                        fields = openedSnapshot.draft.resources.fields.map { field ->
                            field.copy(
                                name = "Edited saved court",
                                location = "Edited saved location",
                                sportIds = listOf("Beach Volleyball"),
                            )
                        },
                        timeSlots = openedSnapshot.draft.resources.timeSlots.map { slot ->
                            slot.copy(timeZone = "America/Los_Angeles")
                        },
                    ),
                ),
            )
            val savedResult = fixture.saved.copy(
                snapshot = savedSnapshot,
                scheduleOutcome = fixture.saved.scheduleOutcome.copy(
                    status = EventEditorScheduleOutcomeStatus.NOT_REQUESTED,
                    matches = emptyList(),
                ),
                graph = null,
            )
            var openRequestCount = 0
            var saveRequestCount = 0
            val engine = MockEngine { request ->
                assertEquals(
                    "/api/events/${fixture.eventId}/editor",
                    request.url.encodedPath,
                )
                when (request.method) {
                    HttpMethod.Get -> {
                        openRequestCount += 1
                        respondJson(jsonMVP.encodeToString(openedSnapshot), HttpStatusCode.OK)
                    }
                    HttpMethod.Put -> {
                        saveRequestCount += 1
                        respondJson(jsonMVP.encodeToString(savedResult), HttpStatusCode.Created)
                    }
                    else -> error("Unexpected editor request ${request.method}")
                }
            }
            val http = HttpClient(engine) { configureMvpHttpClient() }
            val repository = eventRepositoryRoomPersistenceRepository(
                database = databaseService,
                http = http,
                coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
            )
            val expectedDivisionIds = setOf(
                "division-open",
                fixture.phaseDivisionId,
                bracketDivisionId,
            ).map(String::normalizeDivisionIdentifier).toSet()

            try {
                val opened = repository.getEventEditor(fixture.eventId).getOrThrow()
                val eventAfterOpen = requireNotNull(
                    database.getEventDao.getEventById(fixture.eventId),
                )
                assertEquals(1, openRequestCount)
                assertEquals(0, saveRequestCount)
                assertEquals("Edited while opening", eventAfterOpen.name)
                assertEquals(
                    expectedDivisionIds,
                    eventAfterOpen.divisions
                        .map(String::normalizeDivisionIdentifier)
                        .toSet(),
                )
                assertEquals(
                    expectedDivisionIds,
                    eventAfterOpen.divisionDetails
                        .map(DivisionDetail::id)
                        .map(String::normalizeDivisionIdentifier)
                        .toSet(),
                )
                assertEquals(
                    "Edited open detail",
                    eventAfterOpen.divisionDetails
                        .first { detail ->
                            detail.id.normalizeDivisionIdentifier() ==
                                "division-open".normalizeDivisionIdentifier()
                        }
                        .name,
                )
                assertEquals("Edited while opening", opened.canonicalState.event.name)
                assertFalse(
                    opened.canonicalState.event.divisions.any { divisionId ->
                        divisionId.normalizeDivisionIdentifier() ==
                            fixture.phaseDivisionId.normalizeDivisionIdentifier()
                    },
                )
                assertFalse(
                    opened.canonicalState.event.divisionDetails.any { detail ->
                        detail.id.normalizeDivisionIdentifier() ==
                            fixture.phaseDivisionId.normalizeDivisionIdentifier()
                    },
                )
                val slotAfterOpen = database.getEventTimeSlotDao
                    .getTimeSlotsByEventId(fixture.eventId)
                    .single()
                assertEquals(
                    expectedDivisionIds + removedDivisionId.normalizeDivisionIdentifier(),
                    slotAfterOpen.divisions.orEmpty()
                        .map(String::normalizeDivisionIdentifier)
                        .toSet(),
                )

                val saveCommand = EventEditorSaveCommandDto(
                    contractVersion = savedSnapshot.contractVersion,
                    editorRevision = savedSnapshot.editorRevision,
                    staffRevision = savedSnapshot.staffRevision,
                    draft = savedSnapshot.draft,
                    scheduleTransition = EventEditorSaveScheduleTransitionDto(
                        mode = EventEditorScheduleTransitionMode.PRESERVE,
                    ),
                )
                val saved = repository.saveEventEditor(
                    eventId = fixture.eventId,
                    command = saveCommand,
                ).getOrThrow()
                repository.updateLocalEvent(saved.session.canonicalState.event).getOrThrow()

                val eventAfterSave = requireNotNull(
                    database.getEventDao.getEventById(fixture.eventId),
                )
                val matchesAfterSave = database.getMatchDao
                    .getMatchesOfTournament(fixture.eventId)

                assertEquals(1, openRequestCount)
                assertEquals(1, saveRequestCount)
                assertEquals("Edited while saving", eventAfterSave.name)
                assertEquals(
                    expectedDivisionIds,
                    eventAfterSave.divisions
                        .map(String::normalizeDivisionIdentifier)
                        .toSet(),
                )
                assertEquals(
                    expectedDivisionIds,
                    eventAfterSave.divisionDetails
                        .map(DivisionDetail::id)
                        .map(String::normalizeDivisionIdentifier)
                        .toSet(),
                )
                assertEquals(
                    emptyList(),
                    eventAfterSave.divisionDetails
                        .first { detail ->
                            detail.id.normalizeDivisionIdentifier() ==
                                fixture.phaseDivisionId.normalizeDivisionIdentifier()
                        }
                        .fieldIds,
                )
                assertEquals(1, matchesAfterSave.size)
                assertEquals(fixture.phaseDivisionId, matchesAfterSave.single().phaseDivisionId)
                assertEquals("PLACED", matchesAfterSave.single().placementState)


                assertEquals(
                    "Edited saved detail",
                    eventAfterSave.divisionDetails
                        .first { detail ->
                            detail.id.normalizeDivisionIdentifier() ==
                                "division-open".normalizeDivisionIdentifier()
                        }
                        .name,
                )
                assertEquals("Edited while saving", saved.session.canonicalState.event.name)
                assertFalse(
                    saved.session.canonicalState.event.divisions.any { divisionId ->
                        divisionId.normalizeDivisionIdentifier() ==
                            fixture.phaseDivisionId.normalizeDivisionIdentifier()
                    },
                )
                val slotAfterSave = database.getEventTimeSlotDao
                    .getTimeSlotsByEventId(fixture.eventId)
                    .single()
                assertEquals("America/Los_Angeles", slotAfterSave.timeZone)
                assertEquals(
                    expectedDivisionIds,
                    slotAfterSave.divisions.orEmpty()
                        .map(String::normalizeDivisionIdentifier)
                        .toSet(),
                )
                val fieldAfterSave = database.getFieldDao
                    .getFieldsByIds(listOf(fixture.fieldId))
                    .single()
                assertEquals("Edited saved court", fieldAfterSave.name)
                assertEquals("Edited saved location", fieldAfterSave.location)
                assertEquals(listOf("Beach Volleyball"), fieldAfterSave.sportIds)
                assertTrue(fieldAfterSave.divisions.isEmpty())
            } finally {
                repository.close()
                http.close()
                database.close()
            }
        }

    @Test
    fun given_registered_participants_when_editor_projection_omits_server_fields_then_open_and_save_preserve_them() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val teamId = "team-room-editor-registered"
            val userId = "user-room-editor-registered"
            val realDatabase = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            var transactionCount = 0
            val database = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(
                delegate = realDatabase,
                onTransaction = { transactionCount += 1 },
            )
            val seededEvent = requireNotNull(
                fixture.eventResponse.toEventOrNull(requireOwnerIdentity = false),
            ).copy(
                teamIds = listOf(teamId),
                userIds = listOf(userId),
                rating = 4.5,
                seedColor = -1234567,
                prize = "Editor-protected prize",
                scheduleText = "Every Saturday",
                dateDisplayMode = "NO_FIXED_DATE",
                dateDisplayText = "Every Saturday",
                autoCancellation = true,
                fieldCount = 3,
                archivedAt = "2026-08-20T12:00:00Z",
            )
            database.getEventDao.upsertEvent(seededEvent)
            database.getTeamDao.upsertTeamsWithRelations(
                listOf(
                    Team(captainId = userId).copy(
                        id = teamId,
                        name = "Registered editor team",
                        playerIds = listOf(userId),
                    ),
                ),
            )
            database.getUserDataDao.upsertUsersData(listOf(UserData().copy(id = userId)))
            database.getEventDao.upsertEventTeamCrossRefs(
                listOf(EventTeamCrossRef(eventId = fixture.eventId, teamId = teamId)),
            )
            database.getUserDataDao.upsertUserEventCrossRefs(
                listOf(EventUserCrossRef(eventId = fixture.eventId, userId = userId)),
            )

            val openedSnapshot = fixture.saved.snapshot.copy(
                mode = "EDIT",
                eventId = fixture.eventId,
            )
            val savedSnapshot = openedSnapshot.copy(editorRevision = "room-editor-save-revision")
            val savedResult = fixture.saved.copy(
                snapshot = savedSnapshot,
                scheduleOutcome = fixture.saved.scheduleOutcome.copy(
                    status = EventEditorScheduleOutcomeStatus.NOT_REQUESTED,
                    matches = emptyList(),
                ),
                graph = null,
            )
            var openRequestCount = 0
            var saveRequestCount = 0
            val engine = MockEngine { request ->
                assertEquals(
                    "/api/events/${fixture.eventId}/editor",
                    request.url.encodedPath,
                )
                when (request.method) {
                    HttpMethod.Get -> {
                        openRequestCount += 1
                        respondJson(jsonMVP.encodeToString(openedSnapshot), HttpStatusCode.OK)
                    }
                    HttpMethod.Put -> {
                        saveRequestCount += 1
                        respondJson(jsonMVP.encodeToString(savedResult), HttpStatusCode.Created)
                    }
                    else -> error("Unexpected editor request ${request.method}")
                }
            }
            val http = HttpClient(engine) { configureMvpHttpClient() }
            val repository = eventRepositoryRoomPersistenceRepository(
                database = database,
                http = http,
                coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
            )

            fun assertProtectedEventFields(event: Event?) {
                assertEquals(listOf(teamId), event?.teamIds)
                assertEquals(listOf(userId), event?.userIds)
                assertEquals(4.5, event?.rating)
                assertEquals(-1234567, event?.seedColor)
                assertEquals("Editor-protected prize", event?.prize)
                assertEquals("Every Saturday", event?.scheduleText)
                assertEquals("NO_FIXED_DATE", event?.dateDisplayMode)
                assertEquals("Every Saturday", event?.dateDisplayText)
                assertTrue(event?.autoCancellation == true)
                assertEquals(3, event?.fieldCount)
                assertEquals("2026-08-20T12:00:00Z", event?.archivedAt)
            }

            try {
                val opened = repository.getEventEditor(fixture.eventId).getOrThrow()
                assertProtectedEventFields(opened.canonicalState.event)
                assertProtectedEventFields(database.getEventDao.getEventById(fixture.eventId))

                val saveCommand = EventEditorSaveCommandDto(
                    contractVersion = savedSnapshot.contractVersion,
                    editorRevision = savedSnapshot.editorRevision,
                    staffRevision = savedSnapshot.staffRevision,
                    draft = savedSnapshot.draft,
                    scheduleTransition = EventEditorSaveScheduleTransitionDto(
                        mode = EventEditorScheduleTransitionMode.PRESERVE,
                    ),
                )
                val saved = repository.saveEventEditor(
                    eventId = fixture.eventId,
                    command = saveCommand,
                ).getOrThrow()
                assertProtectedEventFields(saved.session.canonicalState.event)
                assertProtectedEventFields(database.getEventDao.getEventById(fixture.eventId))

                val refreshed = repository.getEventEditor(fixture.eventId).getOrThrow()
                assertProtectedEventFields(refreshed.canonicalState.event)
                assertProtectedEventFields(database.getEventDao.getEventById(fixture.eventId))
                assertEquals(2, openRequestCount)
                assertEquals(1, saveRequestCount)
                assertEquals(3, transactionCount)
                assertEquals(
                    listOf(teamId),
                    database.getEventDao
                        .getEventTeamCrossRefsByEventId(fixture.eventId)
                        .map(EventTeamCrossRef::teamId),
                )
                assertEquals(
                    listOf(userId),
                    database.getEventDao
                        .getEventUserCrossRefsByEventId(fixture.eventId)
                        .map(EventUserCrossRef::userId),
                )
            } finally {
                repository.close()
                http.close()
                realDatabase.close()
            }
        }

    @Test
    fun given_rebuilt_tournament_graph_when_room_persists_then_stale_graph_rows_are_replaced() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val realDatabase = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            val database = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(realDatabase)
            val seededEvent = requireNotNull(
                fixture.eventResponse.toEventOrNull(requireOwnerIdentity = false),
            )
            val stalePhaseId = "division-phase-room-stale"
            val stalePhase = requireNotNull(
                seededEvent.divisionDetails.firstOrNull {
                    it.id.normalizeDivisionIdentifier() ==
                        fixture.phaseDivisionId.normalizeDivisionIdentifier()
                },
            ) {
                "Seeded phase details: ${seededEvent.divisionDetails.map { it.id }}"
            }.copy(
                id = stalePhaseId,
                name = "Stale Pool Phase",
            )
            val staleTeamId = "team-room-tournament-stale"
            val rebuiltTeamId = "team-room-tournament-rebuilt"
            val staleTeam = requireNotNull(
                TeamApiDto(
                    id = staleTeamId,
                    name = "Stale team",
                    division = "division-open",
                ).toTeamOrNull(),
            )
            val rebuiltTeamDto = TeamApiDto(
                id = rebuiltTeamId,
                name = "Rebuilt placeholder team",
                division = "division-open",
            )
            val rebuiltTeam = requireNotNull(rebuiltTeamDto.toTeamOrNull())
            val oldEvent = seededEvent.copy(
                teamIds = listOf(staleTeamId),
                divisions = listOf("division-open", fixture.phaseDivisionId, stalePhaseId),
                divisionDetails = seededEvent.divisionDetails + stalePhase,
            )
            val seededMatch = requireNotNull(
                requireNotNull(fixture.saved.graph).matches.single().toMatchOrNull(),
            )
            val staleMatch = seededMatch.copy(
                id = "match-room-tournament-stale",
                matchId = 99,
                phaseDivisionId = stalePhaseId,
                division = stalePhaseId,
            )
            val rebuiltFieldId = "field-room-tournament-rebuilt"
            val rebuiltTimeSlotId = "slot-room-tournament-rebuilt"
            val rebuiltPhaseId = "division-phase-room-rebuilt"
            val rebuiltMatchId = "match-room-tournament-rebuilt"
            val canonicalDraft = fixture.draft.copy(
                basics = fixture.draft.basics.copy(name = "Canonical rebuilt tournament"),
                competition = fixture.draft.competition.copy(
                    divisionFieldIds = mapOf("division-open" to listOf(rebuiltFieldId)),
                    divisionDetails = fixture.draft.competition.divisionDetails.map { detail ->
                        detail.copy(fieldIds = listOf(rebuiltFieldId))
                    },
                ),
                resources = fixture.draft.resources.copy(
                    fieldIds = listOf(rebuiltFieldId),
                    fields = listOf(
                        fixture.draft.resources.fields.single().copy(
                            id = rebuiltFieldId,
                            name = "Canonical rebuilt court",
                        ),
                    ),
                    timeSlotIds = listOf(rebuiltTimeSlotId),
                    timeSlots = listOf(
                        fixture.draft.resources.timeSlots.single().copy(
                            id = rebuiltTimeSlotId,
                            eventId = fixture.eventId,
                            scheduledFieldId = rebuiltFieldId,
                            scheduledFieldIds = listOf(rebuiltFieldId),
                        ),
                    ),
                ),
            )
            val graph = requireNotNull(fixture.saved.graph)
            val graphEventDetails = requireNotNull(graph.event.divisionDetails)
            val graphRegularDivision = graphEventDetails
                .first { it.id.normalizeDivisionIdentifier() == "division-open".normalizeDivisionIdentifier() }
            val graphPhaseDivision = graphEventDetails
                .first {
                    it.id.normalizeDivisionIdentifier() ==
                        fixture.phaseDivisionId.normalizeDivisionIdentifier()
                }
                .copy(
                    id = rebuiltPhaseId,
                    name = "Authoritative rebuilt phase",
                    fieldIds = listOf(rebuiltFieldId),
                )
            val rebuiltGraphEvent = graph.event.copy(
                name = "Graph-only name must not replace canonical value",
                teamIds = listOf(rebuiltTeamId),
                teams = listOf(rebuiltTeamDto),
                divisions = listOf("division-open", rebuiltPhaseId),
                divisionDetails = listOf(
                    graphRegularDivision.copy(fieldIds = listOf(rebuiltFieldId)),
                    graphPhaseDivision,
                ),
                fieldIds = listOf(rebuiltFieldId),
                timeSlotIds = listOf(rebuiltTimeSlotId),
                fields = listOf(
                    graph.event.fields.single().copy(
                        id = rebuiltFieldId,
                        name = "Graph rebuilt court",
                        divisions = listOf("division-open", rebuiltPhaseId),
                    ),
                ),
                timeSlots = listOf(
                    graph.event.timeSlots.single().copy(
                        id = rebuiltTimeSlotId,
                        divisions = listOf("division-open", rebuiltPhaseId),
                        scheduledFieldId = rebuiltFieldId,
                        scheduledFieldIds = listOf(rebuiltFieldId),
                    ),
                ),
            )
            val rebuiltMatch = graph.matches.single().copy(
                id = rebuiltMatchId,
                matchId = 2,
                phaseDivisionId = rebuiltPhaseId,
                division = rebuiltPhaseId,
                fieldId = rebuiltFieldId,
            )
            val rebuiltProjection = fixture.saved.scheduleOutcome.matches.single().copy(
                id = rebuiltMatchId,
                matchId = 2,
                phaseDivisionId = rebuiltPhaseId,
                division = rebuiltPhaseId,
                fieldId = rebuiltFieldId,
            )
            val response = fixture.saved.copy(
                snapshot = fixture.saved.snapshot.copy(
                    draft = canonicalDraft,
                    mode = "EDIT",
                    eventId = fixture.eventId,
                ),
                scheduleOutcome = fixture.saved.scheduleOutcome.copy(
                    status = EventEditorScheduleOutcomeStatus.REBUILT,
                    matches = listOf(rebuiltProjection),
                ),
                graph = graph.copy(
                    event = rebuiltGraphEvent,
                    matches = listOf(rebuiltMatch),
                ),
            )
            database.getEventDao.upsertEvent(oldEvent)
            database.getTeamDao.upsertTeamsWithRelations(listOf(staleTeam))
            database.getEventDao.upsertEventTeamCrossRefs(
                listOf(EventTeamCrossRef(teamId = staleTeamId, eventId = fixture.eventId)),
            )
            database.getFieldDao.upsertFields(fixture.eventResponse.fields)
            database.getEventTimeSlotDao.upsertTimeSlots(
                fixture.eventResponse.timeSlots.mapIndexed { position, slot ->
                    slot.toTimeSlot(fixture.eventId).toEventTimeSlotCacheEntry(
                        eventId = fixture.eventId,
                        position = position,
                    )
                },
            )
            database.getMatchDao.upsertMatches(listOf(seededMatch, staleMatch))
            val engine = MockEngine { request ->
                assertEquals("/api/events/${fixture.eventId}/editor", request.url.encodedPath)
                assertEquals(HttpMethod.Put, request.method)
                respondJson(jsonMVP.encodeToString(response), HttpStatusCode.Created)
            }
            val http = HttpClient(engine) { configureMvpHttpClient() }
            val repository = eventRepositoryRoomPersistenceRepository(
                database = database,
                http = http,
                coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
            )
            val command = EventEditorSaveCommandDto(
                contractVersion = response.snapshot.contractVersion,
                editorRevision = response.snapshot.editorRevision,
                staffRevision = response.snapshot.staffRevision,
                draft = response.snapshot.draft,
                scheduleTransition = EventEditorSaveScheduleTransitionDto(
                    mode = EventEditorScheduleTransitionMode.RECONCILE,
                    expectedScheduleRevision = response.snapshot.scheduleState.revision,
                ),
            )

            try {
                val result = repository.saveEventEditor(fixture.eventId, command).getOrThrow()
                val persistedEvent = requireNotNull(
                    database.getEventDao.getEventById(fixture.eventId),
                )
                val persistedFields = database.getFieldDao.getFieldsByIds(persistedEvent.fieldIds)
                val persistedSlots = database.getEventTimeSlotDao
                    .getTimeSlotsByEventId(fixture.eventId)
                val persistedMatches = database.getMatchDao.getMatchesOfTournament(fixture.eventId)

                assertEquals("Canonical rebuilt tournament", persistedEvent.name)
                assertEquals(listOf(rebuiltTeamId), persistedEvent.teamIds)
                assertEquals(
                    listOf(rebuiltTeamId),
                    database.getEventDao
                        .getEventTeamCrossRefsByEventId(fixture.eventId)
                        .map { crossRef -> crossRef.teamId },
                )
                assertEquals(
                    listOf(rebuiltTeam),
                    database.getTeamDao.getTeams(listOf(rebuiltTeamId)),
                )
                assertEquals(
                    setOf("division-open", rebuiltPhaseId)
                        .map { it.normalizeDivisionIdentifier() }
                        .toSet(),
                    persistedEvent.divisions.map(String::normalizeDivisionIdentifier).toSet(),
                )
                assertEquals(
                    setOf("division-open", rebuiltPhaseId)
                        .map { it.normalizeDivisionIdentifier() }
                        .toSet(),
                    persistedEvent.divisionDetails
                        .map { it.id.normalizeDivisionIdentifier() }
                        .toSet(),
                )
                assertFalse(
                    persistedEvent.divisionDetails.any {
                        it.id.normalizeDivisionIdentifier() ==
                            stalePhaseId.normalizeDivisionIdentifier()
                    },
                )
                assertEquals(listOf(rebuiltFieldId), persistedEvent.fieldIds)
                assertEquals(listOf(rebuiltTimeSlotId), persistedEvent.timeSlotIds)
                assertEquals(1, persistedFields.size)
                assertEquals("Canonical rebuilt court", persistedFields.single().name)
                assertEquals(
                    setOf("division-open", rebuiltPhaseId)
                        .map { it.normalizeDivisionIdentifier() }
                        .toSet(),
                    persistedFields.single().divisions
                        .map(String::normalizeDivisionIdentifier)
                        .toSet(),
                )
                assertEquals(listOf(rebuiltTimeSlotId), persistedSlots.map { it.slotId })
                assertEquals(
                    setOf("division-open", rebuiltPhaseId)
                        .map { it.normalizeDivisionIdentifier() }
                        .toSet(),
                    persistedSlots.single().divisions
                        ?.map(String::normalizeDivisionIdentifier)
                        ?.toSet(),
                )
                assertEquals(listOf(rebuiltFieldId), persistedSlots.single().scheduledFieldIds)
                assertEquals(listOf(rebuiltMatchId), persistedMatches.map { it.id })
                assertEquals(
                    rebuiltPhaseId.normalizeDivisionIdentifier(),
                    persistedMatches.single().phaseDivisionId?.normalizeDivisionIdentifier(),
                )
                assertEquals(rebuiltFieldId, persistedMatches.single().fieldId)
                assertEquals(
                    listOf(rebuiltPhaseId),
                    result.session.canonicalState.event.divisionDetails
                        .filter {
                            it.id.normalizeDivisionIdentifier() ==
                                rebuiltPhaseId.normalizeDivisionIdentifier()
                        }
                        .map { rebuiltPhaseId },
                )
            } finally {
                repository.close()
                http.close()
                realDatabase.close()
            }
        }

    @Test
    fun given_cross_event_match_in_save_response_when_room_persists_then_cache_is_unchanged() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val realDatabase = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            val database = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(realDatabase)
            val seededEvent = requireNotNull(
                fixture.eventResponse.toEventOrNull(requireOwnerIdentity = false),
            )
            val seededMatch = requireNotNull(
                requireNotNull(fixture.saved.graph).matches.single().toMatchOrNull(),
            )
            database.getEventDao.upsertEvent(seededEvent)
            database.getFieldDao.upsertFields(fixture.eventResponse.fields)
            database.getEventTimeSlotDao.upsertTimeSlots(
                fixture.eventResponse.timeSlots.mapIndexed { position, slot ->
                    slot.toTimeSlot(fixture.eventId).toEventTimeSlotCacheEntry(
                        eventId = fixture.eventId,
                        position = position,
                    )
                },
            )
            database.getMatchDao.upsertMatches(listOf(seededMatch))

            val malformedGraph = requireNotNull(fixture.saved.graph).copy(
                matches = listOf(
                    requireNotNull(fixture.saved.graph).matches.single()
                        .copy(eventId = "event-other"),
                ),
            )
            val response = fixture.saved.copy(
                scheduleOutcome = fixture.saved.scheduleOutcome.copy(
                    status = EventEditorScheduleOutcomeStatus.NOT_REQUESTED,
                    matches = emptyList(),
                ),
                graph = malformedGraph,
            )
            val engine = MockEngine { request ->
                assertEquals(
                    "/api/events/${fixture.eventId}/editor",
                    request.url.encodedPath,
                )
                assertEquals(HttpMethod.Put, request.method)
                respondJson(jsonMVP.encodeToString(response), HttpStatusCode.Created)
            }
            val http = HttpClient(engine) { configureMvpHttpClient() }
            val repository = eventRepositoryRoomPersistenceRepository(
                database = database,
                http = http,
                coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
            )
            val command = EventEditorSaveCommandDto(
                contractVersion = response.snapshot.contractVersion,
                editorRevision = response.snapshot.editorRevision,
                staffRevision = response.snapshot.staffRevision,
                draft = response.snapshot.draft,
                scheduleTransition = EventEditorSaveScheduleTransitionDto(
                    mode = EventEditorScheduleTransitionMode.PRESERVE,
                ),
            )
            val eventBefore = requireNotNull(database.getEventDao.getEventById(fixture.eventId))
            val fieldsBefore = database.getFieldDao.getFieldsByIds(listOf(fixture.fieldId))
            val slotsBefore = database.getEventTimeSlotDao.getTimeSlotsByEventId(fixture.eventId)
            val matchesBefore = database.getMatchDao.getMatchesOfTournament(fixture.eventId)

            try {
                val result = repository.saveEventEditor(fixture.eventId, command)

                assertTrue(result.isFailure)
                assertTrue(
                    result.exceptionOrNull()?.message?.contains("wrong Event") == true,
                )
                assertEquals(eventBefore, database.getEventDao.getEventById(fixture.eventId))
                assertEquals(fieldsBefore, database.getFieldDao.getFieldsByIds(listOf(fixture.fieldId)))
                assertEquals(
                    slotsBefore,
                    database.getEventTimeSlotDao.getTimeSlotsByEventId(fixture.eventId),
                )
                assertEquals(matchesBefore, database.getMatchDao.getMatchesOfTournament(fixture.eventId))
            } finally {
                repository.close()
                http.close()
                realDatabase.close()
            }
        }

    @Test
    fun given_wrong_event_graph_without_matches_when_room_persists_then_cache_is_unchanged() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val realDatabase = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            val database = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(realDatabase)
            val seededEvent = requireNotNull(
                fixture.eventResponse.toEventOrNull(requireOwnerIdentity = false),
            )
            val seededMatch = requireNotNull(
                requireNotNull(fixture.saved.graph).matches.single().toMatchOrNull(),
            )
            database.getEventDao.upsertEvent(seededEvent)
            database.getFieldDao.upsertFields(fixture.eventResponse.fields)
            database.getEventTimeSlotDao.upsertTimeSlots(
                fixture.eventResponse.timeSlots.mapIndexed { position, slot ->
                    slot.toTimeSlot(fixture.eventId).toEventTimeSlotCacheEntry(
                        eventId = fixture.eventId,
                        position = position,
                    )
                },
            )
            database.getMatchDao.upsertMatches(listOf(seededMatch))

            val malformedGraph = requireNotNull(fixture.saved.graph).copy(
                event = requireNotNull(fixture.saved.graph).event.copy(id = "event-other"),
                matches = emptyList(),
            )
            val response = fixture.saved.copy(
                scheduleOutcome = fixture.saved.scheduleOutcome.copy(
                    status = EventEditorScheduleOutcomeStatus.NOT_REQUESTED,
                    matches = emptyList(),
                ),
                graph = malformedGraph,
            )
            val engine = MockEngine { request ->
                assertEquals(
                    "/api/events/${fixture.eventId}/editor",
                    request.url.encodedPath,
                )
                assertEquals(HttpMethod.Put, request.method)
                respondJson(jsonMVP.encodeToString(response), HttpStatusCode.Created)
            }
            val http = HttpClient(engine) { configureMvpHttpClient() }
            val repository = eventRepositoryRoomPersistenceRepository(
                database = database,
                http = http,
                coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
            )
            val command = EventEditorSaveCommandDto(
                contractVersion = response.snapshot.contractVersion,
                editorRevision = response.snapshot.editorRevision,
                staffRevision = response.snapshot.staffRevision,
                draft = response.snapshot.draft,
                scheduleTransition = EventEditorSaveScheduleTransitionDto(
                    mode = EventEditorScheduleTransitionMode.PRESERVE,
                ),
            )
            val eventBefore = requireNotNull(database.getEventDao.getEventById(fixture.eventId))
            val fieldsBefore = database.getFieldDao.getFieldsByIds(listOf(fixture.fieldId))
            val slotsBefore = database.getEventTimeSlotDao.getTimeSlotsByEventId(fixture.eventId)
            val matchesBefore = database.getMatchDao.getMatchesOfTournament(fixture.eventId)

            try {
                val result = repository.saveEventEditor(fixture.eventId, command)

                assertTrue(result.isFailure)
                assertTrue(
                    result.exceptionOrNull()?.message?.contains("wrong Event") == true,
                )
                assertEquals(eventBefore, database.getEventDao.getEventById(fixture.eventId))
                assertEquals(fieldsBefore, database.getFieldDao.getFieldsByIds(listOf(fixture.fieldId)))
                assertEquals(
                    slotsBefore,
                    database.getEventTimeSlotDao.getTimeSlotsByEventId(fixture.eventId),
                )
                assertEquals(matchesBefore, database.getMatchDao.getMatchesOfTournament(fixture.eventId))
            } finally {
                repository.close()
                http.close()
                realDatabase.close()
            }
        }

    @Test
    fun given_tournament_local_update_when_room_transaction_commits_then_readback_matches_committed_row() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val realDatabase = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            var transactionCount = 0
            val database = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(
                delegate = realDatabase,
                onTransaction = { transactionCount += 1 },
            )
            val seededEvent = requireNotNull(
                fixture.eventResponse.toEventOrNull(requireOwnerIdentity = false),
            )
            database.getEventDao.upsertEvent(seededEvent)
            val http = HttpClient(
                MockEngine { error("Unexpected network request") },
            ) { configureMvpHttpClient() }
            val repository = eventRepositoryRoomPersistenceRepository(
                database = database,
                http = http,
                coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
            )

            try {
                val persisted = repository.updateLocalEvent(
                    seededEvent.copy(name = "Committed tournament update"),
                ).getOrThrow()

                assertEquals(1, transactionCount)
                assertEquals("Committed tournament update", persisted.name)
                assertEquals(
                    persisted,
                    realDatabase.getEventDao.getEventById(fixture.eventId),
                )
            } finally {
                repository.close()
                http.close()
                realDatabase.close()
            }
        }

    @Test
    fun given_accepted_tournament_graph_when_room_persists_then_all_rows_round_trip() = kotlinx.coroutines.test.runTest {
        val fixture = eventRepositoryRoomPersistenceTournamentFixture()
        val registeredTeamId = "team-room-registered"
        val placeholderTeamId = "team-room-placeholder"
        val registeredTeam = TeamApiDto(
            id = registeredTeamId,
            name = "Registered Team",
            kind = "REGISTERED",
            division = "division-open",
        )
        val placeholderTeam = TeamApiDto(
            id = placeholderTeamId,
            name = "Generated Placeholder",
            kind = "PLACEHOLDER",
            division = fixture.phaseDivisionId,
        )
        val acceptedGraph = requireNotNull(fixture.saved.graph).copy(
            event = requireNotNull(fixture.saved.graph).event.copy(
                teamIds = listOf(registeredTeamId),
                teams = listOf(registeredTeam, placeholderTeam),
            ),
            matches = requireNotNull(fixture.saved.graph).matches.map { match ->
                match.copy(team1Id = placeholderTeamId)
            },
        )
        val acceptedSave = fixture.saved.copy(graph = acceptedGraph)
        assertEquals(
            mapOf("division-open" to listOf(fixture.fieldId)),
            fixture.command.draft.competition.divisionFieldIds,
        )
        assertEquals(
            listOf("division-open"),
            fixture.command.draft.resources.timeSlots.single().divisions,
        )
        assertEquals(fixture.command.draft, fixture.proposal.snapshot.draft)
        assertFalse(
            fixture.command.draft.competition.divisionFieldIds.containsKey(fixture.phaseDivisionId),
        )
        assertFalse(
            fixture.command.draft.resources.timeSlots
                .flatMap { slot -> slot.divisions }
                .contains(fixture.phaseDivisionId),
        )
        assertFalse(
            fixture.proposal.snapshot.draft.competition.divisionFieldIds
                .containsKey(fixture.phaseDivisionId),
        )
        assertFalse(
            fixture.proposal.snapshot.draft.resources.timeSlots
                .flatMap { slot -> slot.divisions }
                .contains(fixture.phaseDivisionId),
        )
        assertEquals(
            setOf("division-open", fixture.phaseDivisionId),
            fixture.proposal.graph.event.timeSlots.single().divisions.orEmpty().toSet(),
        )
        assertEquals(
            setOf("division-open", fixture.phaseDivisionId)
                .map(String::normalizeDivisionIdentifier)
                .toSet(),
            fixture.proposal.graph.event.fields.single().divisions
                .map(String::normalizeDivisionIdentifier)
                .toSet(),
        )
        assertEquals(fixture.proposal.graph, fixture.saved.graph)
        val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
            .allowMainThreadQueries()
            .build()
        var editorRequestCount = 0
        val engine = MockEngine { request ->
            assertEquals("/api/events/editor", request.url.encodedPath)
            editorRequestCount += 1
            if (request.method == HttpMethod.Post) {
                respondJson(jsonMVP.encodeToString(fixture.proposal), HttpStatusCode.Accepted)
            } else {
                assertEquals(HttpMethod.Put, request.method)
                respondJson(jsonMVP.encodeToString(acceptedSave), HttpStatusCode.Created)
            }
        }
        val http = HttpClient(engine) { configureMvpHttpClient() }
        val repository = eventRepositoryRoomPersistenceRepository(
            database = database,
            http = http,
            coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
        )
        try {
            val proposalOutcome = repository.createEventEditor(fixture.command).getOrThrow()

            assertNotNull(proposalOutcome.proposal)
            assertNull(database.getEventDao.getEventById(fixture.eventId))
            assertTrue(database.getFieldDao.getFieldsByIds(listOf(fixture.fieldId)).isEmpty())
            assertTrue(database.getEventTimeSlotDao.getTimeSlotsByEventId(fixture.eventId).isEmpty())
            assertTrue(database.getMatchDao.getMatchesOfTournament(fixture.eventId).isEmpty())

            val accepted = repository.acceptEventEditorProposal(
                createOperationId = fixture.command.createOperationId,
                proposalRevision = fixture.proposal.proposalRevision,
                draft = fixture.draft,
            ).getOrThrow()
            val persistedEvent = database.getEventDao.getEventById(fixture.eventId)
            val persistedFields = database.getFieldDao.getFieldsByIds(listOf(fixture.fieldId))
            val persistedSlots = database.getEventTimeSlotDao.getTimeSlotsByEventId(fixture.eventId)
            val persistedMatches = database.getMatchDao.getMatchesOfTournament(fixture.eventId)
            val observed = repository.getCachedEventWithRelationsFlow(fixture.eventId).first().getOrThrow()

            assertEquals(2, editorRequestCount)
            assertEquals(fixture.eventId, accepted.session.canonicalState.event.id)
            assertEquals(EventType.TOURNAMENT, persistedEvent?.eventType)
            assertEquals(listOf(registeredTeamId), persistedEvent?.teamIds)
            assertEquals(
                setOf(registeredTeamId),
                observed.teams.map { team -> team.id }.toSet(),
            )
            assertEquals(
                setOf("division-open", fixture.phaseDivisionId)
                    .map(String::normalizeDivisionIdentifier)
                    .toSet(),
                persistedEvent?.divisionDetails
                    ?.map(DivisionDetail::id)
                    ?.map(String::normalizeDivisionIdentifier)
                    ?.toSet(),
            )
            assertEquals(
                "division-open".normalizeDivisionIdentifier(),
                persistedEvent?.divisionDetails
                    ?.first { it.id.normalizeDivisionIdentifier() == fixture.phaseDivisionId.normalizeDivisionIdentifier() }
                    ?.sourceDivisionId
                    ?.normalizeDivisionIdentifier(),
            )
            assertEquals(listOf(fixture.fieldId), persistedEvent?.fieldIds)
            assertEquals(listOf(fixture.timeSlotId), persistedEvent?.timeSlotIds)
            assertEquals(listOf(fixture.fieldId), persistedFields.map(Field::id))
            assertEquals(
                setOf("division-open", fixture.phaseDivisionId)
                    .map(String::normalizeDivisionIdentifier)
                    .toSet(),
                persistedFields.single().divisions
                    .map(String::normalizeDivisionIdentifier)
                    .toSet(),
            )
            assertEquals(listOf(fixture.timeSlotId), persistedSlots.map { it.slotId })
            assertEquals(listOf("field-room-tournament"), persistedSlots.mapNotNull { it.scheduledFieldId })
            assertEquals(
                setOf("division-open", fixture.phaseDivisionId)
                    .map(String::normalizeDivisionIdentifier)
                    .toSet(),
                persistedSlots.single().divisions
                    ?.map(String::normalizeDivisionIdentifier)
                    ?.toSet(),
            )
            assertEquals(1, persistedMatches.size)
            assertEquals(fixture.phaseDivisionId, persistedMatches.single().phaseDivisionId)
            assertEquals("PLACED", persistedMatches.single().placementState)
            assertEquals("field-room-tournament", persistedMatches.single().fieldId)
            assertEquals(placeholderTeamId, persistedMatches.single().team1Id)
            assertEquals(persistedEvent, observed.event)
            assertEquals(persistedSlots, observed.timeSlotCacheEntries)
        } finally {
            repository.close()
            http.close()
            database.close()
        }
    }

    @Test
    fun given_partial_when_room_reopens_then_exact_schedule_remains() = kotlinx.coroutines.test.runTest {
        val fixture = eventRepositoryRoomPersistenceTournamentFixture()
        val viewer = UserData(
            id = "room-host", firstName = "Test", lastName = "Host", userName = "room-host",
            friendIds = emptyList(), friendRequestIds = emptyList(), friendRequestSentIds = emptyList(),
            followingIds = emptyList(), hasStripeAccount = false, uploadedImages = emptyList(),
        )
        val currentUserState = MutableStateFlow(Result.success(viewer))
        val startupAuthState = MutableStateFlow<StartupAuthState>(StartupAuthState.Authenticated)
        val unplaced = fixture.proposal.graph.matches.single().copy(
            id = "match-room-unplaced", matchId = 2, start = null, end = null,
            fieldId = null, placementState = "UNPLACED",
        )
        val projection = fixture.proposal.scheduleOutcome.matches.single().copy(
            id = "match-room-unplaced", matchId = 2, start = null, end = null,
            fieldId = null, placementState = "UNPLACED",
        )
        val outcome = fixture.proposal.scheduleOutcome.copy(
            status = EventEditorScheduleOutcomeStatus.PARTIAL, isComplete = false,
            matchCount = 2, placedMatchCount = 1, unplacedMatchCount = 1,
            matches = fixture.proposal.scheduleOutcome.matches + projection,
            unscheduledMatches = listOf(com.razumly.mvp.core.network.dto.EventEditorUnscheduledMatchDto(
                id = "match-room-unplaced", matchId = 2, phaseDivisionId = fixture.phaseDivisionId,
                phase = "POOL", sourceDivisionId = "division-open",
            )),
            affectedCompetitionPhases = listOf(com.razumly.mvp.core.network.dto.EventEditorAffectedCompetitionPhaseDto(
                id = fixture.phaseDivisionId, name = "Open Pool Phase", phase = "POOL", sourceDivisionId = "division-open",
            )),
        )
        val graph = fixture.proposal.graph.copy(matches = fixture.proposal.graph.matches + unplaced)
        val proposal = fixture.proposal.copy(scheduleOutcome = outcome, graph = graph)
        val saved = fixture.saved.copy(scheduleOutcome = outcome, graph = graph, acceptanceOperationId = "partial-room-accept")
        // Keep the native SQLite path below the Windows path limit.
        val databaseName = "i39-${java.util.UUID.randomUUID()}.db"
        fun openDatabase() = Room.databaseBuilder<MVPDatabaseService>(context, databaseName)
            .allowMainThreadQueries().build()
        var database = openDatabase()
        var offline = false
        var requestCount = 0
        val http = HttpClient(MockEngine { request ->
            check(!offline) { "Room reload must not use the network." }
            requestCount += 1
            assertEquals("/api/events/editor", request.url.encodedPath)
            when (request.method) {
                HttpMethod.Post -> respondJson(jsonMVP.encodeToString(proposal), HttpStatusCode.Accepted)
                HttpMethod.Put -> respondJson(jsonMVP.encodeToString(saved), HttpStatusCode.Created)
                else -> error("Unexpected proposal request.")
            }
        }) { configureMvpHttpClient() }
        var repository = eventRepositoryRoomPersistenceRepository(database, http, UnconfinedTestDispatcher(testScheduler),
            currentUserState = currentUserState, startupAuthState = startupAuthState)
        try {
            repository.createEventEditor(fixture.command).getOrThrow()
            assertNull(database.getEventDao.getEventById(fixture.eventId))
            assertTrue(database.getMatchDao.getMatchesOfTournament(fixture.eventId).isEmpty())
            repository.acceptEventEditorPartialProposal(
                createOperationId = proposal.createOperationId,
                proposalRevision = proposal.proposalRevision,
                acceptanceOperationId = "partial-room-accept",
                draft = fixture.draft,
            ).getOrThrow()
            repository.close()
            database.close()
            offline = true
            startupAuthState.value = StartupAuthState.Checking
            currentUserState.value = Result.failure(IllegalStateException("Restoring the cached account"))
            database = openDatabase()
            repository = eventRepositoryRoomPersistenceRepository(database, http, UnconfinedTestDispatcher(testScheduler),
                currentUserState = currentUserState, startupAuthState = startupAuthState)
            currentUserState.value = Result.success(viewer)
            startupAuthState.value = StartupAuthState.Authenticated

            val cached = repository.getCachedEventWithRelationsFlow(fixture.eventId).first().getOrThrow()
            assertEquals(fixture.eventId, cached.event.id)
            assertEquals(
                listOf(fixture.timeSlotId),
                database.getEventTimeSlotDao.getTimeSlotsByEventId(fixture.eventId).map { it.slotId },
            )
            val matches = database.getMatchDao.getMatchesFlowOfTournament(fixture.eventId).first()
                .associateBy { it.match.id }
            assertEquals(setOf("match-room-tournament", "match-room-unplaced"), matches.keys)
            val placed = matches.getValue("match-room-tournament")
            assertEquals(Instant.parse("2026-08-15T08:00:00Z"), placed.match.start)
            assertEquals(Instant.parse("2026-08-15T08:45:00Z"), placed.match.end)
            assertEquals(fixture.fieldId, placed.match.fieldId)
            assertEquals("Tournament Court", placed.field?.name)
            val pending = matches.getValue("match-room-unplaced").match
            assertEquals("UNPLACED", pending.placementState)
            assertEquals(fixture.phaseDivisionId, pending.phaseDivisionId)
            assertNull(pending.start)
            assertNull(pending.end)
            assertNull(pending.fieldId)
            assertEquals(2, requestCount)
            currentUserState.value = Result.success(viewer.copy(id = "another-account"))
            repository.getCachedEventWithRelationsFlow(fixture.eventId).first { it.isFailure }
            assertNull(database.getEventDao.getEventById(fixture.eventId))
            assertTrue(database.getEventTimeSlotDao.getTimeSlotsByEventId(fixture.eventId).isEmpty())
        } finally {
            repository.close()
            http.close()
            database.close()
            context.deleteDatabase(databaseName)
        }
    }

    @Test
    fun given_maintenance_when_room_reopens_then_schedule_remains() =
        kotlinx.coroutines.test.runTest {
            for (operation in EventEditorMaintenanceOperation.entries) {
                val fixture = eventRepositoryRoomPersistenceTournamentFixture()
                val databaseName = "i41-${java.util.UUID.randomUUID()}.db"
                fun openDatabase() = Room.databaseBuilder<MVPDatabaseService>(context, databaseName)
                    .allowMainThreadQueries().build()
                var database = openDatabase()
                var offline = false
                var rejectAcceptance = true
                val assignment = com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphOfficialAssignmentDto(
                    positionId = "line-official", slotIndex = 0, holderType = "OFFICIAL",
                    userId = "official-1", eventOfficialId = "event-official-1",
                    checkedIn = true, hasConflict = false,
                )
                val scheduled = roomMaintenanceGraphMatch(fixture.eventId, "match-1", 1, fixture.fieldId).copy(
                    team1Id = "team-left", team2Id = "team-right", teamOfficialId = "team-duty",
                    officialIds = listOf(assignment), officialAssignments = listOf(assignment),
                    locked = operation != EventEditorMaintenanceOperation.BUILD,
                    winnerNextMatchId = "match-2",
                )
                val unplaced = roomMaintenanceGraphMatch(fixture.eventId, "match-2", 2, fixture.fieldId).copy(
                    placementState = "UNPLACED", start = null, end = null, fieldId = null, field = null,
                    previousLeftId = "match-1",
                )
                val projections = listOf(
                    roomMaintenanceProjection(fixture.eventId, "match-1", 1, fixture.fieldId).copy(locked = scheduled.locked),
                    roomMaintenanceProjection(fixture.eventId, "match-2", 2, fixture.fieldId).copy(
                        placementState = "UNPLACED", start = null, end = null, fieldId = null,
                    ),
                )
                val eventEnd = if (operation == EventEditorMaintenanceOperation.COMPLETE) {
                    "2026-08-15T18:00:00Z"
                } else {
                    "2026-08-15T08:45:00Z"
                }
                val graphEvent = roomMaintenanceGraphEvent(fixture.eventId, fieldId = fixture.fieldId).copy(
                    end = eventEnd,
                    teams = listOf("team-left", "team-right", "team-duty").map { id ->
                        EventEditorMaintenanceGraphTeamDto(
                            id = id, captainId = null, division = "division-open", kind = "PLACEHOLDER",
                            name = id, playerIds = emptyList(), players = emptyList(), playerRegistrations = emptyList(),
                        )
                    },
                )
                val graph = EventEditorMaintenanceGraphDto(
                    event = fixture.eventResponse, matches = projections,
                    canonicalEvent = graphEvent, canonicalMatches = listOf(scheduled, unplaced),
                )
                val request = roomMaintenanceRequest(fixture, operation, "offline-${operation.name}")
                val accepted = EventEditorMaintenanceAcceptedResultDto(
                    status = EventEditorMaintenanceResponseStatus.ACCEPTED,
                    contractVersion = request.contractVersion, eventId = request.eventId, operation = operation,
                    operationId = request.operationId, proposalRevision = "offline-proposal",
                    revisionBinding = requireNotNull(request.expectedRevisions), graph = graph,
                    protectedMatchIds = if (scheduled.locked) listOf("match-1") else emptyList(),
                    acceptanceOperationId = "offline-acceptance",
                    scheduleOutcome = EventEditorMaintenanceScheduleOutcomeDto(
                        status = EventEditorMaintenanceScheduleOutcomeStatus.INCOMPLETE,
                        isComplete = false, matchCount = 2, placedMatchCount = 1, unplacedMatchCount = 1,
                        matches = projections, warnings = emptyList(),
                        unscheduledMatches = listOf(com.razumly.mvp.core.network.dto.EventEditorMaintenanceUnscheduledMatchDto(
                            id = "match-2", matchId = 2, phaseDivisionId = "division-open", phase = "POOL",
                            sourceDivisionId = "division-open",
                        )),
                        affectedCompetitionPhases = listOf(com.razumly.mvp.core.network.dto.EventEditorMaintenanceAffectedCompetitionPhaseDto(
                            id = "division-open", name = "Open Pool", phase = "POOL", sourceDivisionId = "division-open",
                        )),
                    ),
                )
                val http = HttpClient(MockEngine { httpRequest ->
                    check(!offline) { "Offline reload must not use HTTP." }
                    assertEquals("/api/events/${fixture.eventId}/schedule", httpRequest.url.encodedPath)
                    assertEquals(HttpMethod.Put, httpRequest.method)
                    if (rejectAcceptance) {
                        respondJson("""{"code":"EDITOR_MAINTENANCE_STALE","error":"Schedule changed."}""", HttpStatusCode.Conflict)
                    } else {
                        respondJson(encodeRoomMaintenanceResponse(accepted), HttpStatusCode.OK)
                    }
                }) { configureMvpHttpClient() }
                var repository = eventRepositoryRoomPersistenceRepository(database, http, UnconfinedTestDispatcher(testScheduler))
                fun matchRepository() = com.razumly.mvp.eventDetail.data.MatchRepository(
                    api = MvpApiClient(http, "http://example.test", EventRepositoryRoomPersistence_AuthTokenStore),
                    databaseService = database, autoSyncOperations = false,
                )
                val acceptance = EventEditorAcceptMaintenanceProposalDto(
                    contractVersion = request.contractVersion, eventId = request.eventId, operation = operation,
                    operationId = request.operationId, proposalRevision = accepted.proposalRevision,
                    acceptanceOperationId = accepted.acceptanceOperationId,
                )
                try {
                    val priorEvent = Event(id = fixture.eventId, eventType = EventType.TOURNAMENT,
                        end = Instant.parse("2026-08-15T18:00:00Z"), isAutomatedScheduling = true)
                    repository.updateLocalEvent(priorEvent).getOrThrow()
                    assertIs<EventEditorProposalStaleException>(repository.acceptEventScheduleMaintenance(acceptance).exceptionOrNull())
                    assertEquals(priorEvent.end, repository.getCachedEventWithRelationsFlow(fixture.eventId).first().getOrThrow().event.end)
                    assertTrue(matchRepository().getCachedMatchesOfTournamentFlow(fixture.eventId).first().getOrThrow().isEmpty())

                    rejectAcceptance = false
                    repository.acceptEventScheduleMaintenance(acceptance).getOrThrow()
                    repository.close()
                    database.close()
                    offline = true
                    database = openDatabase()
                    repository = eventRepositoryRoomPersistenceRepository(database, http, UnconfinedTestDispatcher(testScheduler))
                    assertEquals(Instant.parse(eventEnd), repository.getCachedEventWithRelationsFlow(fixture.eventId).first().getOrThrow().event.end)
                    val matches = matchRepository().getCachedMatchesOfTournamentFlow(fixture.eventId).first().getOrThrow()
                        .associateBy { it.match.id }
                    assertEquals(setOf("match-1", "match-2"), matches.keys)
                    val placed = matches.getValue("match-1").match
                    assertEquals(Instant.parse("2026-08-15T08:00:00Z"), placed.start)
                    assertEquals(Instant.parse("2026-08-15T08:45:00Z"), placed.end)
                    assertEquals(fixture.fieldId, placed.fieldId)
                    assertEquals("team-left", placed.team1Id)
                    assertEquals("team-right", placed.team2Id)
                    assertEquals("team-duty", placed.teamOfficialId)
                    assertEquals("official-1", placed.officialIds.single().userId)
                    assertEquals("line-official", placed.officialIds.single().positionId)
                    assertTrue(placed.officialIds.single().checkedIn)
                    assertEquals(operation != EventEditorMaintenanceOperation.BUILD, placed.locked)
                    assertEquals("match-2", placed.winnerNextMatchId)
                    val pending = matches.getValue("match-2").match
                    assertEquals("UNPLACED", pending.placementState)
                    assertNull(pending.start)
                    assertNull(pending.end)
                    assertNull(pending.fieldId)
                    assertEquals("match-1", pending.previousLeftId)
                } finally {
                    repository.close()
                    http.close()
                    database.close()
                    context.deleteDatabase(databaseName)
                }
            }
        }

    @Test
    fun given_newer_event_when_accepted_relation_refresh_runs_then_newer_relations_survive_and_only_missing_rows_are_fetched() =
        kotlinx.coroutines.test.runTest {
            val eventId = "event-room-relation-race"
            val staleTeamId = "team-room-relation-stale"
            val cachedTeamId = "team-room-relation-cached"
            val newerTeamId = "team-room-relation-new"
            val staleUserId = "user-room-relation-stale"
            val cachedUserId = "user-room-relation-cached"
            val newerUserId = "user-room-relation-new"
            val staleEvent = Event(
                id = eventId,
                teamIds = listOf(staleTeamId, cachedTeamId),
                userIds = listOf(staleUserId, cachedUserId),
            )
            val newerEvent = staleEvent.copy(
                teamIds = listOf(newerTeamId),
                userIds = listOf(newerUserId),
            )
            val staleTeam = Team(captainId = staleUserId).copy(
                id = staleTeamId,
                name = "Stale relation team",
                playerIds = listOf(staleUserId),
            )
            val cachedTeam = Team(captainId = cachedUserId).copy(
                id = cachedTeamId,
                name = "Cached relation team",
                playerIds = listOf(cachedUserId),
            )
            val newerTeam = Team(captainId = newerUserId).copy(
                id = newerTeamId,
                name = "Newer relation team",
                playerIds = listOf(newerUserId),
            )
            val staleUser = UserData().copy(id = staleUserId)
            val cachedUser = UserData().copy(id = cachedUserId)
            val newerUser = UserData().copy(id = newerUserId)
            val realDatabase = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            var hydrationFinished = false
            var transactionCount = 0
            val database = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(
                delegate = realDatabase,
                onTransaction = {
                    transactionCount += 1
                    assertTrue(hydrationFinished)
                    assertTrue(realDatabase.getTeamDao.getTeams(listOf(staleTeamId)).isEmpty())
                    assertTrue(realDatabase.getUserDataDao.getUserDatasById(listOf(staleUserId)).isEmpty())
                },
            )
            val requestedTeamIds = mutableListOf<List<String>>()
            val requestedUserIds = mutableListOf<List<String>>()
            val teamRepository = mockk<ITeamRepository>()
            val userRepository = mockk<IUserRepository>()
            coEvery { teamRepository.fetchTeams(any()) } coAnswers {
                requestedTeamIds += firstArg<List<String>>()
                Result.success(listOf(staleTeam))
            }
            coEvery { userRepository.fetchUsers(any(), any()) } coAnswers {
                requestedUserIds += firstArg<List<String>>()
                hydrationFinished = true
                Result.success(listOf(staleUser))
            }
            database.getEventDao.upsertEvent(newerEvent)
            database.getTeamDao.upsertTeamsWithRelations(
                listOf(cachedTeam, newerTeam),
            )
            database.getUserDataDao.upsertUsersData(
                listOf(cachedUser, newerUser),
            )
            database.getEventDao.upsertEventTeamCrossRefs(
                listOf(EventTeamCrossRef(teamId = newerTeamId, eventId = eventId)),
            )
            database.getUserDataDao.upsertUserEventCrossRefs(
                listOf(EventUserCrossRef(userId = newerUserId, eventId = eventId)),
            )
            val coordinator = EventParticipantSyncCoordinator(
                databaseService = database,
                detailRemoteGateway = EventDetailRemoteGateway(mockk<MvpApiClient>(relaxed = true)),
                roomStore = EventRoomStore(database),
                teamRepository = teamRepository,
                userRepository = userRepository,
            )

            try {
                coordinator.persistAcceptedMaintenanceRelations(
                    event = staleEvent,
                    preloadedTeams = listOf(cachedTeam),
                    preloadedUsers = listOf(cachedUser),
                )

                assertEquals(listOf(listOf(staleTeamId)), requestedTeamIds)
                assertEquals(listOf(listOf(staleUserId)), requestedUserIds)
                assertEquals(1, transactionCount)
                assertEquals(
                    listOf(newerTeamId),
                    database.getEventDao
                        .getEventTeamCrossRefsByEventId(eventId)
                        .map(EventTeamCrossRef::teamId),
                )
                assertEquals(
                    listOf(newerUserId),
                    database.getEventDao
                        .getEventUserCrossRefsByEventId(eventId)
                        .map(EventUserCrossRef::userId),
                )
                assertTrue(database.getTeamDao.getTeams(listOf(staleTeamId)).isEmpty())
                assertTrue(database.getUserDataDao.getUserDatasById(listOf(staleUserId)).isEmpty())
            } finally {
                realDatabase.close()
            }
        }

    @Test
    fun given_missing_accepted_relations_when_refresh_runs_then_room_observer_never_sees_partial_links() =
        kotlinx.coroutines.test.runTest {
            val eventId = "event-room-relation-atomic"
            val teamId = "team-room-relation-atomic"
            val userId = "user-room-relation-atomic"
            val event = Event(
                id = eventId,
                teamIds = listOf(teamId),
                userIds = listOf(userId),
            )
            val team = Team(captainId = userId).copy(
                id = teamId,
                name = "Atomic relation team",
                playerIds = listOf(userId),
            )
            val user = UserData().copy(id = userId)
            val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            database.getEventDao.upsertEvent(event)
            val teamRepository = mockk<ITeamRepository>()
            val userRepository = mockk<IUserRepository>()
            coEvery { teamRepository.getTeams(any()) } throws
                AssertionError("Accepted hydration must not call getTeams.")
            coEvery { userRepository.getUsers(any(), any()) } throws
                AssertionError("Accepted hydration must not call getUsers.")
            coEvery { teamRepository.fetchTeams(listOf(teamId)) } returns Result.success(listOf(team))
            coEvery {
                userRepository.fetchUsers(listOf(userId), any())
            } returns Result.success(listOf(user))
            val coordinator = EventParticipantSyncCoordinator(
                databaseService = database,
                detailRemoteGateway = EventDetailRemoteGateway(mockk<MvpApiClient>(relaxed = true)),
                roomStore = EventRoomStore(database),
                teamRepository = teamRepository,
                userRepository = userRepository,
            )

            try {
                coordinator.persistAcceptedMaintenanceRelations(event)
                val observed = requireNotNull(
                    database.getEventDao.getEventWithRelationsFlow(eventId).first(),
                )
                assertEquals(
                    setOf(teamId),
                    observed.teams.map(Team::id).toSet(),
                )
                assertEquals(
                    setOf(userId),
                    observed.players.map(UserData::id).toSet(),
                )
                assertEquals(
                    listOf(teamId),
                    database.getTeamDao.getTeams(listOf(teamId)).map(Team::id),
                )
                assertEquals(
                    listOf(userId),
                    database.getUserDataDao.getUserDatasById(listOf(userId)).map(UserData::id),
                )
                assertEquals(
                    listOf(teamId),
                    database.getEventDao
                        .getEventTeamCrossRefsByEventId(eventId)
                        .map(EventTeamCrossRef::teamId),
                )
                assertEquals(
                    listOf(userId),
                    database.getEventDao
                        .getEventUserCrossRefsByEventId(eventId)
                        .map(EventUserCrossRef::userId),
                )
            } finally {
                database.close()
            }
        }

    @Test
    fun given_missing_accepted_user_when_fetch_fails_then_typed_failure_precedes_room_writes() =
        kotlinx.coroutines.test.runTest {
            val eventId = "event-room-relation-fetch-failure"
            val userId = "user-room-relation-fetch-failure"
            val event = Event(id = eventId, userIds = listOf(userId))
            val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            database.getEventDao.upsertEvent(event)
            val teamRepository = mockk<ITeamRepository>(relaxed = true)
            val userRepository = mockk<IUserRepository>()
            coEvery { userRepository.getUsers(any(), any()) } throws
                AssertionError("Accepted hydration must not call getUsers.")
            coEvery {
                userRepository.fetchUsers(listOf(userId), any())
            } returns Result.failure(IllegalStateException("remote user failure"))
            val coordinator = EventParticipantSyncCoordinator(
                databaseService = database,
                detailRemoteGateway = EventDetailRemoteGateway(mockk<MvpApiClient>(relaxed = true)),
                roomStore = EventRoomStore(database),
                teamRepository = teamRepository,
                userRepository = userRepository,
            )

            try {
                val failure = runCatching {
                    coordinator.persistAcceptedMaintenanceRelations(event)
                }.exceptionOrNull()

                val hydrationFailure = requireNotNull(
                    failure as? AcceptedMaintenanceRelationHydrationException,
                )
                assertEquals(eventId, hydrationFailure.eventId)
                assertEquals("user", hydrationFailure.relationType)
                assertEquals(listOf(userId), hydrationFailure.missingIds)
                assertTrue(database.getUserDataDao.getUserDatasById(listOf(userId)).isEmpty())
                assertTrue(
                    database.getEventDao
                        .getEventUserCrossRefsByEventId(eventId)
                        .isEmpty(),
                )
            } finally {
                database.close()
            }
        }

    @Test
    fun given_room_backed_accepted_tournament_when_refresh_fails_then_all_rows_and_observed_state_are_unchanged() = kotlinx.coroutines.test.runTest {
        val fixture = eventRepositoryRoomPersistenceTournamentFixture()
        val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
            .allowMainThreadQueries()
            .build()
        var editorRequestCount = 0
        var refreshRequestCount = 0
        val engine = MockEngine { request ->
            when {
                request.url.encodedPath == "/api/events/editor" && request.method == HttpMethod.Post -> {
                    editorRequestCount += 1
                    respondJson(jsonMVP.encodeToString(fixture.proposal), HttpStatusCode.Accepted)
                }
                request.url.encodedPath == "/api/events/editor" && request.method == HttpMethod.Put -> {
                    editorRequestCount += 1
                    respondJson(jsonMVP.encodeToString(fixture.saved), HttpStatusCode.Created)
                }
                request.url.encodedPath == "/api/events/${fixture.eventId}" -> {
                    assertEquals(HttpMethod.Get, request.method)
                    refreshRequestCount += 1
                    if (refreshRequestCount == 1) {
                        respondJson(jsonMVP.encodeToString(fixture.eventResponse), HttpStatusCode.OK)
                    } else {
                        respondJson(
                            "{\"error\":\"deterministic refresh failure\"}",
                            HttpStatusCode.InternalServerError,
                        )
                    }
                }
                else -> error("Unexpected request ${request.method} ${request.url.encodedPath}")
            }
        }
        val http = HttpClient(engine) { configureMvpHttpClient() }
        val repository = eventRepositoryRoomPersistenceRepository(
            database = database,
            http = http,
            coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
        )
        try {
            repository.createEventEditor(fixture.command).getOrThrow()
            repository.acceptEventEditorProposal(
                createOperationId = fixture.command.createOperationId,
                proposalRevision = fixture.proposal.proposalRevision,
                draft = fixture.draft,
            ).getOrThrow()

            val refreshed = repository.getEvent(fixture.eventId).getOrThrow()
            val beforeFailure = repository.getCachedEventWithRelationsFlow(fixture.eventId).first().getOrThrow()
            val fieldsBeforeFailure = database.getFieldDao.getAllFields()
            val slotsBeforeFailure = database.getEventTimeSlotDao.getTimeSlotsByEventId(fixture.eventId)
            val matchesBeforeFailure = database.getMatchDao.getMatchesOfTournament(fixture.eventId)

            assertEquals(fixture.eventId, refreshed.id)
            val failedRefresh = repository.getEvent(fixture.eventId)
            val afterFailure = repository.getCachedEventWithRelationsFlow(fixture.eventId).first().getOrThrow()

            assertTrue(failedRefresh.isFailure)
            assertEquals(2, editorRequestCount)
            assertEquals(2, refreshRequestCount)
            assertEquals(beforeFailure.event, afterFailure.event)
            assertEquals(beforeFailure.timeSlotCacheEntries, afterFailure.timeSlotCacheEntries)
            assertEquals(fieldsBeforeFailure, database.getFieldDao.getAllFields())
            assertEquals(slotsBeforeFailure, database.getEventTimeSlotDao.getTimeSlotsByEventId(fixture.eventId))
            assertEquals(matchesBeforeFailure, database.getMatchDao.getMatchesOfTournament(fixture.eventId))
            assertEquals(
                fixture.phaseDivisionId.normalizeDivisionIdentifier(),
                afterFailure.event.divisionDetails
                    .first { it.id.normalizeDivisionIdentifier() == fixture.phaseDivisionId.normalizeDivisionIdentifier() }
                    .id
                    .normalizeDivisionIdentifier(),
            )
            assertEquals("PLACED", database.getMatchDao.getMatchesOfTournament(fixture.eventId).single().placementState)
            assertEquals(fixture.timeSlotId, afterFailure.timeSlotCacheEntries.single().slotId)
        } finally {
            repository.close()
            http.close()
            database.close()
        }
    }

    @Test
    fun given_match_write_fails_inside_accepted_tournament_when_room_transaction_rolls_back_then_all_rows_are_removed() = kotlinx.coroutines.test.runTest {
        val fixture = eventRepositoryRoomPersistenceTournamentFixture()
        val fetchedTeamId = "team-room-fetched-before-rollback"
        val fetchedUserId = "user-room-fetched-before-rollback"
        val fetchedTeam = Team(captainId = fetchedUserId).copy(
            id = fetchedTeamId,
            name = "Fetched relation team",
            playerIds = listOf(fetchedUserId),
        )
        val fetchedUser = UserData().copy(id = fetchedUserId)
        val acceptedSave = fixture.saved.copy(
            graph = requireNotNull(fixture.saved.graph).copy(
                event = fixture.eventResponse.copy(
                    teamIds = listOf(fetchedTeamId),
                    userIds = listOf(fetchedUserId),
                ),
            ),
        )
        val realDatabase = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
            .allowMainThreadQueries()
            .build()
        var matchWriteStarted = false
        val failingDatabase = EventRepositoryRoomPersistence_FailingMatchDatabase(
            delegate = realDatabase,
            onMatchWrite = { matchWriteStarted = true },
            onTransaction = {
                assertTrue(realDatabase.getTeamDao.getTeams(listOf(fetchedTeamId)).isEmpty())
                assertTrue(realDatabase.getUserDataDao.getUserDatasById(listOf(fetchedUserId)).isEmpty())
            },
        )
        val engine = MockEngine { request ->
            assertEquals("/api/events/editor", request.url.encodedPath)
            assertEquals(HttpMethod.Put, request.method)
            respondJson(jsonMVP.encodeToString(acceptedSave), HttpStatusCode.Created)
        }
        val http = HttpClient(engine) { configureMvpHttpClient() }
        val teamRepository = mockk<ITeamRepository>()
        val userRepository = mockk<IUserRepository>()
        every { userRepository.currentUser } returns MutableStateFlow(
            Result.failure<UserData>(IllegalStateException("No test user")),
        )
        coEvery { teamRepository.getTeams(any()) } throws
            AssertionError("Accepted hydration must not call getTeams.")
        coEvery { userRepository.getUsers(any(), any()) } throws
            AssertionError("Accepted hydration must not call getUsers.")
        coEvery { teamRepository.fetchTeams(listOf(fetchedTeamId)) } returns
            Result.success(listOf(fetchedTeam))
        coEvery { userRepository.fetchUsers(listOf(fetchedUserId), any()) } returns
            Result.success(listOf(fetchedUser))
        val repository = eventRepositoryRoomPersistenceRepository(
            database = failingDatabase,
            http = http,
            coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
            teamRepository = teamRepository,
            userRepository = userRepository,
        )
        try {
            val result = repository.acceptEventEditorProposal(
                createOperationId = fixture.command.createOperationId,
                proposalRevision = fixture.proposal.proposalRevision,
                draft = fixture.draft,
            )

            assertTrue(result.isFailure)
            assertTrue(matchWriteStarted)
            assertNull(realDatabase.getEventDao.getEventById(fixture.eventId))
            assertTrue(realDatabase.getFieldDao.getAllFields().isEmpty())
            assertTrue(realDatabase.getEventTimeSlotDao.getTimeSlotsByEventId(fixture.eventId).isEmpty())
            assertTrue(realDatabase.getMatchDao.getMatchesOfTournament(fixture.eventId).isEmpty())
            assertTrue(realDatabase.getTeamDao.getTeams(listOf(fetchedTeamId)).isEmpty())
            assertTrue(realDatabase.getUserDataDao.getUserDatasById(listOf(fetchedUserId)).isEmpty())
            assertTrue(
                realDatabase.getEventDao
                    .getEventTeamCrossRefsByEventId(fixture.eventId)
                    .isEmpty(),
            )
            assertTrue(
                realDatabase.getEventDao
                    .getEventUserCrossRefsByEventId(fixture.eventId)
                    .isEmpty(),
            )
        } finally {
            repository.close()
            http.close()
            realDatabase.close()
        }
    }

    @Test
    fun given_match_write_fails_inside_accepted_maintenance_when_room_transaction_rolls_back_then_all_rows_remain_unchanged() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val graphSource = requireNotNull(fixture.saved.graph)
            val graphMatches = fixture.saved.scheduleOutcome.matches
            val maintenanceEvent = graphSource.event.copy(
                coordinates = null,
                noFixedEndDateTime = false,
                scheduleEndConstraint = fixture.eventResponse.end,
                generatedScheduleEnd = fixture.eventResponse.end,
                teamSizeLimit = 2,
                restTimeMinutes = 0,
                waitListIds = emptyList(),
                freeAgentIds = emptyList(),
                teamIds = emptyList(),
                userIds = emptyList(),
                officialIds = emptyList(),
                staffingPriority = "BEST_AVAILABLE_COVERAGE",
                officialPositions = emptyList(),
                eventOfficials = emptyList(),
                autoCreatePointMatchIncidents = false,
                registrationCutoffHours = fixture.draft.participation.registrationCutoffHours,
                requiredTemplateIds = emptyList(),
                allowPaymentPlans = false,
                installmentCount = 0,
                installmentDueDates = emptyList(),
                installmentDueRelativeDays = emptyList(),
                installmentAmounts = emptyList(),
                allowTeamSplitDefault = false,
                splitLeaguePlayoffDivisions = false,
                divisions = emptyList(),
                divisionDetails = emptyList(),
                playoffDivisionDetails = emptyList(),
            )
            val canonicalEventJson = jsonMVP.encodeToJsonElement(
                EventApiDto.serializer(),
                maintenanceEvent,
            ).jsonObject
            val canonicalEvent = jsonMVP.decodeFromJsonElement(
                EventEditorMaintenanceGraphEventDto.serializer(),
                JsonObject(
                    canonicalEventJson.filterKeys { key ->
                        key !in setOf(
                            "address",
                            "affiliateUrl",
                            "automatedScheduling",
                            "registrationByDivisionType",
                            "timeZone",
                        )
                    } + mapOf(
                        "fields" to JsonArray(
                            canonicalEventJson["fields"]?.jsonArray?.map { field ->
                                JsonObject(
                                    field.jsonObject.filterKeys { key ->
                                        key !in setOf(
                                            "fieldNumber",
                                            "inUse",
                                            "location",
                                            "rentalSlotIds",
                                            "sportIds",
                                        )
                                    } + mapOf(
                                        "organizationId" to (
                                            field.jsonObject["organizationId"] ?: JsonNull
                                            ),
                                    ),
                                )
                            } ?: emptyList(),
                        ),
                        "timeSlots" to JsonArray(
                            canonicalEventJson["timeSlots"]?.jsonArray?.map { slot ->
                                JsonObject(
                                    slot.jsonObject + mapOf(
                                        "price" to (slot.jsonObject["price"] ?: JsonNull),
                                    ),
                                )
                            } ?: emptyList(),
                        ),
                    ),
                ),
            )
            val canonicalMatches = graphMatches.map { match ->
                jsonMVP.decodeFromJsonElement(
                    EventEditorMaintenanceGraphMatchDto.serializer(),
                    JsonObject(
                        jsonMVP.encodeToJsonElement(
                            EventEditorMatchProjectionDto.serializer(),
                            match,
                        ).jsonObject + mapOf(
                            "officialAssignments" to JsonArray(emptyList()),
                            "teamOfficialSeed" to JsonNull,
                        ),
                    ),
                )
            }
            val revisionBinding = EventEditorRevisionBindingDto(
                editorRevision = "room-maintenance-editor-revision",
                staffRevision = "room-maintenance-staff-revision",
                scheduleRevision = "room-maintenance-schedule-revision",
                rentalBookingRevision = "room-maintenance-rental-revision",
                fieldRevisions = mapOf(fixture.fieldId to "room-maintenance-field-revision"),
                timeSlotRevisions = mapOf(fixture.timeSlotId to "room-maintenance-slot-revision"),
                availabilityRevision = "room-maintenance-availability-revision",
            )
            val request = EventEditorMaintenanceRequestDto(
                contractVersion = 3,
                eventId = fixture.eventId,
                operation = EventEditorMaintenanceOperation.BUILD,
                operationId = "room-maintenance-operation",
                expectedRevisions = revisionBinding,
                participantCount = 4,
                includePlaceholderTeams = false,
            )
            val graph = EventEditorMaintenanceGraphDto(
                matches = graphMatches,
                event = maintenanceEvent,
                canonicalEvent = canonicalEvent,
                canonicalMatches = canonicalMatches,
            )
            val scheduleOutcome = EventEditorMaintenanceScheduleOutcomeDto(
                status = EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE,
                isComplete = true,
                matchCount = graphMatches.size,
                placedMatchCount = graphMatches.size,
                unplacedMatchCount = 0,
                matches = graphMatches,
                unscheduledMatches = emptyList(),
                affectedCompetitionPhases = emptyList(),
                warnings = emptyList(),
            )
            val accepted = EventEditorMaintenanceAcceptedResultDto(
                status = EventEditorMaintenanceResponseStatus.ACCEPTED,
                contractVersion = 3,
                eventId = fixture.eventId,
                operation = request.operation,
                operationId = request.operationId,
                proposalRevision = "room-maintenance-proposal-revision",
                revisionBinding = revisionBinding,
                graph = graph,
                protectedMatchIds = emptyList(),
                scheduleOutcome = scheduleOutcome,
                acceptanceOperationId = "room-maintenance-acceptance",
            )
            val realDatabase = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            var matchWriteStarted = false
            val failingDatabase = EventRepositoryRoomPersistence_FailingMatchDatabase(
                delegate = realDatabase,
                onMatchWrite = { matchWriteStarted = true },
            )
            val engine = MockEngine { httpRequest ->
                assertEquals("/api/events/${fixture.eventId}/schedule", httpRequest.url.encodedPath)
                assertEquals(HttpMethod.Put, httpRequest.method)
                respondJson(encodeRoomMaintenanceResponse(accepted), HttpStatusCode.OK)
            }
            val http = HttpClient(engine) { configureMvpHttpClient() }
            val repository = eventRepositoryRoomPersistenceRepository(
                database = failingDatabase,
                http = http,
                coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
            )
            try {
                advanceUntilIdle()
                val seededEvent = requireNotNull(
                    fixture.eventResponse.toEventOrNull(requireOwnerIdentity = false),
                ).copy(
                    requiredTemplateIds = listOf("canonical-event-template"),
                    eventTypeLocked = true,
                    eventTypeHasProtectedHistory = true,
                )
                val seededFields = fixture.eventResponse.fields.map { field ->
                    field.copy(name = "Canonical Room Court")
                }
                val seededSlots = fixture.eventResponse.timeSlots.mapIndexed { position, slot ->
                    slot.toTimeSlot(fixture.eventId).toEventTimeSlotCacheEntry(
                        eventId = fixture.eventId,
                        position = position,
                    )
                }
                val seededMatches = listOf(
                    requireNotNull(graphSource.matches.single().toMatchOrNull()),
                )
                realDatabase.getEventDao.upsertEvent(seededEvent)
                realDatabase.getFieldDao.upsertFields(seededFields)
                realDatabase.getEventTimeSlotDao.upsertTimeSlots(seededSlots)
                realDatabase.getMatchDao.upsertMatches(seededMatches)
                val beforeEvent = realDatabase.getEventDao.getEventById(fixture.eventId)
                val beforeFields = realDatabase.getFieldDao.getAllFields()
                val beforeSlots = realDatabase.getEventTimeSlotDao.getTimeSlotsByEventId(fixture.eventId)
                val beforeMatches = realDatabase.getMatchDao.getMatchesOfTournament(fixture.eventId)

                val result = repository.acceptEventScheduleMaintenance(
                    EventEditorAcceptMaintenanceProposalDto(
                        contractVersion = request.contractVersion,
                        eventId = request.eventId,
                        operation = request.operation,
                        operationId = request.operationId,
                        proposalRevision = accepted.proposalRevision,
                        acceptanceOperationId = accepted.acceptanceOperationId,
                    ),
                )

                assertTrue(result.isFailure, result.exceptionOrNull()?.stackTraceToString().orEmpty())
                val syncPending = assertIs<EventEditorMaintenanceAcceptedSyncPendingException>(
                    result.exceptionOrNull(),
                )
                assertEquals(
                    accepted.acceptanceOperationId,
                    syncPending.result.acceptanceOperationId,
                )
                assertEquals(beforeEvent, realDatabase.getEventDao.getEventById(fixture.eventId))
                assertEquals(beforeFields, realDatabase.getFieldDao.getAllFields())
                assertEquals(
                    beforeSlots,
                    realDatabase.getEventTimeSlotDao.getTimeSlotsByEventId(fixture.eventId),
                )
                assertEquals(
                    beforeMatches,
                    realDatabase.getMatchDao.getMatchesOfTournament(fixture.eventId),
                )
            } finally {
                repository.close()
                http.close()
                realDatabase.close()
            }
        }
    @Test
    fun given_rebuild_when_sync_retries_then_room_is_current() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val databaseName = "i41-sync-${java.util.UUID.randomUUID()}.db"
            var database = Room.databaseBuilder<MVPDatabaseService>(context, databaseName)
                .allowMainThreadQueries().build()
            var databaseService = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(database)
            val event = requireNotNull(fixture.eventResponse.toEventOrNull(requireOwnerIdentity = true))
            databaseService.getEventDao.upsertEvent(event)
            val request = roomMaintenanceRequest(
                fixture, EventEditorMaintenanceOperation.REBUILD, "older-rebuild",
            )
            val graph = EventEditorMaintenanceGraphDto(
                event = fixture.eventResponse,
                matches = listOf(roomMaintenanceProjection(fixture.eventId, "old-match", 1, "field-old")),
                canonicalEvent = roomMaintenanceGraphEvent(fixture.eventId, fieldId = "field-old"),
                canonicalMatches = listOf(roomMaintenanceGraphMatch(fixture.eventId, "old-match", 1, "field-old")),
            )
            val accepted = roomMaintenanceAcceptedResult(request, graph, protectedMatchIds = emptyList())
            val latest = EventDetailBootstrapResponseDto(
                event = fixture.eventResponse.copy(
                    end = "2026-08-15T20:00:00Z", fieldIds = listOf("field-current"),
                ),
                fields = listOf(Field(id = "field-current", name = "Current court")),
                matches = listOf(
                    MatchApiDto(
                        id = "current-placed", eventId = fixture.eventId, matchId = 2,
                        start = "2026-08-15T19:00:00Z", end = "2026-08-15T20:00:00Z",
                        fieldId = "field-current", placementState = "PLACED", locked = true,
                        team1Id = "team-left", team2Id = "team-right", teamOfficialId = "team-duty",
                        winnerNextMatchId = "current-unplaced",
                    ),
                    MatchApiDto(
                        id = "current-unplaced", eventId = fixture.eventId, matchId = 3,
                        start = null, end = null, fieldId = null, placementState = "UNPLACED",
                        previousLeftId = "current-placed",
                    ),
                ),
            )
            var failRefresh = true
            val http = HttpClient(MockEngine { httpRequest ->
                when (httpRequest.url.encodedPath) {
                    "/api/events/${fixture.eventId}/schedule" -> {
                        assertEquals(HttpMethod.Put, httpRequest.method)
                        respondJson(encodeRoomMaintenanceResponse(accepted), HttpStatusCode.OK)
                    }
                    "/api/events/${fixture.eventId}/detail" -> {
                        assertEquals(HttpMethod.Get, httpRequest.method)
                        assertEquals("true", httpRequest.url.parameters["manage"])
                        if (failRefresh) {
                            respondJson("{\"error\":\"Refresh failed\"}", HttpStatusCode.ServiceUnavailable)
                        } else {
                            respondJson(jsonMVP.encodeToString(latest), HttpStatusCode.OK)
                        }
                    }
                    else -> error("Unexpected request: ${httpRequest.url.encodedPath}")
                }
            }) { configureMvpHttpClient() }
            var repository = eventRepositoryRoomPersistenceRepository(
                databaseService, http, UnconfinedTestDispatcher(testScheduler),
            )
            try {
                repository.acceptEventScheduleMaintenance(EventEditorAcceptMaintenanceProposalDto(
                    contractVersion = request.contractVersion, eventId = request.eventId,
                    operation = request.operation, operationId = request.operationId,
                    proposalRevision = accepted.proposalRevision,
                    acceptanceOperationId = accepted.acceptanceOperationId,
                )).getOrThrow()
                val prior = repository.getCachedEventWithRelationsFlow(event.id).first().getOrThrow()
                assertTrue(repository.syncEventDetail(event, null, manage = true).isFailure)
                assertEquals(prior, repository.getCachedEventWithRelationsFlow(event.id).first().getOrThrow())
                assertEquals(listOf("old-match"), database.getMatchDao.getMatchesOfTournament(event.id).map(MatchMVP::id))

                failRefresh = false
                repository.syncEventDetail(event, null, manage = true).getOrThrow()
                repository.close()
                database.close()
                http.close()
                database = Room.databaseBuilder<MVPDatabaseService>(context, databaseName)
                    .allowMainThreadQueries().build()
                databaseService = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(database)
                val offlineHttp = HttpClient(MockEngine { error("Offline reload must use Room.") }) {
                    configureMvpHttpClient()
                }
                try {
                    repository = eventRepositoryRoomPersistenceRepository(
                        databaseService, offlineHttp, UnconfinedTestDispatcher(testScheduler),
                    )
                    val matches = com.razumly.mvp.eventDetail.data.MatchRepository(
                        api = MvpApiClient(offlineHttp, "http://example.test", EventRepositoryRoomPersistence_AuthTokenStore),
                        databaseService = databaseService, autoSyncOperations = false,
                    ).getCachedMatchesOfTournamentFlow(event.id).first().getOrThrow()
                        .map { it.match }.associateBy(MatchMVP::id)
                    assertEquals(setOf("current-placed", "current-unplaced"), matches.keys)
                    val placed = matches.getValue("current-placed")
                    assertEquals("field-current", placed.fieldId)
                    assertEquals("2026-08-15T19:00:00Z", placed.start?.toString())
                    assertEquals("team-left", placed.team1Id)
                    assertEquals("team-right", placed.team2Id)
                    assertEquals("team-duty", placed.teamOfficialId)
                    assertTrue(placed.locked)
                    assertEquals("current-unplaced", placed.winnerNextMatchId)
                    val unplaced = matches.getValue("current-unplaced")
                    assertEquals("UNPLACED", unplaced.placementState)
                    assertEquals("current-placed", unplaced.previousLeftId)
                    assertNull(unplaced.start)
                    assertNull(unplaced.end)
                    assertNull(unplaced.fieldId)
                    assertEquals("2026-08-15T20:00:00Z",
                        repository.getCachedEventWithRelationsFlow(event.id).first().getOrThrow().event.end.toString())
                } finally {
                    offlineHttp.close()
                }
            } finally {
                repository.close()
                http.close()
                database.close()
                context.deleteDatabase(databaseName)
            }
        }

    @Test
    fun given_complete_maintenance_when_cache_is_stale_then_room_uses_accepted_protected_match() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            val databaseService = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(database)
            val seededEvent = requireNotNull(
                fixture.eventResponse.toEventOrNull(requireOwnerIdentity = false),
            )
            val protectedMatch = roomMaintenanceProtectedMatch(
                eventId = fixture.eventId,
                id = "match-complete-protected",
                matchId = 1,
            )
            val unprotectedMatch = MatchMVP(
                id = "match-complete-unprotected",
                matchId = 2,
                eventId = fixture.eventId,
                fieldId = "field-local-unprotected",
                placementState = "PLACED",
            )
            databaseService.getEventDao.upsertEvent(seededEvent)
            databaseService.getMatchDao.upsertMatches(
                listOf(protectedMatch, unprotectedMatch),
            )

            val graphMatches = listOf(
                roomMaintenanceGraphMatch(
                    eventId = fixture.eventId,
                    id = protectedMatch.id,
                    matchId = protectedMatch.matchId,
                    fieldId = "field-graph",
                ).copy(
                    winnerNextMatchId = unprotectedMatch.id,
                    loserNextMatchId = unprotectedMatch.id,
                ),
                roomMaintenanceGraphMatch(
                    eventId = fixture.eventId,
                    id = unprotectedMatch.id,
                    matchId = unprotectedMatch.matchId,
                    fieldId = "field-graph",
                ).copy(
                    previousLeftId = protectedMatch.id,
                    previousRightId = protectedMatch.id,
                ),
            )
            val projections = graphMatches.map { match ->
                roomMaintenanceProjection(
                    eventId = match.eventId,
                    id = match.id,
                    matchId = match.matchId ?: error("Expected a Match id."),
                    fieldId = match.fieldId ?: error("Expected a field id."),
                )
            }
            val graph = EventEditorMaintenanceGraphDto(
                event = fixture.eventResponse,
                matches = projections,
                canonicalEvent = roomMaintenanceGraphEvent(
                    eventId = fixture.eventId,
                    fieldId = "field-graph",
                ),
                canonicalMatches = graphMatches,
            )
            val request = roomMaintenanceRequest(
                fixture = fixture,
                operation = EventEditorMaintenanceOperation.COMPLETE,
                operationId = "room-complete-protected-set",
            )
            val accepted = roomMaintenanceAcceptedResult(
                request = request,
                graph = graph,
                protectedMatchIds = listOf(protectedMatch.id),
            )
            val engine = MockEngine { httpRequest ->
                assertEquals("/api/events/${fixture.eventId}/schedule", httpRequest.url.encodedPath)
                assertEquals(HttpMethod.Put, httpRequest.method)
                respondJson(encodeRoomMaintenanceResponse(accepted), HttpStatusCode.OK)
            }
            val http = HttpClient(engine) { configureMvpHttpClient() }
            val repository = eventRepositoryRoomPersistenceRepository(
                database = databaseService,
                http = http,
                coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
            )
            try {
                repository.acceptEventScheduleMaintenance(
                    EventEditorAcceptMaintenanceProposalDto(
                        contractVersion = request.contractVersion,
                        eventId = request.eventId,
                        operation = request.operation,
                        operationId = request.operationId,
                        proposalRevision = accepted.proposalRevision,
                        acceptanceOperationId = accepted.acceptanceOperationId,
                    ),
                ).getOrThrow()

                val persistedMatches = database.getMatchDao.getMatchesOfTournament(fixture.eventId)
                    .associateBy(MatchMVP::id)
                val persistedProtected = persistedMatches.getValue(protectedMatch.id)
                assertAcceptedRoomMaintenanceMatch(persistedProtected)
                assertEquals(unprotectedMatch.id, persistedProtected.winnerNextMatchId)
                assertEquals(unprotectedMatch.id, persistedProtected.loserNextMatchId)

                val persistedUnprotected = persistedMatches.getValue(unprotectedMatch.id)
                assertEquals("field-graph", persistedUnprotected.fieldId)
                assertEquals("PLACED", persistedUnprotected.placementState)
                assertEquals("2026-08-15T08:00:00Z", persistedUnprotected.start?.toString())
                assertEquals("2026-08-15T08:45:00Z", persistedUnprotected.end?.toString())
                assertEquals(protectedMatch.id, persistedUnprotected.previousLeftId)
                assertEquals(protectedMatch.id, persistedUnprotected.previousRightId)
                assertFalse(persistedUnprotected.locked)
            } finally {
                repository.close()
                http.close()
                database.close()
            }
        }

    @Test
    fun given_rebuild_maintenance_when_cache_is_stale_then_room_uses_accepted_protected_match() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            val databaseService = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(database)
            val seededEvent = requireNotNull(
                fixture.eventResponse.toEventOrNull(requireOwnerIdentity = false),
            )
            val protectedMatch = roomMaintenanceProtectedMatch(
                eventId = fixture.eventId,
                id = "match-rebuild-protected",
                matchId = 1,
            )
            val staleMatch = MatchMVP(
                id = "match-rebuild-stale",
                matchId = 2,
                eventId = fixture.eventId,
                fieldId = "field-local-stale",
                placementState = "PLACED",
            )
            databaseService.getEventDao.upsertEvent(seededEvent)
            databaseService.getMatchDao.upsertMatches(
                listOf(protectedMatch, staleMatch),
            )

            val generatedMatchId = "match-rebuild-generated"
            val graphMatches = listOf(
                roomMaintenanceGraphMatch(
                    eventId = fixture.eventId,
                    id = protectedMatch.id,
                    matchId = protectedMatch.matchId,
                    fieldId = "field-graph",
                ).copy(
                    winnerNextMatchId = generatedMatchId,
                    loserNextMatchId = generatedMatchId,
                ),
                roomMaintenanceGraphMatch(
                    eventId = fixture.eventId,
                    id = generatedMatchId,
                    matchId = 3,
                    fieldId = "field-graph",
                ).copy(
                    previousLeftId = protectedMatch.id,
                    previousRightId = protectedMatch.id,
                ),
            )
            val projections = graphMatches.map { match ->
                roomMaintenanceProjection(
                    eventId = match.eventId,
                    id = match.id,
                    matchId = match.matchId ?: error("Expected a Match id."),
                    fieldId = match.fieldId ?: error("Expected a field id."),
                )
            }
            val graph = EventEditorMaintenanceGraphDto(
                event = fixture.eventResponse,
                matches = projections,
                canonicalEvent = roomMaintenanceGraphEvent(
                    eventId = fixture.eventId,
                    fieldId = "field-graph",
                ),
                canonicalMatches = graphMatches,
            )
            val request = roomMaintenanceRequest(
                fixture = fixture,
                operation = EventEditorMaintenanceOperation.REBUILD,
                operationId = "room-rebuild-protected-set",
            )
            val accepted = roomMaintenanceAcceptedResult(
                request = request,
                graph = graph,
                protectedMatchIds = listOf(protectedMatch.id),
            )
            val engine = MockEngine { httpRequest ->
                assertEquals("/api/events/${fixture.eventId}/schedule", httpRequest.url.encodedPath)
                assertEquals(HttpMethod.Put, httpRequest.method)
                respondJson(encodeRoomMaintenanceResponse(accepted), HttpStatusCode.OK)
            }
            val http = HttpClient(engine) { configureMvpHttpClient() }
            val repository = eventRepositoryRoomPersistenceRepository(
                database = databaseService,
                http = http,
                coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
            )
            try {
                repository.acceptEventScheduleMaintenance(
                    EventEditorAcceptMaintenanceProposalDto(
                        contractVersion = request.contractVersion,
                        eventId = request.eventId,
                        operation = request.operation,
                        operationId = request.operationId,
                        proposalRevision = accepted.proposalRevision,
                        acceptanceOperationId = accepted.acceptanceOperationId,
                    ),
                ).getOrThrow()

                val persistedMatches = database.getMatchDao.getMatchesOfTournament(fixture.eventId)
                    .associateBy(MatchMVP::id)
                val persistedProtected = persistedMatches.getValue(protectedMatch.id)
                assertAcceptedRoomMaintenanceMatch(persistedProtected)
                assertEquals(generatedMatchId, persistedProtected.winnerNextMatchId)
                assertEquals(generatedMatchId, persistedProtected.loserNextMatchId)
                assertFalse(persistedMatches.containsKey(staleMatch.id))

                val persistedGenerated = persistedMatches.getValue(generatedMatchId)
                assertEquals("field-graph", persistedGenerated.fieldId)
                assertEquals("PLACED", persistedGenerated.placementState)
                assertEquals("2026-08-15T08:00:00Z", persistedGenerated.start?.toString())
                assertEquals("2026-08-15T08:45:00Z", persistedGenerated.end?.toString())
                assertEquals(protectedMatch.id, persistedGenerated.previousLeftId)
                assertEquals(protectedMatch.id, persistedGenerated.previousRightId)
                assertFalse(persistedGenerated.locked)
            } finally {
                repository.close()
                http.close()
                database.close()
            }
        }

    @Test
    fun given_accepted_canonical_division_graph_when_room_refreshes_then_league_settings_and_metadata_survive() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            val databaseService = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(database)
            val seededEvent = requireNotNull(
                fixture.eventResponse.toEventOrNull(requireOwnerIdentity = false),
            )
            val canonicalDivision = seededEvent.divisionDetails.first { detail ->
                detail.id.normalizeDivisionIdentifier() ==
                    "division-open".normalizeDivisionIdentifier()
            }.copy(
                key = "canonical-open",
                name = "Cached canonical division",
                price = 123,
                maxParticipants = 4,
                allowPaymentPlans = true,
                installmentCount = 2,
                installmentDueDates = listOf("2026-08-10", "2026-08-12"),
                installmentDueRelativeDays = listOf(5, 3),
                installmentAmounts = listOf(60, 63),
                skillDivisionTypeId = "canonical-skill",
                ageDivisionTypeId = "canonical-age",
                ageCutoffDate = "2010-01-01",
                fieldIds = listOf("field-cached"),
                phaseSettings = mapOf(
                    "LEAGUE" to DivisionPhaseSettingsMVP(segmentLengthMinutes = 17),
                ),
            )
            val teamId = "team-room-canonical-metadata"
            val cachedPlayerId = "user-room-canonical-cached"
            val graphPlayerId = "user-room-canonical-graph"
            val cachedTeam = Team(captainId = cachedPlayerId).copy(
                id = teamId,
                division = "Cached canonical team division",
                name = "Cached canonical team",
                kind = "CACHED",
                playerIds = listOf(cachedPlayerId),
            )
            val graphTeam = EventEditorMaintenanceGraphTeamDto(
                id = teamId,
                captainId = graphPlayerId,
                division = "Graph authoritative team division",
                kind = "GRAPH",
                name = "Graph authoritative team",
                playerIds = listOf(graphPlayerId),
                players = emptyList(),
                playerRegistrations = emptyList(),
            )
            databaseService.getUserDataDao.upsertUsersWithRelations(
                listOf(
                    UserData().copy(id = cachedPlayerId),
                    UserData().copy(id = graphPlayerId),
                ),
            )
            databaseService.getTeamDao.upsertTeamsWithRelations(listOf(cachedTeam))

            val cachedEvent = seededEvent.copy(
                divisions = listOf(canonicalDivision.id),
                divisionDetails = listOf(canonicalDivision),
                teamIds = listOf(teamId),
            )
            databaseService.getEventDao.upsertEvent(cachedEvent)

            val graphDivision = EventEditorMaintenanceGraphDivisionDto(
                id = canonicalDivision.id,
                name = "Graph authoritative division",
                kind = "LEAGUE",
                role = "SOURCE",
                phase = "LEAGUE",
                sourceDivisionId = "",
                isSystemGenerated = false,
                phaseSettings = emptyMap(),
                teamIds = emptyList(),
                playoffTeamCount = 0,
                playoffPlacementDivisionIds = emptyList(),
                standingsOverrides = emptyMap(),
                standingsConfirmedAt = "",
                standingsConfirmedBy = "",
                playoffConfig = roomMaintenanceGraphPlayoffConfig(),
                leagueConfig = EventEditorMaintenanceGraphLeagueConfigDto(
                    gamesPerOpponent = 3,
                    restTimeMinutes = 11,
                    usesSets = true,
                    matchDurationMinutes = 30,
                    setDurationMinutes = 5,
                    setsPerMatch = 3,
                    pointsToVictory = listOf(21.9, 15.4),
                ),
            )
            val graphMatch = roomMaintenanceGraphMatch(
                eventId = fixture.eventId,
                id = "match-canonical-settings",
                matchId = 1,
                fieldId = "field-canonical-graph",
            )
            val graph = EventEditorMaintenanceGraphDto(
                event = fixture.eventResponse,
                matches = listOf(
                    roomMaintenanceProjection(
                        eventId = fixture.eventId,
                        id = graphMatch.id,
                        matchId = graphMatch.matchId ?: error("Expected a Match id."),
                        fieldId = graphMatch.fieldId ?: error("Expected a field id."),
                    ),
                ),
                canonicalEvent = roomMaintenanceGraphEvent(
                    eventId = fixture.eventId,
                    divisionDetails = listOf(graphDivision),
                    fieldId = "field-canonical-graph",
                    fieldDivisions = listOf(canonicalDivision.id),
                ).copy(
                    teamIds = listOf(teamId),
                    teams = listOf(graphTeam),
                ),
                canonicalMatches = listOf(graphMatch),
            )
            val request = roomMaintenanceRequest(
                fixture = fixture,
                operation = EventEditorMaintenanceOperation.BUILD,
                operationId = "room-canonical-division-settings",
            )
            val accepted = roomMaintenanceAcceptedResult(
                request = request,
                graph = graph,
                protectedMatchIds = emptyList(),
            )
            val refreshEvent = fixture.eventResponse.copy(
                teamIds = listOf(teamId),
                divisions = listOf(canonicalDivision.id),
                price = canonicalDivision.price,
                allowPaymentPlans = canonicalDivision.allowPaymentPlans,
                installmentCount = canonicalDivision.installmentCount,
                installmentDueDates = canonicalDivision.installmentDueDates,
                installmentDueRelativeDays = canonicalDivision.installmentDueRelativeDays,
                installmentAmounts = canonicalDivision.installmentAmounts,
                divisionDetails = listOf(
                    canonicalDivision.copy(
                        sourceDivisionId = graphDivision.sourceDivisionId,
                        kind = graphDivision.kind,
                        isSystemGenerated = graphDivision.isSystemGenerated,
                        name = graphDivision.name,
                        teamIds = graphDivision.teamIds,
                        playoffTeamCount = graphDivision.playoffTeamCount,
                        playoffPlacementDivisionIds = graphDivision.playoffPlacementDivisionIds,
                        fieldIds = listOf("field-canonical-graph"),
                        gamesPerOpponent = graphDivision.leagueConfig?.gamesPerOpponent,
                        restTimeMinutes = graphDivision.leagueConfig?.restTimeMinutes,
                        usesSets = graphDivision.leagueConfig?.usesSets,
                        matchDurationMinutes = graphDivision.leagueConfig?.matchDurationMinutes,
                        setDurationMinutes = graphDivision.leagueConfig?.setDurationMinutes,
                        setsPerMatch = graphDivision.leagueConfig?.setsPerMatch,
                        pointsToVictory = graphDivision.leagueConfig?.pointsToVictory
                            ?.map(Double::toInt)
                            .orEmpty(),
                    ),
                ),
            )
            var requestCount = 0
            val engine = MockEngine { httpRequest ->
                requestCount += 1
                when {
                    httpRequest.url.encodedPath == "/api/events/${fixture.eventId}/schedule" &&
                        httpRequest.method == HttpMethod.Put -> {
                        respondJson(encodeRoomMaintenanceResponse(accepted), HttpStatusCode.OK)
                    }
                    httpRequest.url.encodedPath == "/api/events/${fixture.eventId}" &&
                        httpRequest.method == HttpMethod.Get -> {
                        respondJson(jsonMVP.encodeToString(refreshEvent), HttpStatusCode.OK)
                    }
                    else -> error("Unexpected request ${httpRequest.method} ${httpRequest.url.encodedPath}")
                }
            }
            val http = HttpClient(engine) { configureMvpHttpClient() }
            val repository = eventRepositoryRoomPersistenceRepository(
                database = databaseService,
                http = http,
                coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
            )
            try {
                repository.acceptEventScheduleMaintenance(
                    EventEditorAcceptMaintenanceProposalDto(
                        contractVersion = request.contractVersion,
                        eventId = request.eventId,
                        operation = request.operation,
                        operationId = request.operationId,
                        proposalRevision = accepted.proposalRevision,
                        acceptanceOperationId = accepted.acceptanceOperationId,
                    ),
                ).getOrThrow()

                val persistedBeforeRefresh = requireNotNull(
                    database.getEventDao.getEventById(fixture.eventId),
                )
                val detailBeforeRefresh = persistedBeforeRefresh.divisionDetails.single()
                assertEquals("Graph authoritative division", detailBeforeRefresh.name)
                assertEquals("canonical-open".normalizeDivisionIdentifier(), detailBeforeRefresh.key)
                assertEquals(123, detailBeforeRefresh.price)
                assertEquals(4, detailBeforeRefresh.maxParticipants)
                assertEquals(true, detailBeforeRefresh.allowPaymentPlans)
                assertEquals("canonical-skill".normalizeDivisionIdentifier(), detailBeforeRefresh.skillDivisionTypeId)
                assertEquals("canonical-age".normalizeDivisionIdentifier(), detailBeforeRefresh.ageDivisionTypeId)
                assertEquals(listOf("field-canonical-graph"), detailBeforeRefresh.fieldIds)
                assertEquals(
                    mapOf("LEAGUE" to DivisionPhaseSettingsMVP(segmentLengthMinutes = 17)),
                    detailBeforeRefresh.phaseSettings,
                )
                assertEquals(3, detailBeforeRefresh.gamesPerOpponent)
                assertEquals(11, detailBeforeRefresh.restTimeMinutes)
                assertEquals(true, detailBeforeRefresh.usesSets)
                assertEquals(30, detailBeforeRefresh.matchDurationMinutes)
                assertEquals(5, detailBeforeRefresh.setDurationMinutes)
                assertEquals(3, detailBeforeRefresh.setsPerMatch)
                assertEquals(listOf(21, 15), detailBeforeRefresh.pointsToVictory)
                val teamBeforeRefresh = database.getTeamDao.getTeams(listOf(teamId)).single()
                assertEquals("Graph authoritative team division", teamBeforeRefresh.division)
                assertEquals("Graph authoritative team", teamBeforeRefresh.name)
                assertEquals(graphPlayerId, teamBeforeRefresh.captainId)
                assertEquals(listOf(graphPlayerId), teamBeforeRefresh.playerIds)

                val refreshed = repository.getEvent(fixture.eventId).getOrThrow()
                val persistedAfterRefresh = requireNotNull(
                    database.getEventDao.getEventById(fixture.eventId),
                )
                assertEquals(2, requestCount)
                assertEquals(detailBeforeRefresh, refreshed.divisionDetails.single())
                assertEquals(
                    detailBeforeRefresh,
                    persistedAfterRefresh.divisionDetails.single(),
                )
                assertEquals(
                    teamBeforeRefresh,
                    database.getTeamDao.getTeams(listOf(teamId)).single(),
                )
            } finally {
                repository.close()
                http.close()
                database.close()
            }
        }

    @Test
    fun given_generated_graph_team_not_in_event_team_ids_when_accepted_then_room_keeps_team_and_match_ref_without_event_cross_ref() =
        kotlinx.coroutines.test.runTest {
            val fixture = eventRepositoryRoomPersistenceTournamentFixture()
            val generatedTeamId = "generated-placeholder-room"
            val cachedTeamId = "cached-non-graph-room"
            val generatedTeam = EventEditorMaintenanceGraphTeamDto(
                id = generatedTeamId,
                captainId = "",
                division = "division-open",
                kind = "PLACEHOLDER",
                name = "Generated Placeholder",
                playerIds = emptyList(),
                players = emptyList(),
                playerRegistrations = emptyList(),
            )
            val cachedTeam = Team(captainId = "").copy(
                id = cachedTeamId,
                name = "Cached non-graph team",
                kind = "TEAM",
            )
            val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()
            val seededEvent = requireNotNull(
                fixture.eventResponse.toEventOrNull(requireOwnerIdentity = false),
            ).copy(teamIds = listOf(cachedTeamId))
            database.getEventDao.upsertEvent(seededEvent)
            database.getTeamDao.upsertTeamsWithRelations(listOf(cachedTeam))
            database.getEventDao.upsertEventTeamCrossRefs(
                listOf(
                    EventTeamCrossRef(
                        eventId = fixture.eventId,
                        teamId = cachedTeamId,
                    ),
                ),
            )

            val graphMatchBase = roomMaintenanceGraphMatch(
                eventId = fixture.eventId,
                id = "match-generated-placeholder",
                matchId = 1,
                fieldId = fixture.fieldId,
            )
            val graphMatch = graphMatchBase.copy(
                team1Id = generatedTeamId,
                team1 = generatedTeam,
            )
            val graphProjection = roomMaintenanceProjection(
                eventId = fixture.eventId,
                id = graphMatch.id,
                matchId = graphMatch.matchId ?: error("Expected a Match id."),
                fieldId = fixture.fieldId,
            ).copy(team1Id = generatedTeamId)
            val graph = EventEditorMaintenanceGraphDto(
                event = fixture.eventResponse.copy(teamIds = emptyList()),
                matches = listOf(graphProjection),
                canonicalEvent = roomMaintenanceGraphEvent(
                    eventId = fixture.eventId,
                    fieldId = fixture.fieldId,
                ).copy(
                    teams = listOf(generatedTeam),
                ),
                canonicalMatches = listOf(graphMatch),
            )
            val request = roomMaintenanceRequest(
                fixture = fixture,
                operation = EventEditorMaintenanceOperation.BUILD,
                operationId = "room-generated-team",
            )
            val accepted = roomMaintenanceAcceptedResult(
                request = request,
                graph = graph,
                protectedMatchIds = emptyList(),
            )
            val engine = MockEngine { httpRequest ->
                assertEquals(
                    "/api/events/${fixture.eventId}/schedule",
                    httpRequest.url.encodedPath,
                )
                assertEquals(HttpMethod.Put, httpRequest.method)
                respondJson(encodeRoomMaintenanceResponse(accepted), HttpStatusCode.OK)
            }
            val http = HttpClient(engine) { configureMvpHttpClient() }
            val repository = eventRepositoryRoomPersistenceRepository(
                database = database,
                http = http,
                coroutineDispatcher = UnconfinedTestDispatcher(testScheduler),
            )
            try {
                repository.acceptEventScheduleMaintenance(
                    EventEditorAcceptMaintenanceProposalDto(
                        contractVersion = request.contractVersion,
                        eventId = request.eventId,
                        operation = request.operation,
                        operationId = request.operationId,
                        proposalRevision = accepted.proposalRevision,
                        acceptanceOperationId = accepted.acceptanceOperationId,
                    ),
                ).getOrThrow()

                val persistedTeams = database.getTeamDao.getTeams(
                    listOf(cachedTeamId, generatedTeamId),
                )
                assertEquals(
                    setOf(cachedTeamId, generatedTeamId),
                    persistedTeams.map(Team::id).toSet(),
                )
                assertEquals(
                    "Generated Placeholder",
                    persistedTeams.single { it.id == generatedTeamId }.name,
                )
                assertEquals(
                    generatedTeamId,
                    database.getMatchDao
                        .getMatchesOfTournament(fixture.eventId)
                        .single()
                        .team1Id,
                )
                assertTrue(
                    database.getEventDao
                        .getEventTeamCrossRefsByEventId(fixture.eventId)
                        .isEmpty(),
                )
            } finally {
                repository.close()
                http.close()
                database.close()
            }
        }

    @Test
    fun given_site_reflow_when_room_refresh_succeeds_then_time_and_assignment_changes_stay_distinct() =
        kotlinx.coroutines.test.runTest {
            for (assignmentOnly in listOf(false, true)) verifyReflowRoom(assignmentOnly, false, testScheduler)
            verifyReflowRoom(true, false, testScheduler, namedOfficial = true)
        }

    @Test
    fun given_site_reflow_when_match_save_fails_then_the_room_transaction_rolls_back() =
        kotlinx.coroutines.test.runTest {
            verifyReflowRoom(false, true, testScheduler)
        }

    private suspend fun verifyReflowRoom(
        assignmentOnly: Boolean,
        failSave: Boolean,
        scheduler: kotlinx.coroutines.test.TestCoroutineScheduler,
        namedOfficial: Boolean = false,
    ) {
        val eventId = if (namedOfficial) "reflow-named" else if (assignmentOnly) "reflow-assignment" else "reflow-time"
        val request = ScheduleReflowRequestDto(1, eventId, listOf("$eventId:${if (assignmentOnly) 2 else 1}"),
            "fixture-revision-1", ScheduleReflowFieldPolicy.KEEP_ASSIGNED_FIELDS)
        val responseJson = reflowClientToSiteResult(request)
        val response = jsonMVP.decodeFromString<ScheduleReflowResultDto>(responseJson)
        response.validateFor(eventId)
        assertEquals(assignmentOnly, response.isAssignmentOnly)
        assertEquals(!assignmentOnly, response.hasPlacementChanges)
        val graph = requireNotNull(response.graph)
        val expectedMatches = requireNotNull(graph.event.matches).map {
            val match = requireNotNull(it.toMatchOrNull())
            match.copy(officialId = match.officialIds.firstOrNull { assignment -> assignment.userId != null }?.userId)
        }
        val beforeMatches = expectedMatches.map { match ->
            val placement = response.placementChanges.find { it.matchId == match.id }?.before
            val assignments = response.assignmentChanges.find { it.matchId == match.id }?.before
            val primary = assignments?.officialAssignments?.firstOrNull { it.userId != null }
            match.copy(start = placement?.start?.let(Instant::parse) ?: match.start,
                end = placement?.end?.let(Instant::parse) ?: match.end, fieldId = placement?.fieldId ?: match.fieldId,
                teamOfficialId = if (assignments != null) assignments.teamOfficialId else match.teamOfficialId,
                officialId = if (assignments != null) primary?.userId else match.officialId,
                officialCheckedIn = if (assignments != null) primary?.checkedIn == true else match.officialCheckedIn,
                officialIds = assignments?.officialAssignments?.map { it.toModel() } ?: match.officialIds)
        }
        val realDatabase = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context).allowMainThreadQueries().build()
        var transactions = 0
        var matchWrites = 0
        val database = object : DatabaseService by realDatabase {
            override suspend fun <R> withTransaction(block: suspend () -> R): R {
                transactions += 1
                return realDatabase.withTransaction(block)
            }
            override val getMatchDao = object : MatchDao by realDatabase.getMatchDao {
                override suspend fun upsertMatches(matches: List<MatchMVP>) {
                    matchWrites += 1
                    realDatabase.getMatchDao.upsertMatches(matches)
                    if (failSave) error("injected Reflow cache failure")
                }
            }
        }
        val http = HttpClient(MockEngine { httpRequest ->
            assertEquals("/api/events/$eventId/schedule/reflow", httpRequest.url.encodedPath)
            respondJson(responseJson, HttpStatusCode.OK)
        }) { configureMvpHttpClient() }
        val repository = eventRepositoryRoomPersistenceRepository(database, http, UnconfinedTestDispatcher(scheduler))
        try {
            scheduler.advanceUntilIdle()
            val event = requireNotNull(graph.event.toEventOrNull(requireOwnerIdentity = false)).copy(end = Instant.parse("2026-09-04T11:00:00Z"))
            realDatabase.getEventDao.upsertEvent(event)
            realDatabase.getMatchDao.upsertMatches(beforeMatches)
            realDatabase.getFieldDao.upsertFields(graph.event.fields)
            val teams = graph.event.teams.map { requireNotNull(it.toTeamOrNull()) }
            realDatabase.getTeamDao.upsertTeamsWithRelations(teams)
            val userIds = (listOf(event.hostId) + teams.map { it.captainId }
                + expectedMatches.flatMap { it.officialIds.mapNotNull { assignment -> assignment.userId } })
                .distinct().filter(String::isNotBlank)
            realDatabase.getUserDataDao.upsertUsersData(userIds.map { UserData().copy(id = it, firstName = "Alex", lastName = "Morgan", userName = it) })
            transactions = 0
            val result = repository.reflowEventSchedule(request)
            assertEquals(1, transactions)
            assertEquals(1, matchWrites)
            if (failSave) {
                assertIs<ScheduleReflowSyncPending>(result.exceptionOrNull())
                assertEquals(beforeMatches.sortedBy { it.id }, realDatabase.getMatchDao.getMatchesOfTournament(eventId).sortedBy { it.id })
                assertEquals(event.end, realDatabase.getEventDao.getEventById(eventId)?.end)
            } else {
                assertEquals(response.status, result.getOrThrow().status)
                assertEquals(expectedMatches.sortedBy { it.id }, realDatabase.getMatchDao.getMatchesOfTournament(eventId).sortedBy { it.id })
                assertEquals(Instant.parse(graph.event.end!!), realDatabase.getEventDao.getEventById(eventId)?.end)
            }
        } finally {
            repository.close()
            http.close()
            realDatabase.close()
        }
    }

    @Test
    fun given_unchanged_reflow_when_received_then_room_has_no_transaction_or_rewrite() =
        kotlinx.coroutines.test.runTest {
            for (status in listOf(ScheduleReflowStatus.NO_OP, ScheduleReflowStatus.INFEASIBLE,
                ScheduleReflowStatus.SEARCH_LIMIT, ScheduleReflowStatus.STALE)) {
                val fixture = eventRepositoryRoomPersistenceTournamentFixture()
                val realDatabase = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context).allowMainThreadQueries().build()
                var transactions = 0
                val database = EventRepositoryRoomPersistence_NoStartupCleanupDatabase(realDatabase) { transactions += 1 }
                val response = ScheduleReflowResultDto(1, fixture.eventId, status, "revision-1",
                    listOf("match-room-tournament"), emptyList(), emptyList(), emptyList(), emptyList(), 0, null)
                val http = HttpClient(MockEngine { request ->
                    assertEquals("/api/events/${fixture.eventId}/schedule/reflow", request.url.encodedPath)
                    assertEquals(HttpMethod.Post, request.method)
                    respondJson(roomMaintenanceResponseJson.encodeToString(response), HttpStatusCode.OK)
                }) { configureMvpHttpClient() }
                val repository = eventRepositoryRoomPersistenceRepository(database, http, UnconfinedTestDispatcher(testScheduler))
                try {
                    advanceUntilIdle()
                    val event = requireNotNull(fixture.eventResponse.toEventOrNull(requireOwnerIdentity = false))
                    val matches = requireNotNull(fixture.saved.graph).matches.map { requireNotNull(it.toMatchOrNull()) }
                    realDatabase.getEventDao.upsertEvent(event)
                    realDatabase.getMatchDao.upsertMatches(matches)
                    transactions = 0
                    val result = repository.reflowEventSchedule(ScheduleReflowRequestDto(1, fixture.eventId,
                        listOf("match-room-tournament"), "revision-1", ScheduleReflowFieldPolicy.KEEP_ASSIGNED_FIELDS))
                    if (status == ScheduleReflowStatus.NO_OP) assertEquals(status, result.getOrThrow().status)
                    else assertEquals(status, assertIs<ScheduleReflowFailure>(result.exceptionOrNull()).result.status)
                    assertEquals(0, transactions)
                    assertEquals(matches, realDatabase.getMatchDao.getMatchesOfTournament(fixture.eventId))
                    assertEquals(event.end, realDatabase.getEventDao.getEventById(fixture.eventId)?.end)
                } finally {
                    repository.close()
                    http.close()
                    realDatabase.close()
                }
            }
        }
}

private fun reflowClientToSiteResult(request: ScheduleReflowRequestDto): String =
    runSiteContract(
        site = clientContractSiteDirectory(),
        script = "scripts/test-schedule-reflow-contract.ts",
        input = jsonMVP.encodeToString(request),
    )

private fun eventRepositoryRoomPersistenceRepository(
    database: DatabaseService,
    http: HttpClient,
    coroutineDispatcher: CoroutineDispatcher,
    teamRepository: ITeamRepository = mockk(relaxed = true),
    userRepository: IUserRepository = mockk(relaxed = true),
    currentUserState: MutableStateFlow<Result<UserData>> = MutableStateFlow(
        Result.failure(IllegalStateException("No test user")),
    ),
    startupAuthState: MutableStateFlow<StartupAuthState> = MutableStateFlow(StartupAuthState.Unauthenticated),
    api: MvpApiClient = MvpApiClient(http, "http://example.test", EventRepositoryRoomPersistence_AuthTokenStore),
): EventRepository {
    every { userRepository.currentUser } returns currentUserState
    every { userRepository.startupAuthState } returns startupAuthState
    return EventRepository(
        databaseService = database,
        api = api,
        teamRepository = teamRepository,
        userRepository = userRepository,
        coroutineDispatcher = coroutineDispatcher,
    )
}

private fun io.ktor.client.engine.mock.MockRequestHandleScope.respondJson(
    content: String,
    status: HttpStatusCode,
) = respond(
    content = content,
    status = status,
    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
)

private fun eventRepositoryRoomPersistenceTournamentFixture(): EventRepositoryRoomPersistence_TournamentFixture {
    val eventId = "event-room-tournament"
    val fieldId = "field-room-tournament"
    val timeSlotId = "slot-room-tournament"
    val phaseDivisionId = "division-phase-room-pool"
    val start = "2026-08-15T08:00:00Z"
    val end = "2026-08-15T18:00:00Z"
    val field = EventEditorFieldDto(
        id = fieldId,
        name = "Tournament Court",
        location = "Room Test Center",
        address = "1 Room Way",
        sportIds = listOf("Indoor Volleyball"),
    )
    val timeSlot = EventEditorTimeSlotDto(
        id = timeSlotId,
        eventId = eventId,
        dayOfWeek = 6,
        daysOfWeek = listOf(6),
        startTimeMinutes = 480,
        endTimeMinutes = 1080,
        startDate = start,
        endDate = end,
        start = start,
        end = end,
        timeZone = "UTC",
        scheduledFieldId = fieldId,
        scheduledFieldIds = listOf(fieldId),
        divisions = listOf("division-open"),
    )
    val division = EventEditorDivisionDetailDto(
        id = "division-open",
        key = "open",
        name = "Open Pool",
        kind = "LEAGUE",
        isSystemGenerated = false,
        poolPlay = true,
        divisionTypeId = "division-type-open",
        skillDivisionTypeId = "skill-open",
        ageDivisionTypeId = "age-open",
        divisionTypeName = "Open",
        ratingType = "NONE",
        gender = "MIXED",
        maxParticipants = 4.0,
        poolCount = 1.0,
        poolTeamCount = 4.0,
        fieldIds = listOf(fieldId),
    )
    val draft = EventEditorDraftDto(
        basics = EventEditorBasicsDto(
            name = "Room Tournament",
            description = "Accepted Room graph fixture",
            eventType = "TOURNAMENT",
            sportIds = listOf("Indoor Volleyball"),
            start = start,
            timeZone = "UTC",
            location = "Room Test Center",
            address = "1 Room Way",
            affiliateUrl = "https://example.test/room-tournament",
            state = "UNPUBLISHED",
        ),
        participation = EventEditorParticipationDto(
            teamSignup = true,
            singleDivision = true,
            registrationByDivisionType = true,
            teamSizeLimit = 2,
            maxParticipants = 4,
            registrationCutoffHours = 48,
            allowTeamSplitDefault = false,
        ),
        registration = EventEditorRegistrationDto(
            payment = EventEditorPaymentDto(
                mode = "FREE",
                priceCents = 0,
                taxHandling = "NONE",
                organizerManualTaxRateBps = 0,
                allowPaymentPlans = false,
            ),
        ),
        competition = EventEditorCompetitionDto(
            divisionIds = listOf("division-open"),
            divisionDetails = listOf(division),
            divisionFieldIds = mapOf(
                "division-open" to listOf(fieldId),
            ),
            doubleElimination = false,
            includePlayoffs = false,
            splitLeaguePlayoffDivisions = false,
            usesSets = false,
            matchDurationMinutes = 45.0,
            gamesPerOpponent = 1,
        ),
        schedule = EventEditorScheduleDto(
            mode = "FIXED_END",
            endConstraint = end,
            isAutomatedScheduling = true,
        ),
        resources = EventEditorResourcesDto(
            fieldIds = listOf(fieldId),
            fields = listOf(field),
            timeSlotIds = listOf(timeSlotId),
            timeSlots = listOf(timeSlot),
        ),
        staff = EventEditorStaffDto(
            doTeamsOfficiate = false,
            teamOfficialsMaySwap = false,
            teamCheckInMode = "EVENT",
            teamCheckInOpenMinutesBefore = 30,
            allowMatchRosterEdits = true,
            allowTemporaryMatchPlayers = false,
            autoCreatePointMatchIncidents = false,
        ),
    )
    val eventResponse = EventApiDto(
        id = eventId,
        name = draft.basics.name,
        description = draft.basics.description,
        divisions = listOf("division-open", phaseDivisionId),
        divisionDetails = listOf(
            DivisionDetail(
                id = "division-open",
                kind = "LEAGUE",
                key = "open",
                name = "Open Pool",
                divisionTypeId = "division-type-open",
                divisionTypeName = "Open",
                ratingType = "NONE",
                gender = "MIXED",
                skillDivisionTypeId = "skill-open",
                ageDivisionTypeId = "age-open",
                maxParticipants = 4,
                poolCount = 1,
                poolTeamCount = 4,
                fieldIds = listOf(fieldId),
            ),
            DivisionDetail(
                id = phaseDivisionId,
                sourceDivisionId = "division-open",
                kind = "POOL",
                key = "open-pool",
                name = "Open Pool Phase",
                divisionTypeId = "division-type-open",
                divisionTypeName = "Open",
                ratingType = "NONE",
                gender = "MIXED",
                skillDivisionTypeId = "skill-open",
                ageDivisionTypeId = "age-open",
                maxParticipants = 4,
                poolCount = 1,
                poolTeamCount = 4,
                fieldIds = listOf(fieldId),
            ),
        ),
        location = draft.basics.location,
        address = draft.basics.address,
        start = start,
        end = end,
        timeZone = "UTC",
        hostId = null,
        affiliateUrl = draft.basics.affiliateUrl,
        eventType = "TOURNAMENT",
        isAutomatedScheduling = true,
        teamSignup = true,
        singleDivision = true,
        registrationByDivisionType = true,
        fieldIds = listOf(fieldId),
        sportIds = draft.basics.sportIds,
        timeSlotIds = listOf(timeSlotId),
        maxParticipants = 4,
        includePlayoffs = false,
        matchDurationMinutes = 45,
        state = "UNPUBLISHED",
        fields = listOf(
            Field(
                id = fieldId,
                fieldNumber = 1,
                divisions = listOf("division-open", phaseDivisionId),
                sportIds = draft.basics.sportIds,
                name = field.name,
                location = field.location,
                organizationId = null,
            ),
        ),
        timeSlots = listOf(
            TimeSlotDTO(
                id = timeSlotId,
                dayOfWeek = 6,
                daysOfWeek = listOf(6),
                divisions = listOf("division-open", phaseDivisionId),
                startTimeMinutes = 480,
                endTimeMinutes = 1080,
                startDate = start,
                timeZone = "UTC",
                repeating = false,
                endDate = end,
                scheduledFieldId = fieldId,
                scheduledFieldIds = listOf(fieldId),
            ),
        ),
    )
    val match = MatchApiDto(
        id = "match-room-tournament",
        matchId = 1,
        eventId = eventId,
        start = "2026-08-15T08:00:00Z",
        end = "2026-08-15T08:45:00Z",
        placementState = "PLACED",
        phase = "POOL",
        sourceDivisionId = "division-open",
        phaseDivisionId = phaseDivisionId,
        division = phaseDivisionId,
        fieldId = fieldId,
    )
    val projection = EventEditorMatchProjectionDto(
        id = match.id!!,
        matchId = match.matchId,
        eventId = eventId,
        start = match.start,
        end = match.end,
        placementState = "PLACED",
        phase = "POOL",
        sourceDivisionId = "division-open",
        phaseDivisionId = phaseDivisionId,
        division = phaseDivisionId,
        fieldId = fieldId,
    )
    val graph = EventEditorCreateProposalGraphDto(
        event = eventResponse,
        matches = listOf(match),
    )
    val scheduleOutcome = EventEditorScheduleOutcomeDto(
        status = EventEditorScheduleOutcomeStatus.BUILT,
        matchCount = 1,
        matches = listOf(projection),
    )
    val snapshot = EventEditorSnapshotDto(
        contractVersion = 3,
        draft = draft,
        mode = "CREATE",
        eventId = null,
        editorRevision = "room-editor-revision",
        staffRevision = "room-staff-revision",
        capabilities = EventEditorCapabilitiesDto(
            canUseOnlinePayments = false,
            canManageStaff = true,
            canEdit = true,
            supportsTeamStaffing = true,
        ),
        catalogs = com.razumly.mvp.core.network.dto.EventEditorCatalogsDto(),
        immutable = EventEditorImmutableDto(),
        scheduleState = EventEditorScheduleStateDto(
            matchCount = 1,
            revision = "room-schedule-revision",
            hasProtectedHistory = false,
        ),
    )
    val acceptedSnapshot = snapshot.copy(
        mode = "EDIT",
        eventId = eventId,
    )
    val expectedRevisions = EventEditorExpectedCreateRevisionsDto(
        editorRevision = snapshot.editorRevision,
        staffRevision = snapshot.staffRevision,
        scheduleRevision = snapshot.scheduleState.revision,
    )
    val command = EventEditorCreateCommandDto(
        contractVersion = 3,
        createOperationId = "room-tournament-operation",
        expectedRevisions = expectedRevisions,
        draft = draft,
        completion = EventEditorCreateCompletionDto(EventEditorCreateCompletionMode.CREATE_AND_BUILD_SCHEDULE),
        hasScheduleProposalSupport = true,
    )
    val proposal = EventEditorCreateProposalDto(
        status = "PROPOSED",
        createOperationId = command.createOperationId,
        eventId = eventId,
        proposalRevision = "room-proposal-revision",
        expectedRevisions = expectedRevisions,
        completion = command.completion,
        snapshot = snapshot,
        revisionBinding = EventEditorRevisionBindingDto(
            editorRevision = snapshot.editorRevision,
            staffRevision = snapshot.staffRevision,
            scheduleRevision = snapshot.scheduleState.revision,
            fieldRevisions = mapOf(fieldId to "room-field-revision"),
            timeSlotRevisions = mapOf(timeSlotId to "room-slot-revision"),
            availabilityRevision = "room-availability-revision",
        ),
        scheduleOutcome = scheduleOutcome,
        graph = graph,
    )
    val saved = EventEditorSaveResultDto(
        status = "SAVED",
        snapshot = acceptedSnapshot,
        staffEmailDelivery = "NOT_REQUESTED",
        scheduleOutcome = scheduleOutcome,
        graph = graph,
    )
    return EventRepositoryRoomPersistence_TournamentFixture(
        eventId = eventId,
        fieldId = fieldId,
        timeSlotId = timeSlotId,
        phaseDivisionId = phaseDivisionId,
        command = command,
        draft = draft,
        proposal = proposal,
        saved = saved,
        eventResponse = eventResponse,
    )
}
private fun roomMaintenanceGraphPlayoffConfig(): EventEditorMaintenanceGraphPlayoffConfigDto =
    EventEditorMaintenanceGraphPlayoffConfigDto(
        doubleElimination = false,
        winnerSetCount = 1,
        loserSetCount = 1,
        winnerBracketPointsToVictory = emptyList(),
        loserBracketPointsToVictory = emptyList(),
        prize = "",
        fieldCount = 1,
        restTimeMinutes = 0,
    )

private fun roomMaintenanceGraphEvent(
    eventId: String,
    divisionDetails: List<EventEditorMaintenanceGraphDivisionDto> = emptyList(),
    fieldId: String = "field-room-maintenance",
    fieldDivisions: List<String> = emptyList(),
): EventEditorMaintenanceGraphEventDto {
    val start = "2026-08-15T08:00:00Z"
    val end = "2026-08-15T18:00:00Z"
    val field = EventEditorMaintenanceGraphFieldDto(
        id = fieldId,
        organizationId = null,
        divisions = fieldDivisions,
        name = "Maintenance Court",
    )
    return EventEditorMaintenanceGraphEventDto(
        id = eventId,
        name = "Room Maintenance Event",
        description = "",
        start = start,
        end = end,
        location = "",
        coordinates = null,
        price = null,
        minAge = null,
        maxAge = null,
        rating = null,
        imageId = null,
        hostId = null,
        noFixedEndDateTime = false,
        scheduleEndConstraint = end,
        generatedScheduleEnd = end,
        state = "UNPUBLISHED",
        maxParticipants = 4,
        teamSizeLimit = 2,
        restTimeMinutes = 0,
        teamSignup = true,
        singleDivision = true,
        waitListIds = emptyList(),
        freeAgentIds = emptyList(),
        teamIds = emptyList(),
        userIds = emptyList(),
        fieldIds = listOf(fieldId),
        timeSlotIds = emptyList(),
        officialIds = emptyList(),
        staffingPriority = "BEST_AVAILABLE_COVERAGE",
        officialPositions = emptyList(),
        eventOfficials = emptyList(),
        matchRulesOverride = null,
        autoCreatePointMatchIncidents = false,
        resolvedMatchRules = null,
        cancellationRefundHours = null,
        registrationCutoffHours = 0,
        seedColor = null,
        eventType = "TOURNAMENT",
        sportIds = emptyList(),
        leagueScoringConfigId = null,
        organizationId = null,
        requiredTemplateIds = emptyList(),
        allowPaymentPlans = false,
        installmentCount = 0,
        installmentDueDates = emptyList(),
        installmentDueRelativeDays = emptyList(),
        installmentAmounts = emptyList(),
        allowTeamSplitDefault = false,
        splitLeaguePlayoffDivisions = false,
        divisions = divisionDetails.map(EventEditorMaintenanceGraphDivisionDto::id),
        divisionDetails = divisionDetails,
        playoffDivisionDetails = emptyList(),
        fields = listOf(field),
        teams = emptyList(),
        timeSlots = emptyList(),
        officials = emptyList(),
    )
}

private fun assertAcceptedRoomMaintenanceMatch(match: MatchMVP) {
    assertEquals("2026-08-15T08:00:00Z", match.start?.toString())
    assertEquals("2026-08-15T08:45:00Z", match.end?.toString())
    assertEquals("field-graph", match.fieldId)
    assertNull(match.team1Id)
    assertNull(match.team2Id)
    assertNull(match.teamOfficialId)
    assertFalse(match.locked)
    assertTrue(match.officialIds.isEmpty())
}

private fun roomMaintenanceProtectedMatch(
    eventId: String,
    id: String,
    matchId: Int,
): MatchMVP = requireNotNull(
    MatchApiDto(
        id = id,
        matchId = matchId,
        eventId = eventId,
        team1Id = "local-team-1",
        team2Id = "local-team-2",
        team1Seed = 7,
        team2Seed = 8,
        fieldId = "field-local-protected",
        status = "COMPLETED",
        resultStatus = "FINAL",
        resultType = "WIN",
        actualStart = "2026-08-15T09:05:00Z",
        actualEnd = "2026-08-15T09:50:00Z",
        statusReason = "local-result",
        winnerEventTeamId = "local-team-1",
        start = "2026-08-15T09:00:00Z",
        end = "2026-08-15T10:00:00Z",
        placementState = "PLACED",
        phase = "LOCAL_PHASE",
        sourceDivisionId = "local-source-division",
        phaseDivisionId = "local-phase-division",
        division = "local-division",
        team1Points = listOf(21),
        team2Points = listOf(19),
        side = "LOCAL_SIDE",
        losersBracket = true,
        officialId = "local-official",
        teamOfficialId = "local-team-official",
        officialCheckedIn = true,
        locked = true,
    ).toMatchOrNull(),
)

private fun roomMaintenanceGraphMatch(
    eventId: String,
    id: String,
    matchId: Int,
    fieldId: String,
    placementState: String = "PLACED",
): EventEditorMaintenanceGraphMatchDto {
    val field = EventEditorMaintenanceGraphFieldDto(
        id = fieldId,
        organizationId = "",
        divisions = emptyList(),
        name = "Maintenance Court",
    )
    return EventEditorMaintenanceGraphMatchDto(
        id = id,
        matchId = matchId,
        eventId = eventId,
        start = "2026-08-15T08:00:00Z",
        end = "2026-08-15T08:45:00Z",
        locked = false,
        placementState = placementState,
        phase = "POOL",
        sourceDivisionId = "division-open",
        phaseDivisionId = "division-open",
        division = "division-open",
        fieldId = fieldId,
        team1Id = null,
        team2Id = null,
        team1Seed = null,
        team2Seed = null,
        status = null,
        resultStatus = null,
        resultType = null,
        actualStart = null,
        actualEnd = null,
        statusReason = null,
        winnerEventTeamId = null,
        segments = emptyList(),
        incidents = emptyList(),
        officialIds = emptyList(),
        officialAssignments = emptyList(),
        teamOfficialId = null,
        teamOfficialSeed = JsonNull,
        matchRulesSnapshot = null,
        resolvedMatchRules = null,
        team1Points = emptyList(),
        team2Points = emptyList(),
        losersBracket = false,
        winnerNextMatchId = null,
        loserNextMatchId = null,
        previousLeftId = null,
        previousRightId = null,
        side = null,
        officialCheckedIn = false,
        team1 = null,
        team2 = null,
        teamOfficial = null,
        official = null,
        field = field,
    )
}

private fun roomMaintenanceProjection(
    eventId: String,
    id: String,
    matchId: Int,
    fieldId: String,
    placementState: String = "PLACED",
): EventEditorMatchProjectionDto = EventEditorMatchProjectionDto(
    id = id,
    matchId = matchId,
    eventId = eventId,
    start = "2026-08-15T08:00:00Z",
    end = "2026-08-15T08:45:00Z",
    locked = false,
    placementState = placementState,
    phase = "POOL",
    sourceDivisionId = "division-open",
    phaseDivisionId = "division-open",
    division = "division-open",
    fieldId = fieldId,
)

private fun roomMaintenanceRequest(
    fixture: EventRepositoryRoomPersistence_TournamentFixture,
    operation: EventEditorMaintenanceOperation,
    operationId: String,
): EventEditorMaintenanceRequestDto = EventEditorMaintenanceRequestDto(
    contractVersion = 3,
    eventId = fixture.eventId,
    operation = operation,
    operationId = operationId,
    expectedRevisions = fixture.proposal.revisionBinding,
    participantCount = 4,
    includePlaceholderTeams = false,
)

private fun roomMaintenanceScheduleOutcome(
    matches: List<EventEditorMatchProjectionDto>,
): EventEditorMaintenanceScheduleOutcomeDto {
    val unplacedMatches = matches.filter {
        it.placementState.equals("UNPLACED", ignoreCase = true)
    }
    return EventEditorMaintenanceScheduleOutcomeDto(
        status = if (unplacedMatches.isEmpty()) {
            EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE
        } else {
            EventEditorMaintenanceScheduleOutcomeStatus.INCOMPLETE
        },
        isComplete = unplacedMatches.isEmpty(),
        matchCount = matches.size,
        placedMatchCount = matches.size - unplacedMatches.size,
        unplacedMatchCount = unplacedMatches.size,
        matches = matches,
        unscheduledMatches = emptyList(),
        affectedCompetitionPhases = emptyList(),
        warnings = emptyList(),
    )
}

private fun roomMaintenanceAcceptedResult(
    request: EventEditorMaintenanceRequestDto,
    graph: EventEditorMaintenanceGraphDto,
    protectedMatchIds: List<String>,
): EventEditorMaintenanceAcceptedResultDto {
    val revisionBinding = requireNotNull(request.expectedRevisions)
    return EventEditorMaintenanceAcceptedResultDto(
        status = EventEditorMaintenanceResponseStatus.ACCEPTED,
        contractVersion = request.contractVersion,
        eventId = request.eventId,
        operation = request.operation,
        operationId = request.operationId,
        proposalRevision = "room-maintenance-proposal",
        revisionBinding = revisionBinding,
        graph = graph,
        protectedMatchIds = protectedMatchIds,
        scheduleOutcome = roomMaintenanceScheduleOutcome(graph.matches),
        acceptanceOperationId = "room-maintenance-acceptance",
    )
}

private fun clientContractSiteDirectory(): File =
    System.getenv("MVP_SITE_DIR")?.takeIf(String::isNotBlank)?.let(::File)
        ?: generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
            .map { File(it, "apps/site") }.firstOrNull { File(it, "package.json").isFile }
        ?: error("Cannot find apps/site for the Staffing Priority contract check.")

private fun staffingClientToSiteResult(site: File, caseIndex: Int, command: String): JsonObject =
    jsonMVP.parseToJsonElement(runSiteContract(
        site = site,
        script = "scripts/test-staffing-priority-contract.ts",
        input = "{\"caseIndex\":$caseIndex,\"command\":$command}",
    )).jsonObject

private fun runSiteContract(site: File, script: String, input: String): String {
    val process = ProcessBuilder("node", "--import", "tsx", script)
        .directory(site).redirectErrorStream(true).start()
    val outputReader = java.util.concurrent.CompletableFuture.supplyAsync { process.inputStream.bufferedReader().readText() }
    try {
        process.outputStream.bufferedWriter().use { it.write(input) }
        check(process.waitFor(30, TimeUnit.SECONDS)) { "The site contract check did not finish: $script" }
        val output = outputReader.get(5, TimeUnit.SECONDS)
        check(process.exitValue() == 0) { output }
        return output
    } finally {
        if (process.isAlive) process.destroyForcibly()
    }
}
