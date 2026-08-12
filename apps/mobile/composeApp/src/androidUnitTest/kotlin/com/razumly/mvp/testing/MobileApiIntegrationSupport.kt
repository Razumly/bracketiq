package com.razumly.mvp.testing

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import androidx.room.Room
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.repositories.EventRepository
import com.razumly.mvp.core.data.repositories.FieldRepository
import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.repositories.PushDeviceTargetDebugStatus
import com.razumly.mvp.core.data.repositories.SportsRepository
import com.razumly.mvp.core.data.repositories.TeamRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import com.razumly.mvp.core.db.MVPDatabaseService
import com.razumly.mvp.core.network.DataStoreAuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.createMvpHttpClient
import com.razumly.mvp.core.network.dto.*
import com.razumly.mvp.eventDetail.data.MatchRepository
import io.ktor.client.HttpClient
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.robolectric.RuntimeEnvironment
import java.io.File
import java.net.Socket
import java.net.URI
import java.util.concurrent.TimeUnit

internal const val MOBILE_TEST_HOST_EMAIL = "host@example.com"
internal const val MOBILE_TEST_HOST_PASSWORD = "password123!"
internal const val MOBILE_TEST_PARTICIPANT_EMAIL = "player@example.com"
internal const val MOBILE_TEST_PARTICIPANT_PASSWORD = "password123!"
internal const val MOBILE_TEST_PARTICIPANT_USER_ID = "user_participant"

internal class MobileApiTestSession private constructor(
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
    suspend fun deleteEvent(eventId: String) {
        if (eventId.isBlank()) return
        runCatching { api.deleteNoResponse("api/events/$eventId") }
    }

    suspend fun deleteTeam(teamId: String) {
        if (teamId.isBlank()) return
        runCatching { api.deleteNoResponse("api/teams/$teamId") }
    }

    fun close() {
        eventRepository.close()
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
            val api = MvpApiClient(
                http = httpClient,
                baseUrl = resolveReachableBackendBaseUrl(),
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

internal suspend fun MobileApiTestSession.createEventThroughEditor(
    event: Event,
    fields: List<Field> = emptyList(),
    timeSlots: List<TimeSlot> = emptyList(),
    operationId: String = "mobile-editor-create-${event.id}",
): Event {
    val bootstrap = eventRepository.getEventEditorCreateBootstrap(
        EventEditorBootstrapQueryDto(
            organizationId = event.organizationId,
            eventType = event.eventType.name,
            sportId = event.sportIds.firstOrNull(),
            start = event.start.toString(),
        ),
    ).getOrThrow()
    val draft = bootstrap.snapshot.draft.toEditorDraft(event, fields, timeSlots)
    return eventRepository.createEventEditor(
        EventEditorCreateCommandDto(
            contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
            createOperationId = operationId,
            draft = draft,
        ),
    ).getOrThrow().session.canonicalState.event
}

private fun EventEditorDraftDto.toEditorDraft(
    event: Event,
    fields: List<Field>,
    timeSlots: List<TimeSlot>,
): EventEditorDraftDto {
    fun DivisionDetail.toDto(): EventEditorDivisionDetailDto = EventEditorDivisionDetailDto(
        id = id,
        sourceDivisionId = sourceDivisionId,
        key = key,
        name = name,
        kind = kind ?: "LEAGUE",
        divisionTypeId = divisionTypeId,
        skillDivisionTypeId = skillDivisionTypeId,
        ageDivisionTypeId = ageDivisionTypeId,
        divisionTypeName = divisionTypeName,
        ratingType = ratingType,
        gender = gender,
        price = price?.toDouble(),
        maxParticipants = maxParticipants?.toDouble(),
        playoffTeamCount = playoffTeamCount?.toDouble(),
        poolCount = poolCount?.toDouble(),
        poolTeamCount = poolTeamCount?.toDouble(),
        allowPaymentPlans = allowPaymentPlans,
        installmentCount = installmentCount?.toDouble(),
        installmentDueDates = installmentDueDates,
        installmentDueRelativeDays = installmentDueRelativeDays,
        installmentAmounts = installmentAmounts,
        ageCutoffDate = ageCutoffDate,
        ageCutoffLabel = ageCutoffLabel,
        ageCutoffSource = ageCutoffSource,
        fieldIds = fieldIds,
        playoffPlacementDivisionIds = playoffPlacementDivisionIds,
        playoffConfig = null,
        gamesPerOpponent = gamesPerOpponent?.toDouble(),
        restTimeMinutes = restTimeMinutes?.toDouble(),
        usesSets = usesSets,
        matchDurationMinutes = matchDurationMinutes?.toDouble(),
        setDurationMinutes = setDurationMinutes?.toDouble(),
        setsPerMatch = setsPerMatch?.toDouble(),
        pointsToVictory = pointsToVictory,
        phaseSettings = null,
        teamIds = teamIds,
    )

    return copy(
        basics = basics.copy(
            name = event.name,
            description = event.description,
            eventType = event.eventType.name,
            sportIds = event.sportIds,
            start = event.start.toString(),
            timeZone = event.timeZone,
            location = event.location,
            address = event.address.orEmpty(),
            coordinates = event.coordinates,
            affiliateUrl = event.affiliateUrl.orEmpty(),
            organizationId = event.organizationId,
            hostId = event.hostId,
            state = event.state.takeUnless { it == "DRAFT" } ?: "UNPUBLISHED",
            imageId = event.imageId.takeIf(String::isNotBlank),
            tags = event.tags.map { tag ->
                EventEditorTagDto(id = tag.id, slug = tag.slug, name = tag.name)
            },
        ),
        participation = participation.copy(
            teamSignup = event.teamSignup,
            singleDivision = event.singleDivision,
            registrationByDivisionType = event.registrationByDivisionType,
            teamSizeLimit = event.teamSizeLimit.takeIf { it > 0 },
            maxParticipants = event.maxParticipants.takeIf { it > 0 },
            minAge = event.minAge,
            maxAge = event.maxAge,
            cancellationRefundHours = event.cancellationRefundHours,
            registrationCutoffHours = event.registrationCutoffHours,
            allowTeamSplitDefault = event.allowTeamSplitDefault == true,
            waitListIds = event.waitListIds,
            freeAgentIds = event.freeAgentIds,
        ),
        registration = registration.copy(
            payment = registration.payment.copy(
                mode = event.registrationPaymentMode,
                priceCents = event.priceCents,
                manualPaymentInstructions = event.manualPaymentInstructions,
                manualPaymentLinks = event.manualPaymentLinks.map { link ->
                    EventEditorManualPaymentLinkDto(
                        id = link.id.takeIf(String::isNotBlank),
                        provider = link.provider,
                        label = link.label,
                        url = link.url,
                    )
                },
                allowPaymentPlans = event.allowPaymentPlans == true,
                installmentCount = event.installmentCount,
                installmentDueDates = event.installmentDueDates,
                installmentDueRelativeDays = event.installmentDueRelativeDays,
                installmentAmounts = event.installmentAmounts,
            ),
        ),
        competition = competition.copy(
            divisionIds = event.divisions,
            divisionDetails = event.divisionDetails
                .filterNot { detail -> detail.kind.equals("PLAYOFF", ignoreCase = true) }
                .map(DivisionDetail::toDto),
            playoffDivisionDetails = event.divisionDetails
                .filter { detail -> detail.kind.equals("PLAYOFF", ignoreCase = true) }
                .map(DivisionDetail::toDto),
            divisionFieldIds = event.divisionDetails.associate { detail -> detail.id to detail.fieldIds },
            winnerSetCount = event.winnerSetCount,
            loserSetCount = event.loserSetCount.takeIf { it > 0 },
            doubleElimination = event.doubleElimination,
            includePlayoffs = event.includePlayoffs,
            splitLeaguePlayoffDivisions = event.splitLeaguePlayoffDivisions,
            playoffTeamCount = event.playoffTeamCount,
            pointsToVictory = event.pointsToVictory,
            winnerBracketPointsToVictory = event.winnerBracketPointsToVictory,
            loserBracketPointsToVictory = event.loserBracketPointsToVictory,
            usesSets = event.usesSets,
            setsPerMatch = event.setsPerMatch,
            setDurationMinutes = event.setDurationMinutes?.toDouble(),
            restTimeMinutes = event.restTimeMinutes?.toDouble(),
            matchDurationMinutes = event.matchDurationMinutes?.toDouble(),
            gamesPerOpponent = event.gamesPerOpponent,
        matchRulesOverride = null,
        ),
        schedule = schedule.copy(
            mode = if (event.noFixedEndDateTime) "GENERATED_END" else "FIXED_END",
            endConstraint = event.end.toString().takeUnless { event.noFixedEndDateTime },
            generatedScheduleEnd = event.end.toString().takeIf { event.noFixedEndDateTime },
        ),
        resources = EventEditorResourcesDto(
            fieldIds = fields.map(Field::id),
            fields = fields.map { field ->
                EventEditorFieldDto(
                    id = field.id,
                    name = field.name,
                    location = field.location,
                    lat = field.lat,
                    long = field.long,
                    inUse = field.inUse,
                    rentalSlotIds = field.rentalSlotIds,
                    organizationId = field.organizationId,
                    facilityId = field.facilityId,
                )
            },
            timeSlotIds = timeSlots.map(TimeSlot::id),
            timeSlots = timeSlots.map { slot ->
                EventEditorTimeSlotDto(
                    id = slot.id,
                    dayOfWeek = slot.dayOfWeek,
                    daysOfWeek = slot.daysOfWeek.orEmpty(),
                    startTimeMinutes = slot.startTimeMinutes,
                    endTimeMinutes = slot.endTimeMinutes,
                    startDate = slot.startDate.toString(),
                    endDate = slot.endDate?.toString(),
                    timeZone = slot.timeZone,
                    scheduledFieldId = slot.scheduledFieldId,
                    scheduledFieldIds = slot.scheduledFieldIds.orEmpty(),
                    divisions = slot.divisions.orEmpty(),
                    requiredTemplateIds = slot.requiredTemplateIds,
                    hostRequiredTemplateIds = slot.hostRequiredTemplateIds,
                    repeating = slot.repeating,
                    price = slot.price?.toDouble(),
                    sourceType = slot.sourceType,
                    rentalBookingId = slot.rentalBookingId,
                    rentalBookingItemId = slot.rentalBookingItemId,
                    rentalLocked = slot.rentalLocked,
                )
            },
            requiredTemplateIds = event.requiredTemplateIds,
            rentalBookingId = resources.rentalBookingId,
            rentalBookingItemId = resources.rentalBookingItemId,
        ),
        staff = EventEditorStaffDto(
            officialSchedulingMode = when (event.officialSchedulingMode) {
                OfficialSchedulingMode.STAFFING -> "STAFFING"
                OfficialSchedulingMode.TEAM_STAFFING -> "TEAM_STAFFING"
                OfficialSchedulingMode.SCHEDULE -> "SCHEDULE"
                OfficialSchedulingMode.OFF -> "OFF"
            },
            teamOfficialsMaySwap = event.teamOfficialsMaySwap == true,
            teamCheckInMode = event.teamCheckInMode.name,
            teamCheckInOpenMinutesBefore = event.teamCheckInOpenMinutesBefore,
            allowMatchRosterEdits = event.allowMatchRosterEdits,
            allowTemporaryMatchPlayers = event.allowTemporaryMatchPlayers,
            autoCreatePointMatchIncidents = event.autoCreatePointMatchIncidents,
            officialIds = event.officialIds,
            officialPositions = event.officialPositions.map { position ->
                EventEditorOfficialPositionDto(
                    id = position.id,
                    name = position.name,
                    count = position.count,
                    order = position.order,
                )
            },
            eventOfficials = event.eventOfficials.map { official ->
                EventEditorOfficialDto(
                    id = official.id,
                    userId = official.userId,
                    positionIds = official.positionIds,
                    fieldIds = official.fieldIds,
                    isActive = official.isActive,
                )
            },
            assistantHostIds = event.assistantHostIds,
        ),
    )
}

internal fun mobileApiLoginFixturesReady(vararg credentials: Pair<String, String>): Boolean {
    val session = runCatching { MobileApiTestSession.create() }.getOrElse { return false }
    return try {
        runBlocking {
            credentials.all { (email, password) ->
                session.userRepository.login(email, password).isSuccess
            }
        }
    } finally {
        session.close()
    }

}

internal fun runBackendSeedThenCheck(
    seed: () -> Unit,
    fixturesReady: () -> Boolean,
): Boolean {
    val seedSucceeded = try {
        seed()
        true
    } catch (_: Exception) {
        false
    }
    return seedSucceeded && fixturesReady()
}


internal fun runTargetedBackendSeed() {
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

internal fun shouldAutoSeedBackendFixtures(): Boolean {
    return when (System.getenv("MVP_TEST_ALLOW_DB_SEED")?.trim()?.lowercase()) {
        "1", "true", "yes" -> true
        else -> false
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
    override suspend fun createTeamTopic(team: Team) = Result.success(Unit)
    override suspend fun deleteTopic(id: String) = Result.success(Unit)
    override suspend fun createEventTopic(event: Event) = Result.success(Unit)
    override suspend fun createTournamentTopic(event: Event) = Result.success(Unit)
    override suspend fun createChatGroupTopic(chatGroup: ChatGroup) = Result.success(Unit)
    override fun setActiveChat(chatGroupId: String?) = Unit
    override fun clearActiveChatIfMatches(chatGroupId: String?) = Unit
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
    if (explicitOverride != null) {
        return explicitOverride.takeIf(::isReachable)
            ?: error("Unable to connect to MVP_TEST_BACKEND_URL=$explicitOverride.")
    }

    val candidates = listOf(
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3010",
        "http://localhost:3000",
        "http://localhost:3010",
    )
    return candidates.firstOrNull(::isReachable)
        ?: error("Unable to connect to the local mvp-site backend on ports 3000 or 3010.")
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
