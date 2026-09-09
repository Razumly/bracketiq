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
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.repositories.EventEditorApiException
import com.razumly.mvp.core.data.repositories.EventEditorMutation
import com.razumly.mvp.core.data.repositories.EventEditorSessionMapper
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
import io.ktor.client.plugins.plugin
import io.ktor.client.plugins.HttpSend
import io.ktor.http.encodedPath
import io.ktor.http.content.OutgoingContent
import io.ktor.http.HttpMethod
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.robolectric.RuntimeEnvironment
import java.io.File
import java.net.Socket
import java.net.URI
import java.net.URLDecoder
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.TimeUnit

internal const val MOBILE_TEST_HOST_EMAIL = "host@example.com"
internal const val MOBILE_TEST_HOST_PASSWORD = "password123!"
internal const val MOBILE_TEST_PARTICIPANT_EMAIL = "player@example.com"
internal const val MOBILE_TEST_PARTICIPANT_PASSWORD = "password123!"
internal const val MOBILE_TEST_PARTICIPANT_USER_ID = "user_participant"

private fun decodeEventEditorCommandJson(body: Any): JsonObject? {
    return when (body) {
        is JsonObject -> body
        is OutgoingContent.ByteArrayContent -> runCatching {
            Json.parseToJsonElement(body.bytes().decodeToString()).jsonObject
        }.getOrNull()
        is OutgoingContent.ContentWrapper -> decodeEventEditorCommandJson(body.delegate())
        else -> null
    }
}

private fun decodeEventEditorOperationId(body: Any): String? {
    val json = decodeEventEditorCommandJson(body) ?: return null
    return runCatching {
        json["createOperationId"]?.jsonPrimitive?.content?.takeIf(String::isNotBlank)
    }.getOrNull()
}

internal fun acceptanceRequestJson(body: Any): JsonObject? =
    decodeEventEditorCommandJson(body)

internal fun acceptanceRequestMatchesOperation(body: Any, operationId: String): Boolean =
    operationId.isNotBlank() && decodeEventEditorOperationId(body) == operationId

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
    private val acceptanceObservationOperationId = AtomicReference<String?>(null)
    private val acceptanceObservationRequestObserver = AtomicReference<((JsonObject) -> Unit)?>(null)
    private val acceptancePutDispatchCount = AtomicInteger(0)

    init {
        httpClient.plugin(HttpSend).intercept { request ->
            val observedOperationId = acceptanceObservationOperationId.get()
            if (
                request.method == HttpMethod.Put &&
                request.url.encodedPath.trimEnd('/') == "/api/events/editor" &&
                observedOperationId != null &&
                acceptanceRequestMatchesOperation(request.body, observedOperationId)
            ) {
                acceptancePutDispatchCount.incrementAndGet()
                acceptanceRequestJson(request.body)?.let { body ->
                    acceptanceObservationRequestObserver.get()?.invoke(body)
                }
            }
            execute(request)
        }
    }

    internal suspend fun <T> observeAcceptancePutDispatch(
        operationId: String,
        onRequest: ((JsonObject) -> Unit)? = null,
        block: suspend () -> T,
    ): Pair<T, Int> {
        check(acceptanceObservationOperationId.compareAndSet(null, operationId)) {
            "An acceptance request observation is already active."
        }
        acceptanceObservationRequestObserver.set(onRequest)
        acceptancePutDispatchCount.set(0)
        return try {
            block() to acceptancePutDispatchCount.get()
        } finally {
            acceptanceObservationRequestObserver.set(null)
            acceptanceObservationOperationId.set(null)
        }
    }
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

internal data class PreparedEventEditorCreate(
    val eventId: String,
    val command: EventEditorCreateCommandDto,
    val receiptIdentity: String = command.createOperationId,
    var createDispatchStarted: Boolean = false,
    var createDispatchTerminal: Boolean = false,
    var acceptanceDispatchStarted: Boolean = false,
    var acceptanceDispatchTerminal: Boolean = false,
    var acceptancePutDispatchCount: Int = 0,
    var acceptanceRequestBody: JsonObject? = null,
    var proposal: EventEditorCreateProposalDto? = null,
    var resolvedEventId: String? = null,
)

internal suspend fun MobileApiTestSession.prepareEventEditorCreate(
    event: Event,
    fields: List<Field> = emptyList(),
    timeSlots: List<TimeSlot> = emptyList(),
    operationId: String? = null,
): PreparedEventEditorCreate {
    val bootstrapSession = eventRepository.getEventEditorCreateBootstrap(
        EventEditorBootstrapQueryDto(
            organizationId = event.organizationId,
            eventType = event.eventType.name,
            sportId = event.sportIds.firstOrNull(),
            start = event.start.toString(),
        ),
    ).getOrThrow()
    val session = operationId?.let { id -> bootstrapSession.copy(createOperationId = id) } ?: bootstrapSession
    val mutation = EventEditorMutation(
        canonicalState = session.canonicalState.copy(
            event = event,
            fields = fields,
            timeSlots = timeSlots,
            playoffDivisionDetails = event.divisionDetails.filter { detail ->
                detail.kind.equals("PLAYOFF", ignoreCase = true)
            },
            divisionFieldIds = event.divisionDetails.associate { detail -> detail.id to detail.fieldIds },
        ),
    )
    return PreparedEventEditorCreate(
        eventId = event.id,
        command = EventEditorSessionMapper.toCreateCommand(session, mutation).command,
    )
}

internal suspend fun MobileApiTestSession.createEventThroughEditor(
    event: Event,
    fields: List<Field> = emptyList(),
    timeSlots: List<TimeSlot> = emptyList(),
    operationId: String? = null,
    onPrepared: ((PreparedEventEditorCreate) -> Unit)? = null,
): Event {
    val prepared = prepareEventEditorCreate(
        event = event,
        fields = fields,
        timeSlots = timeSlots,
        operationId = operationId,
    )
    onPrepared?.invoke(prepared)
    prepared.createDispatchStarted = true
    val outcome = try {
        eventRepository.createEventEditor(prepared.command).getOrThrow()
    } catch (failure: EventEditorApiException) {
        prepared.createDispatchTerminal = true
        throw failure
    }
    val accepted = outcome.proposal?.let { proposal ->
        check(database.getEventDao.getEventById(proposal.eventId) == null) {
            "A schedule proposal must not write an Event to Room before acceptance."
        }
        prepared.proposal = proposal
        prepared.acceptanceDispatchStarted = true
        try {
            val (acceptanceOutcome, acceptancePutCount) =
                observeAcceptancePutDispatch(
                    operationId = proposal.createOperationId,
                    onRequest = { body -> prepared.acceptanceRequestBody = body },
                ) {
                    eventRepository.acceptEventEditorProposal(
                        createOperationId = proposal.createOperationId,
                        proposalRevision = proposal.proposalRevision,
                        draft = proposal.snapshot.draft,
                    ).getOrThrow()
                }
            prepared.acceptancePutDispatchCount = acceptancePutCount
            acceptanceOutcome
        } catch (failure: EventEditorApiException) {
            prepared.acceptanceDispatchTerminal = true
            throw failure
        }
    } ?: outcome
    prepared.resolvedEventId = accepted.session.canonicalState.event.id
    return accepted.session.canonicalState.event
}

internal suspend fun MobileApiTestSession.resolveCreatedEventId(
    prepared: PreparedEventEditorCreate,
): String? {
    check(prepared.createDispatchStarted) {
        "Cannot resolve an Event Editor create receipt before command dispatch starts."
    }
    val response = api.post<JsonObject, JsonObject>(
        path = "api/events/editor",
        body = encodeEventEditorCreateCommand(prepared.command),
    )
    return response["snapshot"]
        ?.jsonObject
        ?.get("eventId")
        ?.jsonPrimitive
        ?.content
        ?.takeIf(String::isNotBlank)
}

private const val MOBILE_TOURNAMENT_PURGE_SCRIPT = "purge-mobile-tournament-test-run.mjs"
private const val MOBILE_EVENT_EDITOR_RECEIPT_PURGE_SCRIPT = "purge-mobile-event-editor-receipts.mjs"

private fun normalizedDistinctIds(
    declaredIds: Iterable<String>,
    embeddedIds: Iterable<String?>,
): List<String> {
    val normalizedIds = LinkedHashSet<String>()
    declaredIds.forEach { id ->
        id.trim().takeIf(String::isNotBlank)?.let(normalizedIds::add)
    }
    embeddedIds.forEach { id ->
        id?.trim()?.takeIf(String::isNotBlank)?.let(normalizedIds::add)
    }
    return normalizedIds.toList()
}

private fun jsonArrayOfStrings(values: Iterable<String>): JsonArray =
    JsonArray(values.map { value -> JsonPrimitive(value) })

internal fun mobileTournamentPurgeRequest(
    eventIds: Collection<String>,
    preparedCreates: Collection<PreparedEventEditorCreate>,
    seededOrganizationId: String,
    seededTeamIds: Collection<String>,
): String {
    val operations = preparedCreates.map { prepared ->
        val draft = prepared.command.draft
        val fieldIds = normalizedDistinctIds(
            declaredIds = draft.resources.fieldIds,
            embeddedIds = draft.resources.fields.map { field -> field.id ?: field.legacyId },
        )
        val timeSlotIds = normalizedDistinctIds(
            declaredIds = draft.resources.timeSlotIds,
            embeddedIds = draft.resources.timeSlots.map { timeSlot -> timeSlot.id ?: timeSlot.legacyId },
        )
        buildJsonObject {
            put("draftEventId", prepared.eventId)
            put("resolvedEventId", prepared.resolvedEventId ?: "")
            put("createDispatchStarted", prepared.createDispatchStarted)
            put("createDispatchTerminal", prepared.createDispatchTerminal)
            put("acceptanceDispatchStarted", prepared.acceptanceDispatchStarted)
            put("acceptanceDispatchTerminal", prepared.acceptanceDispatchTerminal)
            put("createOperationId", prepared.receiptIdentity)
            put("fieldIds", jsonArrayOfStrings(fieldIds))
            put("timeSlotIds", jsonArrayOfStrings(timeSlotIds))
            put(
                "divisionIds",
                jsonArrayOfStrings(
                    draft.competition.divisionIds +
                        draft.competition.divisionDetails.map { detail -> detail.id } +
                        draft.competition.playoffDivisionDetails.map { detail -> detail.id },
                ),
            )
        }
    }
    return buildJsonObject {
        put("eventIds", jsonArrayOfStrings(eventIds))
        put("operations", JsonArray(operations))
        put("seededOrganizationId", seededOrganizationId)
        put("seededTeamIds", jsonArrayOfStrings(seededTeamIds))
    }.toString()
}

private fun resolveMobileTournamentPurgeScript(backendDir: File): File {
    val workingDir = File(System.getProperty("user.dir") ?: ".").canonicalFile
    val candidates = listOf(
        File(workingDir, "scripts/$MOBILE_TOURNAMENT_PURGE_SCRIPT"),
        File(workingDir, "apps/mobile/scripts/$MOBILE_TOURNAMENT_PURGE_SCRIPT"),
        File(backendDir.parentFile, "mobile/scripts/$MOBILE_TOURNAMENT_PURGE_SCRIPT"),
    ).map { file -> file.canonicalFile }
    return candidates.firstOrNull { file -> file.isFile }
        ?: error(
            "Could not find the mobile Tournament purge helper. " +
                "Expected $MOBILE_TOURNAMENT_PURGE_SCRIPT in apps/mobile/scripts.",
        )
}

internal fun MobileApiTestSession.purgeMobileTournamentRun(
    eventIds: Collection<String>,
    preparedCreates: Collection<PreparedEventEditorCreate>,
    seededOrganizationId: String,
    seededTeamIds: Collection<String>,
): Unit {
    if (eventIds.isEmpty() && preparedCreates.isEmpty()) return
    val databaseUrl = System.getenv("MVP_TEST_DATABASE_URL")
        ?.trim()
        ?.takeIf(String::isNotEmpty)
        ?.let(::validateLocalTestDatabaseUrl)
        ?: error(
            "Mobile Tournament cleanup requires MVP_TEST_DATABASE_URL to be a validated local PostgreSQL URL.",
        )
    require(
        System.getenv("MVP_TEST_DISABLE_OUTBOUND_PROVIDERS")
            ?.trim()
            ?.lowercase() in setOf("1", "true", "yes"),
    ) {
        "Mobile Tournament cleanup requires MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1."
    }
    val backendDir = resolveBackendDir()
    val script = resolveMobileTournamentPurgeScript(backendDir)
    val process = ProcessBuilder("node", script.absolutePath)
        .directory(backendDir)
        .redirectErrorStream(true)
        .apply {
            environment()["MVP_TEST_DATABASE_URL"] = databaseUrl
            environment()["MVP_SITE_DIR"] = backendDir.absolutePath
        }
        .start()
    process.outputStream.bufferedWriter(Charsets.UTF_8).use { writer ->
        writer.write(
            mobileTournamentPurgeRequest(
                eventIds = eventIds,
                preparedCreates = preparedCreates,
                seededOrganizationId = seededOrganizationId,
                seededTeamIds = seededTeamIds,
            ),
        )
        writer.newLine()
    }
    val finished = process.waitFor(45, TimeUnit.SECONDS)
    if (!finished) {
        process.destroyForcibly()
        val output = process.inputStream.bufferedReader().use { reader -> reader.readText() }
        error("Timed out running the mobile Tournament purge helper.\n$output")
    }
    val output = process.inputStream.bufferedReader().use { reader -> reader.readText() }
    if (process.exitValue() != 0) {
        error(
            "Mobile Tournament purge helper failed with exit code ${process.exitValue()}.\n$output",
        )
    }
}

private fun resolveMobileEventEditorReceiptPurgeScript(backendDir: File): File {
    val workingDir = File(System.getProperty("user.dir") ?: ".").canonicalFile
    val candidates = listOf(
        File(workingDir, "scripts/$MOBILE_EVENT_EDITOR_RECEIPT_PURGE_SCRIPT"),
        File(workingDir, "apps/mobile/scripts/$MOBILE_EVENT_EDITOR_RECEIPT_PURGE_SCRIPT"),
        File(backendDir.parentFile, "mobile/scripts/$MOBILE_EVENT_EDITOR_RECEIPT_PURGE_SCRIPT"),
    ).map { file -> file.canonicalFile }
    return candidates.firstOrNull { file -> file.isFile }
        ?: error(
            "Could not find the mobile Event Editor receipt purge helper. " +
                "Expected $MOBILE_EVENT_EDITOR_RECEIPT_PURGE_SCRIPT in apps/mobile/scripts.",
        )
}

internal fun mobileEventEditorReceiptPurgeRequest(
    eventIds: Collection<String>,
    preparedCreates: Collection<PreparedEventEditorCreate>,
): String {
    val operations = preparedCreates.map { prepared ->
        buildJsonObject {
            put("createOperationId", prepared.receiptIdentity)
            put("createDispatchStarted", prepared.createDispatchStarted)
            put("createDispatchTerminal", prepared.createDispatchTerminal)
            put("eventId", prepared.resolvedEventId ?: "")
        }
    }
    return buildJsonObject {
        put("eventIds", jsonArrayOfStrings(eventIds))
        put("operations", JsonArray(operations))
    }.toString()
}

internal fun MobileApiTestSession.purgeMobileEventEditorReceipts(
    eventIds: Collection<String>,
    preparedCreates: Collection<PreparedEventEditorCreate>,
): List<String> {
    if (eventIds.isEmpty() && preparedCreates.isEmpty()) return emptyList()
    val databaseUrl = System.getenv("MVP_TEST_DATABASE_URL")
        ?.trim()
        ?.takeIf(String::isNotEmpty)
        ?.let(::validateLocalTestDatabaseUrl)
        ?: error(
            "Mobile Event Editor cleanup requires MVP_TEST_DATABASE_URL to be a validated local PostgreSQL URL.",
        )
    require(
        System.getenv("MVP_TEST_DISABLE_OUTBOUND_PROVIDERS")
            ?.trim()
            ?.lowercase() in setOf("1", "true", "yes"),
    ) {
        "Mobile Event Editor cleanup requires MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1."
    }
    val backendDir = resolveBackendDir()
    val script = resolveMobileEventEditorReceiptPurgeScript(backendDir)
    val process = ProcessBuilder("node", script.absolutePath)
        .directory(backendDir)
        .redirectErrorStream(true)
        .apply {
            environment()["MVP_TEST_DATABASE_URL"] = databaseUrl
            environment()["MVP_SITE_DIR"] = backendDir.absolutePath
        }
        .start()
    process.outputStream.bufferedWriter(Charsets.UTF_8).use { writer ->
        writer.write(
            mobileEventEditorReceiptPurgeRequest(
                eventIds = eventIds,
                preparedCreates = preparedCreates,
            ),
        )
        writer.newLine()
    }
    val finished = process.waitFor(45, TimeUnit.SECONDS)
    if (!finished) {
        process.destroyForcibly()
        val output = process.inputStream.bufferedReader().use { reader -> reader.readText() }
        error("Timed out running the mobile Event Editor receipt purge helper.\n$output")
    }
    val output = process.inputStream.bufferedReader().use { reader -> reader.readText() }
    if (process.exitValue() != 0) {
        error(
            "Mobile Event Editor receipt purge helper failed with exit code ${process.exitValue()}.\n$output",
        )
    }
    val result = Json.parseToJsonElement(output.trim()).jsonObject
    val residualReceiptRows = result["residualReceiptRows"]?.jsonArray ?: JsonArray(emptyList())
    check(residualReceiptRows.isEmpty()) {
        "Mobile Event Editor receipt purge helper reported residual receipt rows: $residualReceiptRows"
    }
    return result["eventIds"]?.jsonArray
        ?.mapNotNull { value -> value.jsonPrimitive.content.takeIf(String::isNotBlank) }
        .orEmpty()
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

private fun sha256Hex(raw: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
        .digest(raw.toByteArray(Charsets.UTF_8))
    val hex = "0123456789abcdef"
    return buildString(digest.size * 2) {
        digest.forEach { byte ->
            val value = byte.toInt() and 0xff
            append(hex[value ushr 4])
            append(hex[value and 0x0f])
        }
    }
}

internal fun mobileApiBackendTestIsolationReady(): Boolean {
    val databaseUrl = System.getenv("MVP_TEST_DATABASE_URL")
        ?.trim()
        ?.takeIf(String::isNotEmpty)
        ?.let { raw -> runCatching { validateLocalTestDatabaseUrl(raw) }.getOrNull() }
        ?: return false
    val expectedDatabaseUrlHash = sha256Hex(databaseUrl)
    val session = runCatching { MobileApiTestSession.create() }.getOrElse { return false }
    return try {
        runBlocking {
            val response = session.api.getAppVersionIsolationProbe()
            response.outboundProvidersDisabled &&
                response.databaseUrlHash == expectedDatabaseUrlHash
        }
    } catch (_: Exception) {
        false
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
    val databaseUrl = resolveComposeDatabaseUrl(backendDir)
    val command = if (isWindows()) {
        listOf("cmd", "/c", "npm", "run", "seed:dev")
    } else {
        listOf("npm", "run", "seed:dev")
    }
    val process = ProcessBuilder(command)
        .directory(backendDir)
        .redirectErrorStream(true)
        .apply {
            environment()["DATABASE_URL"] = databaseUrl
            environment()["DATABASE_URL_LIVE"] = databaseUrl
        }
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

private val LOCAL_LOOPBACK_HOSTS = setOf("localhost", "127.0.0.1", "::1", "[::1]")
private fun validateLocalBackendBaseUrl(raw: String): String {
    val uri = runCatching { URI(raw) }.getOrNull()
    require(uri != null) {
        "MVP_TEST_BACKEND_URL must be a valid local HTTP URL."
    }
    require(uri.scheme?.lowercase() in setOf("http", "https")) {
        "MVP_TEST_BACKEND_URL must use http or https."
    }
    require(uri.userInfo == null && uri.host?.lowercase() in LOCAL_LOOPBACK_HOSTS) {
        "MVP_TEST_BACKEND_URL must use a loopback host with no credentials."
    }
    return raw
}

private val LOCAL_DATABASE_TARGET_OVERRIDE_PARAMETERS =
    setOf("connectionstring", "host", "hostaddr", "port", "socket", "target_session_attrs")

internal fun validateLocalTestDatabaseUrl(raw: String): String {
    val uri = runCatching { URI(raw) }.getOrNull()
    require(uri != null) {
        "MVP_TEST_DATABASE_URL must be a valid local PostgreSQL URL."
    }
    require(uri.scheme?.lowercase() in setOf("postgresql", "postgres")) {
        "MVP_TEST_DATABASE_URL must use the PostgreSQL URL scheme."
    }
    require(uri.host?.lowercase() in LOCAL_LOOPBACK_HOSTS) {
        "MVP_TEST_DATABASE_URL must use a loopback host."
    }
    val queryParameterNames = uri.rawQuery
        ?.split('&')
        ?.mapNotNull { parameter ->
            parameter.substringBefore('=')
                .takeIf(String::isNotBlank)
                ?.let { URLDecoder.decode(it, "UTF-8").lowercase() }
        }
        ?.toSet()
        .orEmpty()
    require(queryParameterNames.none { it in LOCAL_DATABASE_TARGET_OVERRIDE_PARAMETERS }) {
        "MVP_TEST_DATABASE_URL must not override its local PostgreSQL target."
    }
    val databaseName = uri.path?.removePrefix("/")
    require(!databaseName.isNullOrBlank() && '/' !in databaseName) {
        "MVP_TEST_DATABASE_URL must name one local test database."
    }
    val normalizedDatabaseName = databaseName.lowercase()
    require(listOf("prod", "production", "live").none(normalizedDatabaseName::contains)) {
        "MVP_TEST_DATABASE_URL must not target a production database."
    }
    require(
        normalizedDatabaseName.startsWith("mvp") ||
            listOf("test", "dev", "local", "e2e", "ci").any(normalizedDatabaseName::contains) ||
            normalizedDatabaseName == "bracketiq_repeating_time_slots",
    ) {
        "MVP_TEST_DATABASE_URL must name an mvp, test, dev, local, e2e, ci, or bracketiq_repeating_time_slots database."
    }
    return raw
}


private fun resolveComposeDatabaseUrl(backendDir: File): String {
    val explicitOverride = System.getenv("MVP_TEST_DATABASE_URL")
        ?.trim()
        ?.takeIf(String::isNotEmpty)
    if (explicitOverride != null) return validateLocalTestDatabaseUrl(explicitOverride)
    if (isWindows()) {
        error(
            "MVP_TEST_DATABASE_URL is required on Windows when MVP_TEST_ALLOW_DB_SEED is enabled.",
        )
    }
    val launcher = listOf(
        File(System.getProperty("user.dir") ?: ".", "scripts/ensure-local-backend.sh"),
        File(backendDir.parentFile, "mobile/scripts/ensure-local-backend.sh"),
    ).firstOrNull(File::isFile)
    requireNotNull(launcher) {
        "Could not find the local backend launcher. Run the test from apps/mobile or set MVP_TEST_DATABASE_URL."
    }
    val process = ProcessBuilder("bash", launcher.absolutePath, "--print-database-url")
        .directory(backendDir)
        .redirectErrorStream(true)
        .start()
    val finished = process.waitFor(30, TimeUnit.SECONDS)
    if (!finished) {
        process.destroyForcibly()
        error("Timed out deriving the local Compose database URL.")
    }
    val output = process.inputStream.bufferedReader().use { reader -> reader.readText() }
    check(process.exitValue() == 0) {
        "Could not derive the local Compose database URL: $output"
    }
    return validateLocalTestDatabaseUrl(output.trim())
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
        val validatedOverride = validateLocalBackendBaseUrl(explicitOverride)
        return validatedOverride.takeIf(::isReachable)
            ?: error("Unable to connect to MVP_TEST_BACKEND_URL=$validatedOverride.")
    }

    val candidates = listOf(
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3010",
        "http://localhost:3000",
        "http://localhost:3010",
    )
    return candidates.firstOrNull(::isReachable)
        ?: error("Unable to connect to the local BracketIQ site backend on ports 3000 or 3010.")
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
    val candidates = listOfNotNull(
        System.getenv("MVP_SITE_DIR")?.takeIf(String::isNotBlank)?.let(::File),
        File(workingDir, "../site"),
    ).map { candidate -> candidate.canonicalFile }

    return candidates.firstOrNull { candidate ->
        candidate.isDirectory && File(candidate, "package.json").isFile
    } ?: error("Unable to locate apps/site for targeted backend seeding.")
}

private fun isWindows(): Boolean {
    return System.getProperty("os.name")?.contains("Windows", ignoreCase = true) == true
}
