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
