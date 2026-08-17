package com.razumly.mvp.core.network

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.test.Test
import kotlin.test.assertEquals

class AuthTokenStoreTest {
    @Test
    fun set_get_clear_round_trip() = runTest {
        // In JVM unit tests on Windows, DataStore file renames can be flaky due to file locking.
        // This test focuses on DataStoreAuthTokenStore behavior by using an in-memory DataStore.
        val store = DataStoreAuthTokenStore(InMemoryPreferencesDataStore())

        assertEquals("", store.get())

        store.set("t1")
        assertEquals("t1", store.get())

        store.clear()
        assertEquals("", store.get())
    }
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
