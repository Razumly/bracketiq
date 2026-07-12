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
    private val expectedPlatform: String
        get() = if (Platform.isIOS) "IOS" else "ANDROID"

    private val trustedUpdateUrl: String
        get() = if (Platform.isIOS) {
            "https://apps.apple.com/us/app/bracketiq/id6746649739"
        } else {
            "https://play.google.com/store/apps/details?id=com.razumly.mvp"
        }

    @Test
    fun checkForUpdate_returns_prompt_for_available_nonbreaking_release() = runTest {
        val repository = repositoryWithResponse(
            response = """
                {
                  "updateAvailable": true,
                  "updateRequired": false,
                  "latestVersion": {
                    "platform": "$expectedPlatform",
                    "versionName": "1.5.7",
                    "buildNumber": 41,
                    "changes": ["Adds update prompts.", "Improves mobile scheduling."],
                    "hasBreakingChanges": false,
                    "updateUrl": "$trustedUpdateUrl"
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
        assertEquals(listOf("1.5.7"), prompt.releases.map { it.versionName })
        assertFalse(prompt.updateRequired)
    }

    @Test
    fun checkForUpdate_accepts_the_shipped_1_6_14_boundary_release() = runTest {
        val currentBuild = if (Platform.isIOS) 78 else 67
        val previousBuild = if (Platform.isIOS) 77 else 66
        val repository = repositoryWithResponse(
            response = """
                {
                  "updateAvailable": true,
                  "updateRequired": false,
                  "latestVersion": {
                    "platform": "$expectedPlatform",
                    "versionName": "1.6.14",
                    "buildNumber": $currentBuild,
                    "changes": [
                      "Adds organization reviews on organization profiles.",
                      "Improves Discover map searches and database-backed event tag filters.",
                      "Makes registration, discount-code, and bill pricing details clearer and more reliable.",
                      "Tags push tokens by platform for more reliable notifications."
                    ],
                    "hasBreakingChanges": false,
                    "updateUrl": "$trustedUpdateUrl"
                  },
                  "releases": [
                    {
                      "platform": "$expectedPlatform",
                      "versionName": "1.6.14",
                      "buildNumber": $currentBuild,
                      "changes": [
                        "Adds organization reviews on organization profiles.",
                        "Improves Discover map searches and database-backed event tag filters.",
                        "Makes registration, discount-code, and bill pricing details clearer and more reliable.",
                        "Tags push tokens by platform for more reliable notifications."
                      ],
                      "hasBreakingChanges": false,
                      "updateUrl": "$trustedUpdateUrl"
                    }
                  ]
                }
            """.trimIndent(),
        )

        val prompt = repository.checkForUpdate().getOrThrow()

        assertNotNull(prompt)
        assertEquals("1.6.14", prompt.versionName)
        assertEquals(currentBuild, prompt.buildNumber)
        assertEquals("$expectedPlatform:1.6.14:$currentBuild", prompt.releaseKey)
        assertTrue(previousBuild < currentBuild)
        assertEquals(
            listOf(
                "Adds organization reviews on organization profiles.",
                "Improves Discover map searches and database-backed event tag filters.",
                "Makes registration, discount-code, and bill pricing details clearer and more reliable.",
                "Tags push tokens by platform for more reliable notifications.",
            ),
            prompt.changes,
        )
        assertFalse(prompt.updateRequired)
    }

    @Test
    fun checkForUpdate_rejects_untrusted_remote_update_url() = runTest {
        val repository = repositoryWithResponse(
            response = """
                {
                  "updateAvailable": true,
                  "updateRequired": true,
                  "latestVersion": {
                    "platform": "$expectedPlatform",
                    "versionName": "1.6.15",
                    "buildNumber": 68,
                    "changes": ["Security update."],
                    "hasBreakingChanges": true,
                    "updateUrl": "intent://malicious.example/#Intent;scheme=https;end"
                  }
                }
            """.trimIndent(),
        )

        assertNull(repository.checkForUpdate().getOrThrow())
    }

    @Test
    fun checkForUpdate_returns_release_sections_for_every_newer_release() = runTest {
        val repository = repositoryWithResponse(
            response = """
                {
                  "updateAvailable": true,
                  "updateRequired": false,
                  "latestVersion": {
                    "platform": "$expectedPlatform",
                    "versionName": "1.5.8",
                    "buildNumber": 42,
                    "changes": ["Adds richer update history."],
                    "hasBreakingChanges": false,
                    "updateUrl": "$trustedUpdateUrl"
                  },
                  "releases": [
                    {
                      "platform": "$expectedPlatform",
                      "versionName": "1.5.6",
                      "buildNumber": 40,
                      "changes": ["Improves event detail division controls."],
                      "hasBreakingChanges": false,
                      "updateUrl": "$trustedUpdateUrl"
                    },
                    {
                      "platform": "$expectedPlatform",
                      "versionName": "1.5.7",
                      "buildNumber": 41,
                      "changes": ["Improves update prompts."],
                      "hasBreakingChanges": false,
                      "updateUrl": "$trustedUpdateUrl"
                    },
                    {
                      "platform": "$expectedPlatform",
                      "versionName": "1.5.8",
                      "buildNumber": 42,
                      "changes": ["Adds richer update history."],
                      "hasBreakingChanges": false,
                      "updateUrl": "$trustedUpdateUrl"
                    }
                  ]
                }
            """.trimIndent(),
        )

        val prompt = repository.checkForUpdate().getOrThrow()

        assertNotNull(prompt)
        assertEquals("1.5.8", prompt.versionName)
        assertEquals(42, prompt.buildNumber)
        assertEquals(
            listOf("1.5.6", "1.5.7", "1.5.8"),
            prompt.releases.map { it.versionName },
        )
        assertEquals(
            listOf(
                "Improves event detail division controls.",
                "Improves update prompts.",
                "Adds richer update history.",
            ),
            prompt.changes,
        )
        assertEquals("$expectedPlatform:1.5.8:42", prompt.releaseKey)
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
                    "platform": "$expectedPlatform",
                    "versionName": "1.5.7",
                    "buildNumber": 41,
                    "changes": ["Adds update prompts."],
                    "hasBreakingChanges": false,
                    "updateUrl": "$trustedUpdateUrl"
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
                    "platform": "$expectedPlatform",
                    "versionName": "1.5.7",
                    "buildNumber": 41,
                    "changes": ["Adds update prompts."],
                    "hasBreakingChanges": false,
                    "updateUrl": "$trustedUpdateUrl"
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
                    "platform": "$expectedPlatform",
                    "versionName": "1.5.7",
                    "buildNumber": 41,
                    "changes": ["Updates the mobile data contract."],
                    "hasBreakingChanges": true,
                    "updateUrl": "$trustedUpdateUrl"
                  }
                }
            """.trimIndent(),
            dataSource = dataSource,
        )

        val prompt = requiredRepository.checkForUpdate().getOrThrow()

        assertNotNull(prompt)
        assertTrue(prompt.updateRequired)
        assertEquals("$expectedPlatform:1.5.7:41", prompt.releaseKey)
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
