package com.razumly.mvp.wear.data

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class WearAuthTokenStoreTest {
    @Test
    fun secureStorageInitializationFailure_refusesTokenReadsAndWrites() {
        val storage = resolveWearAuthTokenStorage {
            throw IllegalStateException("Keystore is unavailable")
        }
        val store = WearAuthTokenStore(storage)

        assertFalse(store.isSecureStorageAvailable)
        assertTrue(store.unavailableMessage.orEmpty().contains("Secure storage is unavailable"))

        val readFailure = assertFailsWith<WearSecureStorageUnavailableException> {
            store.token()
        }
        assertEquals("Keystore is unavailable", readFailure.cause?.message)
        assertFailsWith<WearSecureStorageUnavailableException> {
            store.save(token = "bearer-token", userId = "user_1", label = "Official")
        }
    }

    @Test
    fun availableSecureStorage_persistsAndClearsAuthState() {
        val preferences = FakeWearAuthTokenPreferences()
        val store = WearAuthTokenStore(WearAuthTokenStorage.Available(preferences))

        store.save(token = "bearer-token", userId = " user_1 ", label = " Official ")

        assertTrue(store.isSecureStorageAvailable)
        assertEquals("bearer-token", store.token())
        assertEquals("user_1", store.currentUserId())
        assertEquals("Official", store.currentUserLabel())

        store.clear()

        assertEquals("", store.token())
        assertEquals(null, store.currentUserId())
        assertEquals(null, store.currentUserLabel())
    }
}

private class FakeWearAuthTokenPreferences : WearAuthTokenPreferences {
    private var storedToken: String? = null
    private var storedUserId: String? = null
    private var storedUserLabel: String? = null

    override fun token(): String? = storedToken

    override fun userId(): String? = storedUserId

    override fun userLabel(): String? = storedUserLabel

    override fun save(token: String, userId: String?, label: String?) {
        storedToken = token
        storedUserId = userId
        storedUserLabel = label
    }

    override fun clear() {
        storedToken = null
        storedUserId = null
        storedUserLabel = null
    }
}
