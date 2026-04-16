@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import androidx.room.Room
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventRepository
import com.razumly.mvp.core.data.repositories.FieldRepository
import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.repositories.PushDeviceTargetDebugStatus
import com.razumly.mvp.core.data.repositories.SportsRepository
import com.razumly.mvp.core.data.repositories.TeamRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import com.razumly.mvp.core.db.MVPDatabaseService
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.DataStoreAuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.createMvpHttpClient
import com.razumly.mvp.core.network.dto.InviteCreateDto
import com.razumly.mvp.eventDetail.data.MatchRepository
import io.ktor.client.HttpClient
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.net.Socket
import java.net.URI
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class LeaguePlayoffMobileApiIntegrationTest {
    private var hostSession: MobileApiTestSession? = null
    private var participantSession: MobileApiTestSession? = null

    @Before
    fun ensureBackendFixtures() {
        if (backendFixturesReady()) return

        val fixturesPrepared = if (shouldAutoSeedBackendFixtures()) {
            runCatching {
                runTargetedBackendSeed()
                backendFixturesReady()
            }.getOrDefault(false)
        } else {
            false
        }

        assumeTrue(
            "Skipping mobile/backend integration test because backend fixtures are unavailable. " +
                "Automatic backend seeding is disabled unless MVP_TEST_ALLOW_DB_SEED=1.",
            fixturesPrepared,
        )
    }

    @After
    fun tearDown() {
        runCatching { runBlocking { hostSession?.cleanupEvent() } }
        hostSession?.close()
        participantSession?.close()
        hostSession = null
        participantSession = null
    }

    @Test
    fun league_playoff_mobile_api_flow_loads_staff_invites_periphery_join_and_schedule_data() = runTest(timeout = 5.minutes) {
        hostSession = MobileApiTestSession.create()
        participantSession = MobileApiTestSession.create()

        val host = hostSession!!
        val participant = participantSession!!

        val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
        host.cleanupEvent()

        val createdEvent = host.eventRepository.createEvent(
            newEvent = buildLeagueEvent(hostUser.id),
            fields = listOf(buildLeagueField()),
            timeSlots = listOf(buildLeagueTimeSlot()),
        ).getOrThrow()

        assertEquals(UPLOADED_DOCUMENT_IMAGE_ID, createdEvent.imageId)
        assertTrue(createdEvent.includePlayoffs)
        assertEquals(TEST_PLAYOFF_TEAM_COUNT, createdEvent.playoffTeamCount)

        host.userRepository.createInvites(
            invites = staffInvitePayloads(eventId = createdEvent.id, createdBy = hostUser.id),
        ).getOrThrow()

        val scheduledEvent = host.eventRepository.scheduleEvent(createdEvent.id).getOrThrow()
        val scheduledMatches = host.matchRepository.getMatchesOfTournament(createdEvent.id).getOrThrow()

        assertTrue(scheduledEvent.includePlayoffs)
        assertEquals(TEST_PLAYOFF_TEAM_COUNT, scheduledEvent.playoffTeamCount)
        assertTrue(
            scheduledMatches.size > 6,
            "Expected playoff scheduling to add matches beyond the 4-team round robin baseline.",
        )

        val participantUser = participant.userRepository.login(PARTICIPANT_EMAIL, PARTICIPANT_PASSWORD).getOrThrow()
        val loadedEvent = participant.eventRepository.getEvent(createdEvent.id).getOrThrow()
        val loadedInvites = participant.eventRepository.getEventStaffInvites(createdEvent.id).getOrThrow()
        val loadedFields = participant.fieldRepository.getFields(loadedEvent.fieldIds).getOrThrow()
        val loadedTimeSlots = participant.fieldRepository.getTimeSlots(loadedEvent.timeSlotIds).getOrThrow()
        val loadedMatches = participant.matchRepository.getMatchesOfTournament(createdEvent.id).getOrThrow()
        val loadedTeamIds = loadedEvent.teamIds
            .ifEmpty {
                loadedEvent.divisionDetails
                    .flatMap(DivisionDetail::teamIds)
                    .distinct()
            }
            .ifEmpty {
                loadedMatches.flatMap { match ->
                    listOfNotNull(match.team1Id, match.team2Id, match.teamOfficialId)
                }.distinct()
            }
        val loadedSports = participant.sportsRepository.getSports().getOrThrow()

        assertEquals(UPLOADED_DOCUMENT_IMAGE_ID, loadedEvent.imageId)
        assertEquals(SEEDED_SPORT_ID, loadedEvent.sportId)
        assertTrue(loadedEvent.includePlayoffs)
        assertEquals(TEST_PLAYOFF_TEAM_COUNT, loadedEvent.playoffTeamCount)
        assertTrue(
            loadedMatches.any { match ->
                match.previousLeftId != null ||
                    match.previousRightId != null ||
                    match.winnerNextMatchId != null ||
                    match.loserNextMatchId != null
            },
            "Expected the scheduled league payload to include bracket-linked playoff matches.",
        )
        assertEquals(setOf(TEST_FIELD_ID), loadedFields.map(Field::id).toSet())
        assertEquals(setOf(TEST_SLOT_ID), loadedTimeSlots.map(TimeSlot::id).toSet())
        assertEquals(SEEDED_TEAM_IDS.size, loadedTeamIds.size)
        assertTrue(loadedTeamIds.all(String::isNotBlank))
        assertEquals(scheduledMatches.map { it.id }.toSet(), loadedMatches.map { it.id }.toSet())
        assertEquals(STAFF_INVITE_EMAILS, loadedInvites.mapNotNull { it.email }.toSet())
        assertTrue(loadedSports.isNotEmpty(), "Expected sports catalog API to return at least one sport.")

        val joinResult = participant.eventRepository.addCurrentUserToEvent(
            event = loadedEvent,
            preferredDivisionId = SEEDED_DIVISION_ID,
        ).getOrThrow()

        assertFalse(joinResult.requiresParentApproval)
        assertFalse(joinResult.joinedWaitlist)

        val refreshedEvent = participant.eventRepository.getEvent(createdEvent.id).getOrThrow()
        val batchEvents = participant.eventRepository.getEventsByIds(listOf(createdEvent.id)).getOrThrow()
        val batchMatches = participant.matchRepository.getMatchesByEventIds(
            eventIds = listOf(createdEvent.id),
            fieldIds = refreshedEvent.fieldIds,
        ).getOrThrow()
        val mySchedule = participant.eventRepository.getMySchedule().getOrThrow()

        assertEquals(listOf(createdEvent.id), batchEvents.map { it.id })
        assertEquals(loadedMatches.map { it.id }.toSet(), batchMatches.map { it.id }.toSet())
        assertTrue(mySchedule.events.any { it.id == createdEvent.id })
        assertTrue(mySchedule.fields.any { it.id == TEST_FIELD_ID })
    }

    private fun buildLeagueEvent(hostUserId: String): Event {
        return Event(
            id = TEST_EVENT_ID,
            name = "Mobile API League Playoff Regression",
            description = "Native mobile repository coverage for playoff league load and join flows.",
            divisions = listOf(SEEDED_DIVISION_ID),
            divisionDetails = listOf(
                DivisionDetail(
                    id = SEEDED_DIVISION_ID,
                    key = "open",
                    name = "Open",
                    playoffTeamCount = TEST_PLAYOFF_TEAM_COUNT,
                    teamIds = SEEDED_TEAM_IDS,
                    fieldIds = listOf(TEST_FIELD_ID),
                ),
            ),
            location = "Local Sports Complex",
            start = Instant.parse("2026-06-01T08:00:00Z"),
            end = TEST_EVENT_END,
            imageId = UPLOADED_DOCUMENT_IMAGE_ID,
            coordinates = listOf(-122.4194, 37.7749),
            hostId = hostUserId,
            noFixedEndDateTime = false,
            teamSignup = true,
            singleDivision = true,
            teamIds = SEEDED_TEAM_IDS,
            fieldIds = listOf(TEST_FIELD_ID),
            timeSlotIds = listOf(TEST_SLOT_ID),
            sportId = SEEDED_SPORT_ID,
            maxParticipants = SEEDED_TEAM_IDS.size,
            eventType = EventType.LEAGUE,
            gamesPerOpponent = 1,
            includePlayoffs = true,
            playoffTeamCount = TEST_PLAYOFF_TEAM_COUNT,
            usesSets = false,
            matchDurationMinutes = 60,
            restTimeMinutes = 0,
            state = "PUBLISHED",
        )
    }

    private fun buildLeagueField(): Field {
        return Field(
            id = TEST_FIELD_ID,
            fieldNumber = 1,
            name = "Integration Court",
            divisions = listOf(SEEDED_DIVISION_ID),
            rentalSlotIds = listOf(TEST_SLOT_ID),
            location = "Local Sports Complex",
        )
    }

    private fun buildLeagueTimeSlot(): TimeSlot {
        return TimeSlot(
            id = TEST_SLOT_ID,
            dayOfWeek = 0,
            daysOfWeek = listOf(0),
            divisions = listOf(SEEDED_DIVISION_ID),
            startTimeMinutes = 8 * 60,
            endTimeMinutes = 23 * 60,
            startDate = TEST_EVENT_START,
            repeating = true,
            endDate = TEST_EVENT_END,
            scheduledFieldId = TEST_FIELD_ID,
            scheduledFieldIds = listOf(TEST_FIELD_ID),
            price = 0,
        )
    }

    private fun staffInvitePayloads(eventId: String, createdBy: String): List<InviteCreateDto> {
        return listOf(
            InviteCreateDto(
                type = "STAFF",
                email = TEST_HOST_STAFF_EMAIL,
                status = "PENDING",
                staffTypes = listOf("HOST"),
                eventId = eventId,
                createdBy = createdBy,
                firstName = "Host",
                lastName = "Invite",
            ),
            InviteCreateDto(
                type = "STAFF",
                email = TEST_OFFICIAL_STAFF_EMAIL,
                status = "PENDING",
                staffTypes = listOf("OFFICIAL"),
                eventId = eventId,
                createdBy = createdBy,
                firstName = "Official",
                lastName = "Invite",
            ),
        )
    }

    private fun runTargetedBackendSeed() {
        val backendDir = resolveBackendDir()
        val command = if (isWindows()) {
            listOf("cmd", "/c", "npm", "run", "seed:dev")
        } else {
            listOf("npm", "run", "seed:dev")
        }
        val process = ProcessBuilder(command)
            .directory(backendDir)
            .redirectErrorStream(true)
            .start()

        val finished = process.waitFor(2, TimeUnit.MINUTES)
        val output = process.inputStream.bufferedReader().use { reader -> reader.readText() }

        if (!finished) {
            process.destroyForcibly()
            error("Timed out running targeted backend seed in ${backendDir.absolutePath}.")
        }
        if (process.exitValue() != 0) {
            error(
                "Targeted backend seed failed in ${backendDir.absolutePath} with exit code ${process.exitValue()}.\n$output"
            )
        }
    }

    private fun backendFixturesReady(): Boolean {
        val session = runCatching { MobileApiTestSession.create() }.getOrElse { return false }
        return try {
            runBlocking {
                val hostReady = session.userRepository.login(HOST_EMAIL, HOST_PASSWORD).isSuccess
                val participantReady = session.userRepository.login(PARTICIPANT_EMAIL, PARTICIPANT_PASSWORD).isSuccess
                val sportsReady = session.sportsRepository.getSports()
                    .getOrNull()
                    ?.any { it.id == SEEDED_SPORT_ID } == true
                hostReady && participantReady && sportsReady
            }
        } finally {
            session.close()
        }
    }

    private fun resolveBackendDir(): File {
        val workingDir = File(System.getProperty("user.dir") ?: ".")
        val userHome = System.getProperty("user.home")?.takeIf(String::isNotBlank)?.let(::File)
        val candidates = listOfNotNull(
            System.getenv("MVP_SITE_DIR")?.takeIf(String::isNotBlank)?.let(::File),
            File(workingDir, "../mvp-site"),
            File(workingDir, "../../mvp-site"),
            userHome?.let { File(it, "Documents/Code/mvp-site") },
            File("/mnt/c/Users/samue/Documents/Code/mvp-site"),
            File("/Users/elesesy/StudioProjects/mvp-site"),
        ).map { candidate -> candidate.canonicalFile }

        return candidates.firstOrNull { candidate ->
            candidate.isDirectory && File(candidate, "package.json").isFile
        } ?: error("Unable to locate the mvp-site workspace for targeted backend seeding.")
    }

    private fun isWindows(): Boolean {
        return System.getProperty("os.name")?.contains("Windows", ignoreCase = true) == true
    }
}

private class MobileApiTestSession private constructor(
    val api: MvpApiClient,
    val httpClient: HttpClient,
    val database: MVPDatabaseService,
    val userRepository: UserRepository,
    val eventRepository: EventRepository,
    val fieldRepository: FieldRepository,
    val teamRepository: TeamRepository,
    val matchRepository: MatchRepository,
    val sportsRepository: SportsRepository,
) {
    suspend fun cleanupEvent() {
        runCatching {
            api.deleteNoResponse("api/events/$TEST_EVENT_ID")
        }
    }

    fun close() {
        httpClient.close()
        database.close()
    }

    companion object {
        fun create(): MobileApiTestSession {
            val context = RuntimeEnvironment.getApplication().applicationContext as Context
            val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(context)
                .allowMainThreadQueries()
                .build()

            val tokenPrefs = InMemoryPreferencesDataStore()
            val userPrefs = InMemoryPreferencesDataStore()
            val tokenStore = DataStoreAuthTokenStore(tokenPrefs)
            val currentUserDataSource = CurrentUserDataSource(userPrefs)
            val httpClient = createMvpHttpClient()
            val apiBaseUrl = resolveReachableBackendBaseUrl()
            val api = MvpApiClient(
                http = httpClient,
                baseUrl = apiBaseUrl,
                tokenStore = tokenStore,
            )

            val userRepository = UserRepository(
                databaseService = database,
                api = api,
                tokenStore = tokenStore,
                currentUserDataSource = currentUserDataSource,
            )
            val teamRepository = TeamRepository(
                api = api,
                databaseService = database,
                userRepository = userRepository,
                pushNotificationRepository = IntegrationNoopPushNotificationsRepository,
            )
            val eventRepository = EventRepository(
                databaseService = database,
                api = api,
                teamRepository = teamRepository,
                userRepository = userRepository,
            )
            val fieldRepository = FieldRepository(
                api = api,
                databaseService = database,
            )
            val matchRepository = MatchRepository(
                api = api,
                databaseService = database,
            )
            val sportsRepository = SportsRepository(api = api)

            return MobileApiTestSession(
                api = api,
                httpClient = httpClient,
                database = database,
                userRepository = userRepository,
                eventRepository = eventRepository,
                fieldRepository = fieldRepository,
                teamRepository = teamRepository,
                matchRepository = matchRepository,
                sportsRepository = sportsRepository,
            )
        }
    }
}

private object IntegrationNoopPushNotificationsRepository : IPushNotificationsRepository {
    override suspend fun subscribeUserToTeamNotifications(userId: String, teamId: String) = Result.success(Unit)
    override suspend fun unsubscribeUserFromTeamNotifications(userId: String, teamId: String) = Result.success(Unit)
    override suspend fun subscribeUserToEventNotifications(userId: String, eventId: String) = Result.success(Unit)
    override suspend fun unsubscribeUserFromEventNotifications(userId: String, eventId: String) = Result.success(Unit)
    override suspend fun subscribeUserToMatchNotifications(userId: String, matchId: String) = Result.success(Unit)
    override suspend fun unsubscribeUserFromMatchNotifications(userId: String, matchId: String) = Result.success(Unit)
    override suspend fun subscribeUserToChatGroup(userId: String, chatGroupId: String) = Result.success(Unit)
    override suspend fun unsubscribeUserFromChatGroup(userId: String, chatGroupId: String) = Result.success(Unit)
    override suspend fun sendUserNotification(userId: String, title: String, body: String) = Result.success(Unit)
    override suspend fun sendTeamNotification(teamId: String, title: String, body: String) = Result.success(Unit)
    override suspend fun sendEventNotification(eventId: String, title: String, body: String, isTournament: Boolean) =
        Result.success(Unit)
    override suspend fun sendMatchNotification(matchId: String, title: String, body: String) = Result.success(Unit)
    override suspend fun sendChatGroupNotification(chatGroupId: String, title: String, body: String) =
        Result.success(Unit)
    override suspend fun createTeamTopic(team: com.razumly.mvp.core.data.dataTypes.Team) = Result.success(Unit)
    override suspend fun deleteTopic(id: String) = Result.success(Unit)
    override suspend fun createEventTopic(event: Event) = Result.success(Unit)
    override suspend fun createTournamentTopic(event: Event) = Result.success(Unit)
    override suspend fun createChatGroupTopic(chatGroup: com.razumly.mvp.core.data.dataTypes.ChatGroup) =
        Result.success(Unit)
    override fun setActiveChat(chatGroupId: String?) = Unit
    override suspend fun addDeviceAsTarget() = Result.success(Unit)
    override suspend fun removeDeviceAsTarget() = Result.success(Unit)
    override suspend fun getDeviceTargetDebugStatus(syncBeforeCheck: Boolean) =
        Result.success(PushDeviceTargetDebugStatus())
}

private class InMemoryPreferencesDataStore(
    initial: Preferences = emptyPreferences(),
) : DataStore<Preferences> {
    private val mutex = Mutex()
    private val state = MutableStateFlow(initial)

    override val data: Flow<Preferences> = state

    override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences): Preferences {
        return mutex.withLock {
            val updated = transform(state.value)
            state.value = updated
            updated
        }
    }
}

private fun resolveReachableBackendBaseUrl(): String {
    val explicitOverride = System.getenv("MVP_TEST_BACKEND_URL")
        ?.trim()
        ?.takeIf(String::isNotEmpty)
    val candidates = linkedSetOf<String>().apply {
        explicitOverride?.let(::add)
        add("http://127.0.0.1:3000")
        add("http://127.0.0.1:3010")
        add("http://localhost:3000")
        add("http://localhost:3010")
    }
    return candidates.firstOrNull { baseUrl -> isReachable(baseUrl) }
        ?: error("Unable to connect to the local mvp-site backend on ports 3000 or 3010.")
}

private fun shouldAutoSeedBackendFixtures(): Boolean {
    return when (System.getenv("MVP_TEST_ALLOW_DB_SEED")?.trim()?.lowercase()) {
        "1", "true", "yes" -> true
        else -> false
    }
}

private fun isReachable(baseUrl: String): Boolean {
    val uri = runCatching { URI(baseUrl) }.getOrNull() ?: return false
    val host = uri.host ?: return false
    val port = if (uri.port > 0) uri.port else 80
    return runCatching {
        Socket(host, port).use { socket ->
            socket.soTimeout = 1_000
        }
    }.isSuccess
}

private const val HOST_EMAIL = "host@example.com"
private const val HOST_PASSWORD = "password123!"
private const val PARTICIPANT_EMAIL = "player@example.com"
private const val PARTICIPANT_PASSWORD = "password123!"
private const val PARTICIPANT_USER_ID = "user_participant"
private const val SEEDED_DIVISION_ID = "division_open"
private const val SEEDED_SPORT_ID = "Indoor Volleyball"
private const val UPLOADED_DOCUMENT_IMAGE_ID = "camka_upload_upscaled_cc_indoor_sports_024be2e8d5cdead5_jpg"
private const val TEST_EVENT_ID = "mobile_api_league_playoff_regression"
private const val TEST_FIELD_ID = "mobile_api_league_playoff_field"
private const val TEST_SLOT_ID = "mobile_api_league_playoff_slot"
private const val TEST_PLAYOFF_TEAM_COUNT = 4
private const val TEST_HOST_STAFF_EMAIL = "mobile-api-host-invite@example.test"
private const val TEST_OFFICIAL_STAFF_EMAIL = "mobile-api-official-invite@example.test"

private val SEEDED_TEAM_IDS = listOf("team_1", "team_2", "team_3", "team_4")
private val STAFF_INVITE_EMAILS = setOf(TEST_HOST_STAFF_EMAIL, TEST_OFFICIAL_STAFF_EMAIL)
private val TEST_EVENT_START: Instant = Instant.parse("2026-06-01T08:00:00Z")
private val TEST_EVENT_END: Instant = Instant.parse("2026-07-27T23:00:00Z")
