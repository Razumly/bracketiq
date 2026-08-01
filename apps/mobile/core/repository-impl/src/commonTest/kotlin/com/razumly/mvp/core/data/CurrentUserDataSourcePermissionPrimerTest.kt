package com.razumly.mvp.core.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private class PermissionPrimerTestDataStore : DataStore<Preferences> {
    private val mutex = Mutex()
    private val state = MutableStateFlow<Preferences>(emptyPreferences())

    override val data: Flow<Preferences> = state

    override suspend fun updateData(transform: suspend (Preferences) -> Preferences): Preferences =
        mutex.withLock {
            transform(state.value).also { updated -> state.value = updated }
        }
}

class CurrentUserDataSourcePermissionPrimerTest {
    @Test
    fun permission_primer_preferences_default_to_not_suppressed_or_handled() = runTest {
        val dataSource = CurrentUserDataSource(PermissionPrimerTestDataStore())

        assertFalse(dataSource.isLocationPermissionPrimerSuppressedNow())
        assertFalse(dataSource.isNotificationPermissionPrimerHandledNow())
    }

    @Test
    fun permission_primer_preferences_persist_across_data_source_instances() = runTest {
        val store = PermissionPrimerTestDataStore()
        CurrentUserDataSource(store).apply {
            setLocationPermissionPrimerSuppressed(true)
            setNotificationPermissionPrimerHandled(true)
        }

        val restored = CurrentUserDataSource(store)
        assertTrue(restored.isLocationPermissionPrimerSuppressedNow())
        assertTrue(restored.isNotificationPermissionPrimerHandledNow())
    }
}
