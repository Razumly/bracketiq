package com.razumly.mvp.core.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private class GuideCompletionTestDataStore : DataStore<Preferences> {
    private val mutex = Mutex()
    private val state = MutableStateFlow<Preferences>(emptyPreferences())

    override val data: Flow<Preferences> = state

    override suspend fun updateData(transform: suspend (Preferences) -> Preferences): Preferences =
        mutex.withLock {
            transform(state.value).also { updated -> state.value = updated }
        }
}

class CurrentUserDataSourceGuideCompletionTest {
    @Test
    fun completed_guides_are_isolated_by_account_and_survive_account_switches() = runTest {
        val dataSource = CurrentUserDataSource(GuideCompletionTestDataStore())

        dataSource.markGuideCompleted("account-a", "discover")
        dataSource.markGuideCompleted("account-a", "event-overview")
        dataSource.markGuideCompleted("account-b", "schedule")

        assertEquals(
            setOf("discover", "event-overview"),
            dataSource.getCompletedGuideIds("account-a").first(),
        )
        assertEquals(
            setOf("schedule"),
            dataSource.getCompletedGuideIds("account-b").first(),
        )
        assertTrue(dataSource.getCompletedGuideIds("account-c").first().isEmpty())
    }

    @Test
    fun clearing_guides_only_resets_the_requested_account() = runTest {
        val dataSource = CurrentUserDataSource(GuideCompletionTestDataStore())
        dataSource.markGuideCompleted("account-a", "discover")
        dataSource.markGuideCompleted("account-b", "discover")

        dataSource.clearCompletedGuideIds("account-a")

        assertTrue(dataSource.getCompletedGuideIds("account-a").first().isEmpty())
        assertEquals(setOf("discover"), dataSource.getCompletedGuideIds("account-b").first())
    }

    @Test
    fun blank_accounts_cannot_read_or_write_guide_history() = runTest {
        val dataSource = CurrentUserDataSource(GuideCompletionTestDataStore())

        dataSource.markGuideCompleted("", "discover")
        dataSource.clearCompletedGuideIds(" ")

        assertTrue(dataSource.getCompletedGuideIds("").first().isEmpty())
    }

    @Test
    fun legacy_device_global_history_is_never_adopted_by_an_account() = runTest {
        val store = GuideCompletionTestDataStore()
        val dataSource = CurrentUserDataSource(store)
        val legacyKey = stringPreferencesKey("completed_guide_ids")
        store.edit { preferences -> preferences[legacyKey] = "discover,event-overview" }

        assertTrue(dataSource.getCompletedGuideIds("account-a").first().isEmpty())
        assertTrue(dataSource.getCompletedGuideIds("account-b").first().isEmpty())

        dataSource.markGuideCompleted("account-b", "schedule")

        assertEquals(setOf("schedule"), dataSource.getCompletedGuideIds("account-b").first())
        assertFalse(store.data.first().contains(legacyKey))
    }
}
