package com.razumly.mvp.core.data.repositories

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.daos.EventRegistrationDao
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.configureMvpHttpClient
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Instant

private class RegistrationCacheTestDataStore : DataStore<Preferences> {
    private val mutex = Mutex()
    private val state = MutableStateFlow<Preferences>(emptyPreferences())

    override val data: Flow<Preferences> = state

    override suspend fun updateData(transform: suspend (Preferences) -> Preferences): Preferences =
        mutex.withLock {
            transform(state.value).also { updated -> state.value = updated }
        }
}

private class RegistrationCacheTestDao(
    initialRows: List<EventRegistrationCacheEntry> = emptyList(),
) : EventRegistrationDao {
    private val rows = MutableStateFlow(initialRows)
    var clearCount: Int = 0
        private set

    override suspend fun upsertRegistrations(registrations: List<EventRegistrationCacheEntry>) {
        val byId = rows.value.associateBy(EventRegistrationCacheEntry::id).toMutableMap()
        registrations.forEach { registration -> byId[registration.id] = registration }
        rows.value = byId.values.toList()
    }

    override fun observeRegistrationsForEvent(eventId: String): Flow<List<EventRegistrationCacheEntry>> =
        rows.map { registrations -> registrations.filter { it.eventId == eventId } }

    override suspend fun getRegistrationsForEvent(eventId: String): List<EventRegistrationCacheEntry> =
        rows.value.filter { it.eventId == eventId }

    override suspend fun deleteRegistrationsForEvent(eventId: String) {
        rows.value = rows.value.filterNot { it.eventId == eventId }
    }

    override suspend fun clearAll() {
        clearCount += 1
        rows.value = emptyList()
    }
}

private object RegistrationCacheTestTokenStore : AuthTokenStore {
    override suspend fun get(): String = "token"
    override suspend fun set(token: String) = Unit
    override suspend fun clear() = Unit
}

private fun registrationCacheTestApi(engine: MockEngine): MvpApiClient =
    MvpApiClient(
        http = HttpClient(engine) { configureMvpHttpClient() },
        baseUrl = "http://example.test",
        tokenStore = RegistrationCacheTestTokenStore,
    )

private fun registrationCacheEntry(
    id: String,
    eventId: String,
): EventRegistrationCacheEntry = EventRegistrationCacheEntry(
    id = id,
    eventId = eventId,
    registrantId = "user-1",
    registrantType = "USER",
)

class EventRegistrationCacheCoordinatorTest {
    @Test
    fun same_viewer_sync_uses_watermark_and_persists_only_valid_rows() = runTest {
        val previousSync = Instant.parse("2026-07-14T10:00:00Z")
        val currentSync = Instant.parse("2026-07-14T11:00:00Z")
        val dataSource = CurrentUserDataSource(RegistrationCacheTestDataStore())
        dataSource.saveUserId("viewer-1")
        dataSource.saveRegistrationSyncState("viewer-1", previousSync)
        val dao = RegistrationCacheTestDao()
        val api = registrationCacheTestApi(MockEngine { request ->
            assertEquals("/api/profile/registrations", request.url.encodedPath)
            assertEquals(previousSync.toString(), request.url.parameters["updatedAfter"])
            respond(
                content = """
                    {
                      "registrations": [
                        {
                          "id": " registration-1 ",
                          "eventId": " event-1 ",
                          "registrantId": " viewer-1 ",
                          "registrantType": " USER ",
                          "status": " ACTIVE "
                        },
                        {
                          "eventId": "event-invalid",
                          "registrantId": "viewer-1",
                          "registrantType": "USER"
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        })
        val coordinator = EventRegistrationCacheCoordinator(
            registrationDao = { dao },
            api = api,
            currentUserDataSource = dataSource,
            now = { currentSync },
        )

        coordinator.syncAll()

        assertEquals(0, dao.clearCount)
        assertEquals(
            registrationCacheEntry("registration-1", "event-1").copy(
                registrantId = "viewer-1",
                status = "ACTIVE",
            ),
            dao.getRegistrationsForEvent("event-1").single(),
        )
        assertEquals("viewer-1", dataSource.getRegistrationSyncUserId())
        assertEquals(currentSync, dataSource.getRegistrationSyncStartedAt())
    }

    @Test
    fun viewer_change_clears_previous_rows_and_requests_a_full_snapshot() = runTest {
        val dataSource = CurrentUserDataSource(RegistrationCacheTestDataStore())
        dataSource.saveUserId("viewer-2")
        dataSource.saveRegistrationSyncState(
            userId = "viewer-1",
            startedAt = Instant.parse("2026-07-14T10:00:00Z"),
        )
        val dao = RegistrationCacheTestDao(
            initialRows = listOf(registrationCacheEntry("old", "event-old")),
        )
        val api = registrationCacheTestApi(MockEngine { request ->
            assertTrue(request.url.parameters.isEmpty())
            respond(
                content = """{"registrations":[]}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        })
        val coordinator = EventRegistrationCacheCoordinator(
            registrationDao = { dao },
            api = api,
            currentUserDataSource = dataSource,
        )

        coordinator.syncAll()

        assertEquals(1, dao.clearCount)
        assertTrue(dao.observeRegistrationsForEvent("event-old").first().isEmpty())
        assertEquals("viewer-2", dataSource.getRegistrationSyncUserId())
    }

    @Test
    fun failed_event_refresh_preserves_the_existing_event_snapshot() = runTest {
        val dataSource = CurrentUserDataSource(RegistrationCacheTestDataStore())
        dataSource.saveUserId("viewer-1")
        val existing = registrationCacheEntry("existing", "event-1")
        val dao = RegistrationCacheTestDao(initialRows = listOf(existing))
        val api = registrationCacheTestApi(MockEngine { request ->
            assertEquals("event-1", request.url.parameters["eventId"])
            respond(
                content = """{"error":"temporary failure"}""",
                status = HttpStatusCode.InternalServerError,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        })
        val coordinator = EventRegistrationCacheCoordinator(
            registrationDao = { dao },
            api = api,
            currentUserDataSource = dataSource,
        )

        val result = runCatching { coordinator.syncForEvent(" event-1 ") }

        assertTrue(result.isFailure)
        assertEquals(listOf(existing), dao.getRegistrationsForEvent("event-1"))
    }

    @Test
    fun successful_empty_event_refresh_replaces_only_that_event_snapshot() = runTest {
        val dataSource = CurrentUserDataSource(RegistrationCacheTestDataStore())
        dataSource.saveUserId("viewer-1")
        val other = registrationCacheEntry("other", "event-2")
        val dao = RegistrationCacheTestDao(
            initialRows = listOf(registrationCacheEntry("stale", "event-1"), other),
        )
        val api = registrationCacheTestApi(MockEngine {
            respond(
                content = """{"registrations":[]}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        })
        val coordinator = EventRegistrationCacheCoordinator(
            registrationDao = { dao },
            api = api,
            currentUserDataSource = dataSource,
        )

        coordinator.syncForEvent("event-1")

        assertTrue(dao.getRegistrationsForEvent("event-1").isEmpty())
        assertEquals(listOf(other), dao.getRegistrationsForEvent("event-2"))
    }
}
