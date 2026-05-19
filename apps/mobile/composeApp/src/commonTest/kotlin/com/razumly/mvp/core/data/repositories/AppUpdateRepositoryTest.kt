package com.razumly.mvp.core.data.repositories

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.util.Platform
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

private class AppUpdate_InMemoryAuthTokenStore : AuthTokenStore {
    override suspend fun get(): String = ""
    override suspend fun set(token: String) {}
    override suspend fun clear() {}
}

private class AppUpdate_InMemoryPreferencesDataStore(
    initial: Preferences = emptyPreferences(),
) : DataStore<Preferences> {
    private val mutex = Mutex()
    private val state = MutableStateFlow(initial)

    override val data: Flow<Preferences> = state

    override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences): Preferences =
        mutex.withLock {
            val updated = transform(state.value)
            state.value = updated
            updated
        }
}

class AppUpdateRepositoryTest {
    @Test
    fun checkForUpdate_returns_prompt_for_available_nonbreaking_release() = runTest {
        val repository = repositoryWithResponse(
            response = """
                {
                  "updateAvailable": true,
                  "updateRequired": false,
                  "latestVersion": {
                    "platform": "ANDROID",
                    "versionName": "1.5.7",
                    "buildNumber": 41,
                    "changes": ["Adds update prompts.", "Improves mobile scheduling."],
                    "hasBreakingChanges": false,
                    "updateUrl": "https://play.google.com/store/apps/details?id=com.razumly.mvp"
                  }
                }
            """.trimIndent(),
        )

        val prompt = repository.checkForUpdate().getOrThrow()

        assertNotNull(prompt)
        assertEquals("1.5.7", prompt.versionName)
        assertEquals(41, prompt.buildNumber)
        assertEquals(
            listOf("Adds update prompts.", "Improves mobile scheduling."),
            prompt.changes,
        )
        assertFalse(prompt.updateRequired)
    }

    @Test
    fun checkForUpdate_suppresses_dismissed_nonbreaking_release() = runTest {
        val dataSource = CurrentUserDataSource(AppUpdate_InMemoryPreferencesDataStore())
        val repository = repositoryWithResponse(
            response = """
                {
                  "updateAvailable": true,
                  "updateRequired": false,
                  "latestVersion": {
                    "platform": "ANDROID",
                    "versionName": "1.5.7",
                    "buildNumber": 41,
                    "changes": ["Adds update prompts."],
                    "hasBreakingChanges": false,
                    "updateUrl": "https://play.google.com/store/apps/details?id=com.razumly.mvp"
                  }
                }
            """.trimIndent(),
            dataSource = dataSource,
        )
        val prompt = repository.checkForUpdate().getOrThrow()
        assertNotNull(prompt)

        repository.dismiss(prompt)

        assertNull(repository.checkForUpdate().getOrThrow())
    }

    @Test
    fun checkForUpdate_ignores_dismissal_for_required_release() = runTest {
        val dataSource = CurrentUserDataSource(AppUpdate_InMemoryPreferencesDataStore())
        val nonBreakingRepository = repositoryWithResponse(
            response = """
                {
                  "updateAvailable": true,
                  "updateRequired": false,
                  "latestVersion": {
                    "platform": "ANDROID",
                    "versionName": "1.5.7",
                    "buildNumber": 41,
                    "changes": ["Adds update prompts."],
                    "hasBreakingChanges": false,
                    "updateUrl": "https://play.google.com/store/apps/details?id=com.razumly.mvp"
                  }
                }
            """.trimIndent(),
            dataSource = dataSource,
        )
        val dismissedPrompt = nonBreakingRepository.checkForUpdate().getOrThrow()
        assertNotNull(dismissedPrompt)
        nonBreakingRepository.dismiss(dismissedPrompt)

        val requiredRepository = repositoryWithResponse(
            response = """
                {
                  "updateAvailable": true,
                  "updateRequired": true,
                  "latestVersion": {
                    "platform": "ANDROID",
                    "versionName": "1.5.7",
                    "buildNumber": 41,
                    "changes": ["Updates the mobile data contract."],
                    "hasBreakingChanges": true,
                    "updateUrl": "https://play.google.com/store/apps/details?id=com.razumly.mvp"
                  }
                }
            """.trimIndent(),
            dataSource = dataSource,
        )

        val prompt = requiredRepository.checkForUpdate().getOrThrow()

        assertNotNull(prompt)
        assertTrue(prompt.updateRequired)
        assertEquals("ANDROID:1.5.7:41", prompt.releaseKey)
    }

    private fun repositoryWithResponse(
        response: String,
        dataSource: CurrentUserDataSource = CurrentUserDataSource(AppUpdate_InMemoryPreferencesDataStore()),
    ): AppUpdateRepository {
        val engine = MockEngine { request ->
            assertEquals("/api/app-version", request.url.encodedPath)
            assertEquals(if (Platform.isIOS) "IOS" else "ANDROID", request.url.parameters["platform"])
            assertEquals(Platform.appVersionName, request.url.parameters["versionName"])
            Platform.appBuildNumber?.let { buildNumber ->
                assertEquals(buildNumber.toString(), request.url.parameters["buildNumber"])
            }
            respond(
                content = response,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }

        return AppUpdateRepository(
            api = MvpApiClient(http, "http://localhost", AppUpdate_InMemoryAuthTokenStore()),
            currentUserDataSource = dataSource,
        )
    }
}
