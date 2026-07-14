package com.razumly.mvp.core.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import com.razumly.mvp.core.util.jsonMVP
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

private class RegistrationDraftTestDataStore : DataStore<Preferences> {
    private val mutex = Mutex()
    private val state = MutableStateFlow<Preferences>(emptyPreferences())

    override val data: Flow<Preferences> = state

    override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences): Preferences =
        mutex.withLock {
            val updated = transform(state.value)
            state.value = updated
            updated
        }
}

private fun registrationDraft(
    userId: String,
    updatedAt: String,
    answer: String = userId,
    holdExpiresAt: String? = null,
): RegistrationProgressDraft =
    RegistrationProgressDraft(
        scope = "event",
        userId = userId,
        eventId = "event-1",
        answers = mapOf("answer" to answer),
        holdExpiresAt = holdExpiresAt,
        updatedAt = updatedAt,
    )

class CurrentUserDataSourceRegistrationDraftTest {
    @Test
    fun drafts_are_isolated_by_active_account_and_cleanup_preserves_other_accounts() = runTest {
        val evaluatedAt = Instant.parse("2026-07-13T18:00:00Z")
        val store = RegistrationDraftTestDataStore()
        val dataSource = CurrentUserDataSource(store) { evaluatedAt }
        val key = "event:shared:event-1:none:none"

        dataSource.saveUserId("account-a")
        dataSource.saveRegistrationProgress(
            key = key,
            draft = registrationDraft("account-a", evaluatedAt.toString(), answer = "answer-a"),
        )
        dataSource.saveUserId("account-b")
        dataSource.saveRegistrationProgress(
            key = key,
            draft = registrationDraft("account-b", evaluatedAt.toString(), answer = "answer-b"),
        )

        assertEquals("answer-b", dataSource.loadRegistrationProgress(key)?.answers?.get("answer"))
        dataSource.saveUserId("account-a")
        assertEquals("answer-a", dataSource.loadRegistrationProgress(key)?.answers?.get("answer"))

        dataSource.clearRegistrationProgressForAccount("account-a")

        assertNull(dataSource.loadRegistrationProgress(key))
        dataSource.saveUserId("account-b")
        assertEquals("answer-b", dataSource.loadRegistrationProgress(key)?.answers?.get("answer"))
    }

    @Test
    fun account_namespace_allows_a_registration_subject_distinct_from_the_signed_in_account() = runTest {
        val evaluatedAt = Instant.parse("2026-07-13T18:00:00Z")
        val store = RegistrationDraftTestDataStore()
        val dataSource = CurrentUserDataSource(store) { evaluatedAt }
        val key = "event:dependent-child:event-1:none:none"
        dataSource.saveUserId("parent-account")

        dataSource.saveRegistrationProgress(
            key = key,
            draft = registrationDraft("dependent-child", evaluatedAt.toString(), answer = "child-answer"),
        )

        assertEquals("dependent-child", dataSource.loadRegistrationProgress(key)?.userId)
        dataSource.clearRegistrationProgressForAccount("parent-account")
        assertNull(dataSource.loadRegistrationProgress(key))
    }

    @Test
    fun draft_without_payment_hold_expires_after_bounded_lifetime() = runTest {
        val savedAt = Instant.parse("2026-07-13T18:00:00Z")
        var evaluatedAt = savedAt
        val store = RegistrationDraftTestDataStore()
        val dataSource = CurrentUserDataSource(store) { evaluatedAt }
        val key = "event:account-a:event-1:none:none"
        dataSource.saveUserId("account-a")
        dataSource.saveRegistrationProgress(
            key = key,
            draft = registrationDraft("account-a", savedAt.toString()),
        )

        evaluatedAt = savedAt.plus(23.hours)
        assertNotNull(dataSource.loadRegistrationProgress(key))

        evaluatedAt = savedAt.plus(24.hours)
        assertNull(dataSource.loadRegistrationProgress(key))
        assertTrue(
            store.data.first().asMap().keys.none { preferenceKey ->
                preferenceKey.name.startsWith("account_registration_progress_")
            },
        )
    }

    @Test
    fun payment_hold_expiry_is_enforced_before_the_general_draft_lifetime() = runTest {
        val savedAt = Instant.parse("2026-07-13T18:00:00Z")
        var evaluatedAt = savedAt
        val store = RegistrationDraftTestDataStore()
        val dataSource = CurrentUserDataSource(store) { evaluatedAt }
        val key = "event:account-a:event-with-hold:none:none"
        dataSource.saveUserId("account-a")
        dataSource.saveRegistrationProgress(
            key = key,
            draft = registrationDraft(
                userId = "account-a",
                updatedAt = savedAt.toString(),
                holdExpiresAt = savedAt.plus(2.hours).toString(),
            ),
        )

        evaluatedAt = savedAt.plus(1.hours)
        assertNotNull(dataSource.loadRegistrationProgress(key))
        evaluatedAt = savedAt.plus(2.hours)
        assertNull(dataSource.loadRegistrationProgress(key))
    }

    @Test
    fun malformed_or_future_expiry_metadata_is_rejected_and_removed() = runTest {
        val evaluatedAt = Instant.parse("2026-07-13T18:00:00Z")
        val store = RegistrationDraftTestDataStore()
        val dataSource = CurrentUserDataSource(store) { evaluatedAt }
        dataSource.saveUserId("account-a")

        val malformedUpdatedKey = "event:account-a:malformed-updated:none:none"
        store.edit { preferences ->
            preferences[stringPreferencesKey("registration_progress_$malformedUpdatedKey")] =
                jsonMVP.encodeToString(registrationDraft("account-a", "not-an-instant"))
        }
        assertNull(dataSource.loadRegistrationProgress(malformedUpdatedKey))

        val malformedHoldKey = "event:account-a:malformed-hold:none:none"
        store.edit { preferences ->
            preferences[stringPreferencesKey("registration_progress_$malformedHoldKey")] =
                jsonMVP.encodeToString(
                    registrationDraft(
                        userId = "account-a",
                        updatedAt = evaluatedAt.toString(),
                        holdExpiresAt = "not-an-instant",
                    ),
                )
        }
        assertNull(dataSource.loadRegistrationProgress(malformedHoldKey))

        val futureUpdatedKey = "event:account-a:future-updated:none:none"
        store.edit { preferences ->
            preferences[stringPreferencesKey("registration_progress_$futureUpdatedKey")] =
                jsonMVP.encodeToString(
                    registrationDraft("account-a", evaluatedAt.plus(1.hours).toString()),
                )
        }
        assertNull(dataSource.loadRegistrationProgress(futureUpdatedKey))
        assertTrue(
            store.data.first().asMap().keys.none { preferenceKey ->
                preferenceKey.name.startsWith("registration_progress_")
            },
        )
    }

    @Test
    fun valid_legacy_draft_migrates_into_the_authenticated_account_namespace() = runTest {
        val evaluatedAt = Instant.parse("2026-07-13T18:00:00Z")
        val store = RegistrationDraftTestDataStore()
        val dataSource = CurrentUserDataSource(store) { evaluatedAt }
        val key = "event:account-a:event-1:none:none"
        val legacyPreferenceKey = stringPreferencesKey("registration_progress_$key")
        dataSource.saveUserId("account-a")
        store.edit { preferences ->
            preferences[legacyPreferenceKey] = jsonMVP.encodeToString(
                registrationDraft("account-a", evaluatedAt.toString(), answer = "legacy-answer"),
            )
        }

        assertEquals("legacy-answer", dataSource.loadRegistrationProgress(key)?.answers?.get("answer"))

        val preferenceNames = store.data.first().asMap().keys.map { preferenceKey -> preferenceKey.name }
        assertTrue(legacyPreferenceKey.name !in preferenceNames)
        assertTrue(preferenceNames.any { name -> name.startsWith("account_registration_progress_") })
    }

    @Test
    fun legacy_draft_with_no_trustworthy_account_owner_is_not_migrated() = runTest {
        val evaluatedAt = Instant.parse("2026-07-13T18:00:00Z")
        val store = RegistrationDraftTestDataStore()
        val dataSource = CurrentUserDataSource(store) { evaluatedAt }
        val key = "event:dependent-child:event-1:none:none"
        dataSource.saveUserId("parent-account")
        store.edit { preferences ->
            preferences[stringPreferencesKey("registration_progress_$key")] = jsonMVP.encodeToString(
                registrationDraft("dependent-child", evaluatedAt.toString()),
            )
        }

        assertNull(dataSource.loadRegistrationProgress(key))
        assertTrue(
            store.data.first().asMap().keys.none { preferenceKey ->
                preferenceKey.name.startsWith("account_registration_progress_")
            },
        )
    }
}
